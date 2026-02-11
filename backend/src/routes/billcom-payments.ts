/**
 * Bill.com payment execution routes.
 * Handles the approve → execute → track status lifecycle for US payments.
 *
 * POST /execute/:billId  - Execute payment for a validated bill
 * GET  /:id/status       - Get payment status from Bill.com
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getBillComClient, BillComMfaRequired, BillComClient } from '../services/billcom.js';
import { getPartnerConnectClient } from '../services/partnerconnect.js';
import { runControlChecks } from '../services/controls.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from './auth.js';

// Schemas
const executePaymentBodySchema = z.object({
  processDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD format').optional(),
});

const executePaymentResponseSchema = z.object({
  success: z.boolean(),
  paymentId: z.string().optional(),
  paymentRecordId: z.string().optional(),
  billId: z.string(),
  amount: z.number(),
  status: z.string(),
  processDate: z.string().optional(),
  message: z.string(),
});

const paymentStatusResponseSchema = z.object({
  paymentRecordId: z.string(),
  pcBillId: z.string(),
  payeeName: z.string(),
  amount: z.number(),
  status: z.string(),
  billComPaymentId: z.string().nullable(),
  billComStatus: z.string().nullable(),
  processDate: z.string().nullable(),
  executedAt: z.string().nullable(),
  executedBy: z.string().nullable(),
  failureReason: z.string().nullable(),
  paidAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const billcomPaymentsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', requireAuth);

  /**
   * POST /api/payments/execute/:billId
   * Execute a Bill.com payment for a validated US bill.
   * This is the full approve → execute flow:
   * 1. Fetch bill from PartnerConnect
   * 2. Run control checks (must all pass)
   * 3. Find/verify bill in Bill.com
   * 4. Execute payment via Bill.com API
   * 5. Create PaymentRecord with execution tracking
   */
  fastify.post('/execute/:billId', {
    schema: {
      params: z.object({ billId: z.string() }),
      body: executePaymentBodySchema.optional(),
      response: { 200: executePaymentResponseSchema },
    },
  }, async (request, reply) => {
    const { billId } = request.params as { billId: string };
    const body = request.body as { processDate?: string } | undefined;
    const processDate = body?.processDate;

    const billcom = getBillComClient();
    const pcClient = getPartnerConnectClient();

    // Verify Bill.com is configured
    if (!billcom.isConfigured()) {
      return reply.status(503).send({
        success: false,
        billId,
        amount: 0,
        status: 'not_configured',
        message: 'Bill.com API credentials not configured',
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

      // Only US bills go through Bill.com
      if (bill.tenantCode === 'CA') {
        return reply.status(400).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'wrong_processor',
          message: 'Canadian bills use Wise, not Bill.com. Use POST /api/payments/pay/:billId instead.',
        });
      }

      // Get tenant config
      const tenant = await prisma.tenant.findFirst({
        where: { name: 'US' },
      });
      const provingPeriod = tenant?.provingPeriodHours || 24;

      // Run all control checks
      const controlResults = await runControlChecks(bill, 'US', provingPeriod);

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

      // Find the bill in Bill.com by QBO bill doc number
      const billcomBill = await billcom.findBill(bill.externalBillDocNum);

      if (!billcomBill) {
        return reply.status(404).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'not_found',
          message: `Bill not found in Bill.com: ${bill.externalBillDocNum}`,
        });
      }

      // Execute payment through Bill.com
      const payment = await billcom.payBill(
        billcomBill.id,
        billcomBill.vendorId,
        bill.adjustedBillPayment,
        processDate
      );

      fastify.log.info({
        billId,
        paymentId: payment.id,
        amount: bill.adjustedBillPayment,
        processDate: payment.processDate,
      }, 'Bill.com payment executed');

      // Get the authenticated user's email from the request
      const user = (request as { user?: { email?: string } }).user;
      const executedBy = user?.email || 'unknown';

      // Create payment record with full execution tracking
      const paymentRecord = await prisma.paymentRecord.create({
        data: {
          tenantId: tenant!.id,
          pcBillId: billId,
          qboInvoiceId: bill.externalInvoiceDocNum || '',
          payeeVendorId: billcomBill.vendorId,
          payeeName: bill.resourceName,
          amount: bill.adjustedBillPayment,
          status: 'processing',
          controlResults: JSON.parse(JSON.stringify(controlResults)),
          paymentRef: payment.id,
          billComBillId: billcomBill.id,
          billComPaymentId: payment.id,
          processDate: payment.processDate,
          executedAt: new Date(),
          executedBy,
        },
      });

      fastify.log.info({
        billId,
        paymentRecordId: paymentRecord.id,
        billComPaymentId: payment.id,
      }, 'PaymentRecord created for Bill.com execution');

      return {
        success: true,
        paymentId: payment.id,
        paymentRecordId: paymentRecord.id,
        billId,
        amount: bill.adjustedBillPayment,
        status: payment.status,
        processDate: payment.processDate,
        message: `Payment submitted for $${bill.adjustedBillPayment.toFixed(2)}, scheduled for ${payment.processDate || 'next business day'}`,
      };
    } catch (err) {
      if (err instanceof BillComMfaRequired) {
        return reply.status(403).send({
          success: false,
          billId,
          amount: 0,
          status: 'mfa_required',
          message: 'MFA required. Call POST /api/payments/mfa/initiate first.',
        });
      }

      fastify.log.error(err, `Failed to execute payment for bill ${billId}`);
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
   * GET /api/payments/:id/status
   * Get payment status. Checks Bill.com for latest status if a
   * billComPaymentId exists and syncs it back to the local record.
   */
  fastify.get('/:id/status', {
    schema: {
      params: z.object({ id: z.string() }),
      response: { 200: paymentStatusResponseSchema },
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

    // If we have a Bill.com payment ID and status is still processing,
    // check Bill.com for the latest status
    let billComStatus: string | null = null;

    if (record.billComPaymentId && record.status === 'processing') {
      try {
        const billcom = getBillComClient();
        if (billcom.isConfigured()) {
          const sentPay = await billcom.getPaymentStatus(record.billComPaymentId);
          billComStatus = BillComClient.mapPaymentStatus(sentPay.status);

          // Sync status back if changed
          if (billComStatus === 'paid' || billComStatus === 'failed' || billComStatus === 'canceled') {
            const updateData: Record<string, unknown> = {
              status: billComStatus === 'paid' ? 'paid' : 'failed',
            };
            if (billComStatus === 'paid') {
              updateData.paidAt = new Date();
            }
            if (billComStatus === 'failed' || billComStatus === 'canceled') {
              updateData.failureReason = `Bill.com status: ${billComStatus}`;
            }

            await prisma.paymentRecord.update({
              where: { id },
              data: updateData,
            });

            // Re-fetch the updated record
            const updated = await prisma.paymentRecord.findUnique({ where: { id } });
            if (updated) {
              return {
                paymentRecordId: updated.id,
                pcBillId: updated.pcBillId,
                payeeName: updated.payeeName,
                amount: Number(updated.amount),
                status: updated.status,
                billComPaymentId: updated.billComPaymentId,
                billComStatus,
                processDate: updated.processDate,
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
      } catch (err) {
        fastify.log.warn(err, `Failed to fetch Bill.com status for ${record.billComPaymentId}`);
        // Continue with local data
      }
    }

    return {
      paymentRecordId: record.id,
      pcBillId: record.pcBillId,
      payeeName: record.payeeName,
      amount: Number(record.amount),
      status: record.status,
      billComPaymentId: record.billComPaymentId,
      billComStatus,
      processDate: record.processDate,
      executedAt: record.executedAt?.toISOString() ?? null,
      executedBy: record.executedBy,
      failureReason: record.failureReason,
      paidAt: record.paidAt?.toISOString() ?? null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  });
};
