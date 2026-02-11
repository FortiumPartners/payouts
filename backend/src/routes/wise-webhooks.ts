/**
 * Wise webhook handler.
 * Receives transfer status updates from Wise.
 *
 * Wise sends webhooks as POST requests with JSON payloads.
 * Webhook events include: transfers#state-change, balances#credit
 *
 * Wise signs webhooks using RSA-SHA256 with their public key (not HMAC).
 * Set WISE_WEBHOOK_SECRET to the PEM-formatted RSA public key from Wise.
 * Docs: https://docs.wise.com/api-docs/features/webhooks-notifications
 *
 * POST /webhooks/wise - Receive webhook events
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import crypto from 'crypto';

// Webhook payload schema
const wiseWebhookPayloadSchema = z.object({
  event_type: z.string(),
  schema_version: z.string().optional(),
  sent_at: z.string().optional(),
  data: z.object({
    resource: z.object({
      id: z.number().optional(),
      profile_id: z.number().optional(),
      type: z.string().optional(),
    }).passthrough().optional(),
    current_state: z.string().optional(),
    previous_state: z.string().optional(),
    occurred_at: z.string().optional(),
  }).passthrough().optional(),
  subscription_id: z.string().optional(),
}).passthrough();

const webhookResponseSchema = z.object({
  received: z.boolean(),
  message: z.string(),
});

/**
 * Verify Wise webhook signature.
 * Wise uses RSA-SHA256 with their public key for signature verification.
 * The base64-encoded signature is sent in the X-Signature-SHA256 header.
 * See: https://docs.wise.com/api-docs/features/webhooks-notifications
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  publicKeyPem: string
): boolean {
  if (!signature || !publicKeyPem) return false;

  try {
    const publicKey = crypto.createPublicKey({ key: publicKeyPem, format: 'pem' });
    return crypto.verify(
      'RSA-SHA256',
      Buffer.from(payload),
      { key: publicKey, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(signature, 'base64')
    );
  } catch {
    return false;
  }
}

/**
 * Map Wise transfer status to our internal payment status.
 */
function mapWiseStatus(wiseStatus: string): 'processing' | 'paid' | 'failed' | null {
  switch (wiseStatus) {
    case 'outgoing_payment_sent':
      return 'paid';
    case 'cancelled':
    case 'bounced_back':
    case 'funds_refunded':
    case 'charged_back':
      return 'failed';
    case 'incoming_payment_waiting':
    case 'processing':
    case 'funds_converted':
      return 'processing';
    default:
      return null;
  }
}

export const wiseWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Add raw body support for signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        const parsed = JSON.parse(body as string);
        (req as { rawBody?: string }).rawBody = body as string;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  /**
   * POST /webhooks/wise
   * Handle Wise webhook events for transfer status updates.
   * No auth required (uses webhook signature verification instead).
   */
  fastify.post('/', {
    schema: {
      body: wiseWebhookPayloadSchema,
      response: { 200: webhookResponseSchema },
    },
  }, async (request, reply) => {
    const rawBody = (request as { rawBody?: string }).rawBody;
    const signature = request.headers['x-signature-sha256'] as string | undefined;

    // Verify webhook signature if public key is configured
    if (config.WISE_WEBHOOK_SECRET) {
      if (!verifyWebhookSignature(rawBody || '', signature, config.WISE_WEBHOOK_SECRET)) {
        fastify.log.warn('Wise webhook signature verification failed');
        return reply.status(401).send({
          received: false,
          message: 'Invalid webhook signature',
        });
      }
    } else {
      fastify.log.warn('WISE_WEBHOOK_SECRET not configured — webhook signature verification skipped');
    }

    const payload = request.body as z.infer<typeof wiseWebhookPayloadSchema>;

    fastify.log.info({
      event_type: payload.event_type,
      resource_id: payload.data?.resource?.id,
      current_state: payload.data?.current_state,
    }, 'Wise webhook received');

    // Handle transfer state change events
    if (payload.event_type === 'transfers#state-change') {
      const transferId = payload.data?.resource?.id;
      const newState = payload.data?.current_state;
      const previousState = payload.data?.previous_state;

      if (!transferId) {
        fastify.log.warn(payload, 'Webhook missing transfer ID');
        return { received: true, message: 'Missing transfer ID, skipped' };
      }

      const mappedStatus = newState ? mapWiseStatus(newState) : null;

      fastify.log.info({
        transferId,
        previousState,
        newState,
        mappedStatus,
      }, 'Processing Wise transfer status update');

      // Find the payment record by Wise transfer ID
      const record = await prisma.paymentRecord.findFirst({
        where: {
          OR: [
            { wiseTransferId: transferId },
            { paymentRef: String(transferId) },
          ],
        },
      });

      if (!record) {
        fastify.log.info({ transferId }, 'No payment record found for Wise transfer ID');
        return { received: true, message: `No record for transfer ${transferId}` };
      }

      if (!mappedStatus) {
        fastify.log.info({ newState }, 'Unhandled transfer state, no update');
        return { received: true, message: `Unhandled state: ${newState}` };
      }

      // Update payment record based on new status
      const updateData: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      switch (mappedStatus) {
        case 'paid':
          updateData.status = 'paid';
          updateData.paidAt = new Date();
          break;
        case 'failed':
          updateData.status = 'failed';
          updateData.failureReason = `Wise transfer ${newState}`;
          break;
        case 'processing':
          updateData.status = 'processing';
          break;
      }

      await prisma.paymentRecord.update({
        where: { id: record.id },
        data: updateData,
      });

      fastify.log.info({
        paymentRecordId: record.id,
        pcBillId: record.pcBillId,
        oldStatus: record.status,
        newStatus: updateData.status,
      }, 'Payment record updated from Wise webhook');

      return {
        received: true,
        message: `Updated payment ${record.id} to ${updateData.status}`,
      };
    }

    // Handle balance credit events (informational)
    if (payload.event_type === 'balances#credit') {
      fastify.log.info({
        amount: payload.data,
      }, 'Wise balance credit received');
      return { received: true, message: 'Balance credit acknowledged' };
    }

    // Log and acknowledge unhandled event types
    fastify.log.info({ event_type: payload.event_type }, 'Unhandled Wise webhook event type');
    return { received: true, message: `Event ${payload.event_type} acknowledged` };
  });
};
