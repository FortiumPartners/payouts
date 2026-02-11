/**
 * Wise payment execution routes for Canadian partner payments.
 * Handles the validate → quote → transfer → fund → track lifecycle.
 *
 * POST /execute/:billId  - Execute Wise payment for a validated CA bill
 * GET  /:id/status       - Get Wise transfer status
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getWiseClient, WiseError } from '../services/wise.js';
import { getPartnerConnectClient } from '../services/partnerconnect.js';
import { getEmailService } from '../services/email.js';
import { runControlChecks } from '../services/controls.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from './auth.js';

// Schemas
const executeWisePaymentResponseSchema = z.object({
  success: z.boolean(),
  transferId: z.number().optional(),
  paymentRecordId: z.string().optional(),
  billId: z.string(),
  amount: z.number(),
  targetAmount: z.number().optional(),
  targetCurrency: z.string().optional(),
  exchangeRate: z.number().optional(),
  fee: z.number().optional(),
  status: z.string(),
  message: z.string(),
});

const wisePaymentStatusResponseSchema = z.object({
  paymentRecordId: z.string(),
  pcBillId: z.string(),
  payeeName: z.string(),
  amount: z.number(),
  status: z.string(),
  wiseTransferId: z.number().nullable(),
  wiseStatus: z.string().nullable(),
  wiseCurrency: z.string().nullable(),
  wiseExchangeRate: z.number().nullable(),
  wiseTargetAmount: z.number().nullable(),
  wiseFee: z.number().nullable(),
  executedAt: z.string().nullable(),
  executedBy: z.string().nullable(),
  failureReason: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/**
 * Map Wise transfer status to our internal payment status.
 */
function mapWiseTransferStatus(wiseStatus: string): string {
  const statusMap: Record<string, string> = {
    incoming_payment_waiting: 'processing',
    processing: 'processing',
    funds_converted: 'processing',
    outgoing_payment_sent: 'paid',
    cancelled: 'failed',
    bounced_back: 'failed',
    funds_refunded: 'failed',
    charged_back: 'failed',
  };
  return statusMap[wiseStatus] || 'processing';
}

export const wisePaymentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth);

  /**
   * POST /api/payments/wise/execute/:billId
   * Execute a Wise payment for a validated Canadian bill.
   * Flow:
   * 1. Fetch bill from PartnerConnect
   * 2. Run control checks (must all pass)
   * 3. Look up Wise recipient mapping
   * 4. Create Wise quote (USD→CAD or CAD→CAD)
   * 5. Create transfer
   * 6. Fund transfer from Wise balance
   * 7. Create PaymentRecord with execution tracking
   */
  fastify.post('/execute/:billId', {
    schema: {
      params: z.object({ billId: z.string() }),
      response: { 200: executeWisePaymentResponseSchema },
    },
  }, async (request, reply) => {
    const { billId } = request.params as { billId: string };

    const wise = getWiseClient();
    const pcClient = getPartnerConnectClient();

    // Verify Wise is configured
    if (!wise.isConfigured()) {
      return reply.status(503).send({
        success: false,
        billId,
        amount: 0,
        status: 'not_configured',
        message: 'Wise API not configured (set WISE_API_TOKEN)',
      });
    }

    // Verify PartnerConnect is configured
    if (!pcClient.isConfigured()) {
      return reply.status(503).send({
        success: false,
        billId,
        amount: 0,
        status: 'not_configured',
        message: 'PartnerConnect API credentials not configured',
      });
    }

    try {
      // Check for duplicate payment
      const existingPayment = await prisma.paymentRecord.findFirst({
        where: {
          pcBillId: billId,
          status: { in: ['queued', 'processing', 'paid'] },
        },
      });

      if (existingPayment) {
        return reply.status(409).send({
          success: false,
          paymentRecordId: existingPayment.id,
          billId,
          amount: Number(existingPayment.amount),
          status: existingPayment.status,
          message: `Payment already ${existingPayment.status} (record: ${existingPayment.id})`,
        });
      }

      // Fetch bill from PartnerConnect
      const bill = await pcClient.getBill(billId);

      // Only CA bills go through Wise
      if (bill.tenantCode !== 'CA') {
        return reply.status(400).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'wrong_processor',
          message: 'US bills use Bill.com, not Wise. Use POST /api/payments/execute/:billId instead.',
        });
      }

      // Get tenant config
      const tenant = await prisma.tenant.findFirst({
        where: { name: 'Canada' },
      });
      const provingPeriod = tenant?.provingPeriodHours || 24;

      // Run all control checks
      const controlResults = await runControlChecks(bill, 'CA', provingPeriod);

      if (!controlResults.readyToPay) {
        const failedControls = controlResults.controls
          .filter(c => !c.passed)
          .map(c => `${c.name}: ${c.reason}`)
          .join('; ');

        return reply.status(400).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'blocked',
          message: `Controls not passed: ${failedControls}`,
        });
      }

      // Get recipient mapping by QBO vendor ID
      const recipient = await prisma.wiseRecipient.findUnique({
        where: { qboVendorId: bill.qboVendorId },
      });

      if (!recipient) {
        return reply.status(404).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'no_recipient',
          message: `No Wise recipient mapping for vendor "${bill.resourceName}" (QBO ID: ${bill.qboVendorId})`,
        });
      }

      // Create reference: invoice number + last name
      const lastName = bill.resourceName.split(' ').pop() || 'Payment';
      const reference = `${bill.externalInvoiceDocNum || bill.uid}-${lastName}`.substring(0, 10);

      // Determine payment flow based on recipient type
      const isWiseToWise = recipient.wiseContactId && recipient.wiseContactId.includes('-');
      let transfer;
      let quote;

      if (isWiseToWise) {
        // Wise-to-Wise transfer (using email recipient)
        const hasValidEmail = recipient.wiseEmail &&
          !recipient.wiseEmail.toLowerCase().includes('wise account') &&
          !recipient.wiseEmail.toLowerCase().includes('wise business');

        if (!hasValidEmail) {
          return reply.status(400).send({
            success: false,
            billId,
            amount: bill.adjustedBillPayment,
            status: 'missing_email',
            message: `Wise-to-Wise recipient "${bill.resourceName}" needs an email address. Update their Wise recipient record.`,
          });
        }

        // Check for cached recipient account ID or create one
        let emailRecipientId = recipient.wiseRecipientAccountId;

        if (!emailRecipientId) {
          fastify.log.info({
            contactUuid: recipient.wiseContactId,
            email: recipient.wiseEmail,
            payeeName: bill.resourceName,
          }, 'Creating new Wise email recipient');

          emailRecipientId = await wise.createEmailRecipient(
            bill.resourceName,
            recipient.wiseEmail!,
            recipient.targetCurrency
          );

          // Cache the recipient ID
          await prisma.wiseRecipient.update({
            where: { qboVendorId: bill.qboVendorId },
            data: { wiseRecipientAccountId: emailRecipientId },
          });
        }

        quote = await wise.createQuote('CAD', recipient.targetCurrency, bill.adjustedBillPayment);
        transfer = await wise.createTransfer(quote.id, emailRecipientId, reference);
      } else {
        // Bank account transfer
        let recipientAccountId: number | null = null;

        if (recipient.wiseContactId && !recipient.wiseContactId.includes('-')) {
          recipientAccountId = parseInt(recipient.wiseContactId, 10);
        } else if (recipient.wiseEmail && !recipient.wiseEmail.toLowerCase().includes('wise account')) {
          const contact = await wise.findContact(recipient.wiseEmail, recipient.targetCurrency);
          if (contact) {
            recipientAccountId = contact.id;
          }
        }

        if (!recipientAccountId) {
          const accountByName = await wise.findAccountByName(bill.resourceName, recipient.targetCurrency);
          if (accountByName) {
            recipientAccountId = accountByName.id;
          }
        }

        if (!recipientAccountId) {
          return reply.status(400).send({
            success: false,
            billId,
            amount: bill.adjustedBillPayment,
            status: 'invalid_recipient',
            message: `No valid payment method for "${bill.resourceName}". Configure their Wise contact ID or bank details.`,
          });
        }

        quote = await wise.createQuote('CAD', recipient.targetCurrency, bill.adjustedBillPayment);
        transfer = await wise.createTransfer(quote.id, recipientAccountId, reference);
      }

      // Fund the transfer from Wise balance
      const fundResult = await wise.fundTransfer(transfer.id);

      fastify.log.info({
        billId,
        transferId: transfer.id,
        amount: bill.adjustedBillPayment,
        targetAmount: quote.targetAmount,
        targetCurrency: recipient.targetCurrency,
        rate: quote.rate,
        fee: quote.fee,
      }, 'Wise payment executed');

      // Get the authenticated user's email
      const user = (request as { user?: { email?: string } }).user;
      const executedBy = user?.email || 'unknown';

      // Send payment confirmation email
      const emailService = getEmailService();
      let emailResult: { success: boolean; messageId?: string; errorMessage?: string } = {
        success: false,
        messageId: undefined,
        errorMessage: 'Not attempted',
      };
      const payeeEmail = bill.payeeEmail;

      if (payeeEmail && emailService.isConfigured()) {
        emailResult = await emailService.sendPaymentConfirmation({
          to: payeeEmail,
          payeeName: bill.resourceName,
          amountCAD: bill.adjustedBillPayment,
          targetAmount: quote.targetAmount,
          targetCurrency: recipient.targetCurrency,
          exchangeRate: quote.rate,
          invoiceReference: bill.externalInvoiceDocNum || bill.uid,
          description: bill.description,
          expectedDelivery: quote.paymentOptions?.[0]?.estimatedDelivery || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
          transferId: transfer.id,
        });

        if (!emailResult.success) {
          fastify.log.warn({
            billId,
            payeeEmail,
            error: emailResult.errorMessage,
          }, 'Payment email failed - payment still succeeded');
        }
      }

      // Create payment record with full execution tracking
      const paymentRecord = await prisma.paymentRecord.create({
        data: {
          tenantId: tenant!.id,
          pcBillId: billId,
          qboInvoiceId: bill.externalInvoiceDocNum || '',
          payeeVendorId: recipient.wiseContactId || recipient.wiseEmail || 'unknown',
          payeeName: bill.resourceName,
          amount: bill.adjustedBillPayment,
          status: 'processing',
          controlResults: JSON.parse(JSON.stringify(controlResults)),
          paymentRef: String(transfer.id),
          executedAt: new Date(),
          executedBy,
          // Wise-specific fields
          wiseTransferId: transfer.id,
          wiseQuoteId: quote.id,
          wiseCurrency: recipient.targetCurrency,
          wiseExchangeRate: quote.rate,
          wiseTargetAmount: quote.targetAmount,
          wiseFee: quote.fee,
          // Email tracking
          payeeEmail: payeeEmail || null,
          emailSentAt: emailResult.success ? new Date() : null,
          emailMessageId: emailResult.messageId || null,
          emailStatus: emailResult.success ? 'sent' : (payeeEmail ? 'failed' : 'skipped'),
          emailError: emailResult.success ? null : emailResult.errorMessage,
        },
      });

      fastify.log.info({
        billId,
        paymentRecordId: paymentRecord.id,
        wiseTransferId: transfer.id,
      }, 'PaymentRecord created for Wise execution');

      return {
        success: true,
        transferId: transfer.id,
        paymentRecordId: paymentRecord.id,
        billId,
        amount: bill.adjustedBillPayment,
        targetAmount: quote.targetAmount,
        targetCurrency: recipient.targetCurrency,
        exchangeRate: quote.rate,
        fee: quote.fee,
        status: fundResult.status || transfer.status,
        message: `Wise transfer initiated: ${quote.targetAmount.toFixed(2)} ${recipient.targetCurrency} (rate: ${quote.rate.toFixed(4)}, fee: ${quote.fee.toFixed(2)})`,
      };
    } catch (err) {
      if (err instanceof WiseError) {
        fastify.log.error({ err, billId }, 'Wise API error during payment execution');
        return reply.status(err.statusCode || 500).send({
          success: false,
          billId,
          amount: 0,
          status: 'wise_error',
          message: `Wise error: ${err.message}`,
        });
      }

      fastify.log.error(err, `Failed to execute Wise payment for bill ${billId}`);
      return reply.status(500).send({
        success: false,
        billId,
        amount: 0,
        status: 'error',
        message: String(err),
      });
    }
  });

  /**
   * GET /api/payments/wise/:id/status
   * Get Wise payment status. Checks Wise API for latest transfer status
   * if a wiseTransferId exists and syncs it back to the local record.
   */
  fastify.get('/:id/status', {
    schema: {
      params: z.object({ id: z.string() }),
      response: { 200: wisePaymentStatusResponseSchema },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const record = await prisma.paymentRecord.findUnique({ where: { id } });

    if (!record) {
      return reply.status(404).send({
        error: 'Payment record not found',
        message: `No payment record with ID: ${id}`,
        statusCode: 404,
      });
    }

    // If we have a Wise transfer ID and status is still processing,
    // check Wise for the latest status
    let wiseStatus: string | null = null;

    if (record.wiseTransferId && record.status === 'processing') {
      try {
        const wise = getWiseClient();
        if (wise.isConfigured()) {
          const transfer = await wise.getTransfer(record.wiseTransferId);
          if (transfer) {
            wiseStatus = transfer.status;
            const mappedStatus = mapWiseTransferStatus(transfer.status);

            // Sync status back if changed to terminal state
            if (mappedStatus === 'paid' || mappedStatus === 'failed') {
              const updateData: Record<string, unknown> = {
                status: mappedStatus,
              };
              if (mappedStatus === 'paid') {
                updateData.paidAt = new Date();
              }
              if (mappedStatus === 'failed') {
                updateData.failureReason = `Wise transfer ${transfer.status}`;
              }

              await prisma.paymentRecord.update({
                where: { id },
                data: updateData,
              });

              const updated = await prisma.paymentRecord.findUnique({ where: { id } });
              if (updated) {
                return {
                  paymentRecordId: updated.id,
                  pcBillId: updated.pcBillId,
                  payeeName: updated.payeeName,
                  amount: Number(updated.amount),
                  status: updated.status,
                  wiseTransferId: updated.wiseTransferId,
                  wiseStatus,
                  wiseCurrency: updated.wiseCurrency,
                  wiseExchangeRate: updated.wiseExchangeRate ? Number(updated.wiseExchangeRate) : null,
                  wiseTargetAmount: updated.wiseTargetAmount ? Number(updated.wiseTargetAmount) : null,
                  wiseFee: updated.wiseFee ? Number(updated.wiseFee) : null,
                  executedAt: updated.executedAt?.toISOString() ?? null,
                  executedBy: updated.executedBy,
                  failureReason: updated.failureReason,
                  paidAt: updated.paidAt?.toISOString() ?? null,
                  createdAt: updated.createdAt.toISOString(),
                  updatedAt: updated.updatedAt.toISOString(),
                };
              }
            }
          }
        }
      } catch (err) {
        fastify.log.warn(err, `Failed to fetch Wise status for transfer ${record.wiseTransferId}`);
      }
    }

    return {
      paymentRecordId: record.id,
      pcBillId: record.pcBillId,
      payeeName: record.payeeName,
      amount: Number(record.amount),
      status: record.status,
      wiseTransferId: record.wiseTransferId,
      wiseStatus,
      wiseCurrency: record.wiseCurrency,
      wiseExchangeRate: record.wiseExchangeRate ? Number(record.wiseExchangeRate) : null,
      wiseTargetAmount: record.wiseTargetAmount ? Number(record.wiseTargetAmount) : null,
      wiseFee: record.wiseFee ? Number(record.wiseFee) : null,
      executedAt: record.executedAt?.toISOString() ?? null,
      executedBy: record.executedBy,
      failureReason: record.failureReason,
      paidAt: record.paidAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
};
