/**
 * Bill.com webhook handler.
 * Receives payment status updates: processing → paid → failed.
 *
 * Bill.com sends webhooks as POST requests with JSON payloads.
 * Webhook events include: SentPay status changes.
 *
 * POST /webhooks/billcom - Receive webhook events
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { BillComClient } from '../services/billcom.js';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import crypto from 'crypto';

// Webhook payload schema (flexible to handle various event types)
const webhookPayloadSchema = z.object({
  event: z.string(),
  data: z.record(z.unknown()).optional(),
  // Bill.com webhook fields
  entity: z.string().optional(),
  id: z.string().optional(),
  status: z.string().optional(),
}).passthrough();

const webhookResponseSchema = z.object({
  received: z.boolean(),
  message: z.string(),
});

/**
 * Verify Bill.com webhook signature.
 * Bill.com signs webhooks with HMAC-SHA256 using the webhook secret.
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !secret) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}

export const billcomWebhookRoutes: FastifyPluginAsync = async (fastify) => {
  // Add raw body support for signature verification
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (req, body, done) => {
      try {
        const parsed = JSON.parse(body as string);
        // Store raw body for signature verification
        (req as { rawBody?: string }).rawBody = body as string;
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  /**
   * POST /webhooks/billcom
   * Handle Bill.com webhook events for payment status updates.
   * No auth required (uses webhook signature verification instead).
   */
  fastify.post('/', {
    schema: {
      body: webhookPayloadSchema,
      response: { 200: webhookResponseSchema },
    },
  }, async (request, reply) => {
    const rawBody = (request as { rawBody?: string }).rawBody;
    const signature = request.headers['x-billcom-signature'] as string | undefined;

    // Verify webhook signature if secret is configured
    if (config.BILLCOM_WEBHOOK_SECRET) {
      if (!verifyWebhookSignature(rawBody || '', signature, config.BILLCOM_WEBHOOK_SECRET)) {
        fastify.log.warn('Bill.com webhook signature verification failed');
        return reply.status(401).send({
          received: false,
          message: 'Invalid webhook signature',
        });
      }
    }

    const payload = request.body as z.infer<typeof webhookPayloadSchema>;

    fastify.log.info({
      event: payload.event,
      entity: payload.entity,
      id: payload.id,
    }, 'Bill.com webhook received');

    // Handle SentPay status change events
    if (payload.event === 'SentPay.status' || payload.entity === 'SentPay') {
      const sentPayId = payload.id || (payload.data?.id as string);
      const newStatus = payload.status || (payload.data?.status as string);

      if (!sentPayId) {
        fastify.log.warn(payload, 'Webhook missing SentPay ID');
        return { received: true, message: 'Missing SentPay ID, skipped' };
      }

      // Map Bill.com numeric status to our status
      const mappedStatus = newStatus
        ? BillComClient.mapPaymentStatus(newStatus)
        : 'unknown';

      fastify.log.info({
        sentPayId,
        rawStatus: newStatus,
        mappedStatus,
      }, 'Processing SentPay status update');

      // Find the payment record by Bill.com payment ID
      const record = await prisma.paymentRecord.findFirst({
        where: {
          OR: [
            { billComPaymentId: sentPayId },
            { paymentRef: sentPayId },
          ],
        },
      });

      if (!record) {
        fastify.log.info({ sentPayId }, 'No payment record found for SentPay ID');
        return { received: true, message: `No record for SentPay ${sentPayId}` };
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
        case 'canceled':
        case 'void':
          updateData.status = 'failed';
          updateData.failureReason = `Bill.com payment ${mappedStatus}`;
          break;
        case 'scheduled':
          updateData.status = 'processing';
          break;
        default:
          fastify.log.info({ mappedStatus }, 'Unhandled payment status, no update');
          return { received: true, message: `Unhandled status: ${mappedStatus}` };
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
      }, 'Payment record updated from webhook');

      return {
        received: true,
        message: `Updated payment ${record.id} to ${updateData.status}`,
      };
    }

    // Log and acknowledge unhandled event types
    fastify.log.info({ event: payload.event }, 'Unhandled webhook event type');
    return { received: true, message: `Event ${payload.event} acknowledged` };
  });
};
