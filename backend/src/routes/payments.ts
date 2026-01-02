/**
 * Payments API routes.
 * Handles Bill.com payment initiation and MFA flow.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getBillComClient, BillComMfaRequired } from '../services/billcom.js';
import { getWiseClient } from '../services/wise.js';
import { getPartnerConnectClient } from '../services/partnerconnect.js';
import { runControlChecks } from '../services/controls.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from './auth.js';

// Response schemas
const paymentStatusSchema = z.object({
  configured: z.boolean(),
  mfaConfigured: z.boolean(),
  trusted: z.boolean(),
});

const mfaChallengeSchema = z.object({
  challengeId: z.string(),
  message: z.string(),
});

const mfaValidateSchema = z.object({
  success: z.boolean(),
  mfaId: z.string().optional(),
  message: z.string(),
});

const paymentResultSchema = z.object({
  success: z.boolean(),
  paymentId: z.string().optional(),
  billId: z.string(),
  amount: z.number(),
  status: z.string(),
  message: z.string(),
});

export const paymentsRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', requireAuth);

  /**
   * GET /api/payments/status - Get Bill.com configuration status
   */
  fastify.get('/status', {
    schema: {
      response: {
        200: paymentStatusSchema,
      },
    },
  }, async () => {
    const billcom = getBillComClient();

    return {
      configured: billcom.isConfigured(),
      mfaConfigured: billcom.isMfaConfigured(),
      trusted: billcom.isTrusted(),
    };
  });

  /**
   * POST /api/payments/mfa/initiate - Start MFA challenge (sends SMS)
   */
  fastify.post('/mfa/initiate', {
    schema: {
      response: {
        200: mfaChallengeSchema,
      },
    },
  }, async (request, reply) => {
    const billcom = getBillComClient();

    if (!billcom.isConfigured()) {
      return reply.status(503).send({
        error: 'Bill.com not configured',
        message: 'API credentials not set',
        statusCode: 503,
      });
    }

    try {
      const result = await billcom.initiateMfaChallenge();
      return {
        challengeId: result.challengeId,
        message: 'MFA code sent to registered phone',
      };
    } catch (err) {
      fastify.log.error(err, 'Failed to initiate MFA challenge');
      return reply.status(500).send({
        error: 'Failed to initiate MFA',
        message: String(err),
        statusCode: 500,
      });
    }
  });

  /**
   * POST /api/payments/mfa/validate - Validate MFA code
   */
  fastify.post('/mfa/validate', {
    schema: {
      body: z.object({
        challengeId: z.string(),
        code: z.string(),
      }),
      response: {
        200: mfaValidateSchema,
      },
    },
  }, async (request, reply) => {
    const { challengeId, code } = request.body as { challengeId: string; code: string };
    const billcom = getBillComClient();

    if (!billcom.isConfigured()) {
      return reply.status(503).send({
        error: 'Bill.com not configured',
        message: 'API credentials not set',
        statusCode: 503,
      });
    }

    try {
      const result = await billcom.validateMfaChallenge(challengeId, code);
      return {
        success: true,
        mfaId: result.mfaId,
        message: 'MFA validated. Save mfaId to BILLCOM_MFA_ID env var for persistent trusted sessions.',
      };
    } catch (err) {
      fastify.log.error(err, 'Failed to validate MFA');
      return reply.status(400).send({
        success: false,
        message: String(err),
      });
    }
  });

  /**
   * POST /api/payments/pay/:billId - Pay a bill
   */
  fastify.post('/pay/:billId', {
    schema: {
      params: z.object({
        billId: z.string(),
      }),
      body: z.object({
        processDate: z.string().optional(), // YYYY-MM-DD format
      }).optional(),
      response: {
        200: paymentResultSchema,
      },
    },
  }, async (request, reply) => {
    const { billId } = request.params as { billId: string };
    const body = request.body as { processDate?: string } | undefined;
    const processDate = body?.processDate;

    const billcom = getBillComClient();
    const pcClient = getPartnerConnectClient();

    // Check Bill.com is configured
    if (!billcom.isConfigured()) {
      return reply.status(503).send({
        error: 'Bill.com not configured',
        message: 'API credentials not set',
        statusCode: 503,
      });
    }

    // Check PartnerConnect is configured
    if (!pcClient.isConfigured()) {
      return reply.status(503).send({
        error: 'PartnerConnect not configured',
        message: 'API credentials not set',
        statusCode: 503,
      });
    }

    try {
      // Fetch bill from PartnerConnect
      const bill = await pcClient.getBill(billId);

      // Get tenant config for proving period
      const tenantType: 'US' | 'CA' = bill.tenantCode === 'CA' ? 'CA' : 'US';
      const tenant = await prisma.tenant.findFirst({
        where: { name: tenantType === 'CA' ? 'Canada' : 'US' },
      });
      const provingPeriod = tenant?.provingPeriodHours || 24;

      // Run control checks - all must pass
      const controlResults = await runControlChecks(bill, tenantType, provingPeriod);

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

      // Route to appropriate payment processor based on tenant
      if (tenantType === 'CA') {
        // =====================================================================
        // WISE PAYMENT FLOW (Canada)
        // =====================================================================
        const wise = getWiseClient();

        if (!wise.isConfigured()) {
          return reply.status(503).send({
            success: false,
            billId,
            amount: bill.adjustedBillPayment,
            status: 'not_configured',
            message: 'Wise API not configured (set WISE_API_TOKEN)',
          });
        }

        // Get recipient mapping
        const recipient = await prisma.wiseRecipient.findUnique({
          where: { payeeName: bill.resourceName },
        });

        if (!recipient) {
          return reply.status(404).send({
            success: false,
            billId,
            amount: bill.adjustedBillPayment,
            status: 'no_recipient',
            message: `No Wise recipient mapping for "${bill.resourceName}"`,
          });
        }

        // Find contact in Wise (or use cached ID)
        let contactId = recipient.wiseContactId ? parseInt(recipient.wiseContactId, 10) : null;

        if (!contactId) {
          const contact = await wise.findContact(recipient.wiseEmail, recipient.targetCurrency);
          if (!contact) {
            return reply.status(404).send({
              success: false,
              billId,
              amount: bill.adjustedBillPayment,
              status: 'contact_not_found',
              message: `Wise contact not found for email: ${recipient.wiseEmail}`,
            });
          }
          contactId = contact.id;

          // Cache the contact ID
          await prisma.wiseRecipient.update({
            where: { id: recipient.id },
            data: { wiseContactId: String(contactId) },
          });
        }

        // Create quote (CAD -> target currency)
        const quote = await wise.createQuote('CAD', recipient.targetCurrency, bill.adjustedBillPayment);

        // Create reference: invoice number + last name
        const lastName = bill.resourceName.split(' ').pop() || 'Payment';
        const reference = `${bill.externalInvoiceDocNum || bill.uid}-${lastName}`.substring(0, 10);

        // Create transfer
        const transfer = await wise.createTransfer(quote.id, contactId, reference);

        // Fund the transfer from Wise balance
        const fundResult = await wise.fundTransfer(transfer.id);

        fastify.log.info({
          billId,
          transferId: transfer.id,
          amount: bill.adjustedBillPayment,
          targetAmount: quote.targetAmount,
          targetCurrency: recipient.targetCurrency,
          rate: quote.rate,
        }, 'Wise payment initiated');

        return {
          success: true,
          paymentId: String(transfer.id),
          billId,
          amount: bill.adjustedBillPayment,
          status: fundResult.status || transfer.status,
          message: `Wise transfer initiated: ${quote.targetAmount.toFixed(2)} ${recipient.targetCurrency} (rate: ${quote.rate.toFixed(4)})`,
        };
      }

      // =====================================================================
      // BILL.COM PAYMENT FLOW (US)
      // =====================================================================

      // Find the bill in Bill.com by invoice number
      const billcomBill = await billcom.findBill(bill.externalInvoiceDocNum)

      if (!billcomBill) {
        return reply.status(404).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'not_found',
          message: `Bill not found in Bill.com: ${bill.externalInvoiceDocNum}`,
        });
      }

      // Execute payment
      const payment = await billcom.payBill(
        billcomBill.id,
        bill.adjustedBillPayment,
        processDate
      );

      fastify.log.info({
        billId,
        paymentId: payment.id,
        amount: bill.adjustedBillPayment,
      }, 'Payment initiated');

      return {
        success: true,
        paymentId: payment.id,
        billId,
        amount: bill.adjustedBillPayment,
        status: payment.status,
        message: `Payment initiated for $${bill.adjustedBillPayment.toFixed(2)}`,
      };

    } catch (err) {
      // Handle MFA required error
      if (err instanceof BillComMfaRequired) {
        return reply.status(403).send({
          success: false,
          billId,
          amount: 0,
          status: 'mfa_required',
          message: 'MFA required. Call POST /api/payments/mfa/initiate first.',
        });
      }

      fastify.log.error(err, `Failed to pay bill ${billId}`);
      return reply.status(500).send({
        success: false,
        billId,
        amount: 0,
        status: 'error',
        message: String(err),
      });
    }
  });
};
