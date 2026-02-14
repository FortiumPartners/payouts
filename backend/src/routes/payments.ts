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
import { getEmailService } from '../services/email.js';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from './auth.js';

// Response schemas
const paymentStatusSchema = z.object({
  configured: z.boolean(),
  mfaConfigured: z.boolean(),
  trusted: z.boolean(),
});

// Payment history schemas
const paymentHistoryQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  payeeIds: z.string().optional(), // Comma-separated
  clientIds: z.string().optional(), // Comma-separated
  tenant: z.enum(['US', 'CA', 'all']).optional().default('all'),
  paymentMethod: z.string().optional(), // Comma-separated: bill_com, wise, payouts
  minAmount: z.coerce.number().optional(),
  maxAmount: z.coerce.number().optional(),
  status: z.string().optional(), // Comma-separated: paid, pending, failed
  page: z.coerce.number().optional().default(1),
  pageSize: z.coerce.number().optional().default(50),
});

const paymentItemSchema = z.object({
  id: z.string(),
  pcBillId: z.string(),
  paidDate: z.string().nullable(),
  payeeName: z.string(),
  payeeId: z.string(),
  amount: z.number(),
  currency: z.enum(['USD', 'CAD']),
  status: z.enum(['paid', 'pending', 'failed']),
  clientName: z.string(),
  tenantCode: z.enum(['US', 'CA']),
  paymentMethod: z.string(),
});

const paymentHistoryResponseSchema = z.object({
  payments: z.array(paymentItemSchema),
  total: z.number(),
  page: z.number(),
  pageSize: z.number(),
  filters: z.object({
    payees: z.array(z.object({ id: z.string(), name: z.string() })),
    clients: z.array(z.object({ id: z.string(), name: z.string() })),
  }),
});

const paymentDetailSchema = paymentItemSchema.extend({
  invoiceNumber: z.string().nullable(),
  billNumber: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  pcBillLink: z.string().nullable(),
  description: z.string(),
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
   * GET /api/payments/history - List payment history with filters
   */
  fastify.get('/history', {
    schema: {
      querystring: paymentHistoryQuerySchema,
      response: {
        200: paymentHistoryResponseSchema,
      },
    },
  }, async (request) => {
    const query = request.query as z.infer<typeof paymentHistoryQuerySchema>;
    const pcClient = getPartnerConnectClient();

    // Fetch paid bills from PartnerConnect
    const paidBills = await pcClient.getPaidBills({
      startDate: query.startDate,
      endDate: query.endDate,
      tenant: query.tenant === 'all' ? undefined : query.tenant,
    });

    // Apply additional filters
    let filtered = paidBills;

    // Payee filter
    if (query.payeeIds) {
      const payeeIds = query.payeeIds.split(',').map(s => s.trim().toLowerCase());
      filtered = filtered.filter(bill =>
        payeeIds.some(id =>
          bill.resourceUid.toLowerCase() === id ||
          bill.resourceName.toLowerCase().includes(id)
        )
      );
    }

    // Client filter
    if (query.clientIds) {
      const clientIds = query.clientIds.split(',').map(s => s.trim().toLowerCase());
      filtered = filtered.filter(bill =>
        clientIds.some(id =>
          bill.clientName.toLowerCase().includes(id)
        )
      );
    }

    // Payment method filter (derive from tenant)
    if (query.paymentMethod) {
      const methods = query.paymentMethod.split(',').map(s => s.trim().toLowerCase());
      filtered = filtered.filter(bill => {
        const method = bill.tenantCode === 'CA' ? 'wise' : 'bill_com';
        return methods.includes(method) || methods.includes('payouts');
      });
    }

    // Amount range filter
    if (query.minAmount !== undefined) {
      filtered = filtered.filter(bill => bill.total >= query.minAmount!);
    }
    if (query.maxAmount !== undefined) {
      filtered = filtered.filter(bill => bill.total <= query.maxAmount!);
    }

    // Status filter (all paid bills are 'paid' by definition)
    if (query.status) {
      const statuses = query.status.split(',').map(s => s.trim().toLowerCase());
      // For now, only 'paid' status exists in historical data
      if (!statuses.includes('paid')) {
        filtered = [];
      }
    }

    // Sort by paid date descending (most recent first)
    filtered.sort((a, b) => {
      const dateA = a.paidDate ? new Date(a.paidDate).getTime() : 0;
      const dateB = b.paidDate ? new Date(b.paidDate).getTime() : 0;
      return dateB - dateA;
    });

    // Extract unique payees and clients for filter dropdowns
    const payeeMap = new Map<string, string>();
    const clientMap = new Map<string, string>();
    paidBills.forEach(bill => {
      if (bill.resourceUid && bill.resourceName) {
        payeeMap.set(bill.resourceUid, bill.resourceName);
      }
      if (bill.clientName) {
        clientMap.set(bill.clientName.toLowerCase(), bill.clientName);
      }
    });

    // Pagination
    const total = filtered.length;
    const startIndex = (query.page - 1) * query.pageSize;
    const paginated = filtered.slice(startIndex, startIndex + query.pageSize);

    // Map to response format
    const payments = paginated.map(bill => ({
      id: bill.uid,
      pcBillId: bill.uid,
      paidDate: bill.paidDate ? bill.paidDate.toISOString() : null,
      payeeName: bill.resourceName,
      payeeId: bill.resourceUid,
      amount: bill.total,
      currency: bill.tenantCode === 'CA' ? 'CAD' as const : 'USD' as const,
      status: 'paid' as const,
      clientName: bill.clientName,
      tenantCode: bill.tenantCode as 'US' | 'CA',
      paymentMethod: bill.tenantCode === 'CA' ? 'Wise' : 'Bill.com',
    }));

    return {
      payments,
      total,
      page: query.page,
      pageSize: query.pageSize,
      filters: {
        payees: Array.from(payeeMap.entries()).map(([id, name]) => ({ id, name })),
        clients: Array.from(clientMap.entries()).map(([id, name]) => ({ id, name })),
      },
    };
  });

  /**
   * GET /api/payments/history/:id - Get payment details (lazy load)
   */
  fastify.get('/history/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: paymentDetailSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const pcClient = getPartnerConnectClient();

    try {
      const bill = await pcClient.getBill(id);

      // Build PC bill link (adjust URL as needed for your PartnerConnect instance)
      const pcBillLink = `https://partnerconnect.fortiumpartners.com/bills/${id}`;

      return {
        id: bill.uid,
        pcBillId: bill.uid,
        paidDate: bill.paidDate ? bill.paidDate.toISOString() : null,
        payeeName: bill.resourceName,
        payeeId: bill.resourceUid,
        amount: bill.total,
        currency: bill.tenantCode === 'CA' ? 'CAD' as const : 'USD' as const,
        status: 'paid' as const,
        clientName: bill.clientName,
        tenantCode: bill.tenantCode as 'US' | 'CA',
        paymentMethod: bill.tenantCode === 'CA' ? 'Wise' : 'Bill.com',
        invoiceNumber: bill.externalInvoiceDocNum || null,
        billNumber: bill.externalBillDocNum || null,
        referenceNumber: bill.externalBillId || null,
        pcBillLink,
        description: bill.description,
      };
    } catch (err) {
      fastify.log.error(err, `Failed to fetch payment details for ${id}`);
      return reply.status(404).send({
        error: 'Payment not found',
        message: `Could not find payment with ID: ${id}`,
        statusCode: 404,
      });
    }
  });

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
          // ---------------------------------------------------------------
          // WISE-TO-WISE TRANSFER (direct to recipient's Wise balance)
          // ---------------------------------------------------------------
          // targetContactId in the quote routes funds directly to their
          // Wise balance. API still requires a targetAccount (email recipient),
          // but the contactId in the quote overrides the delivery method.

          const hasValidEmail = recipient.wiseEmail &&
            !recipient.wiseEmail.toLowerCase().includes('wise account') &&
            !recipient.wiseEmail.toLowerCase().includes('wise business');

          if (!hasValidEmail) {
            return reply.status(400).send({
              success: false,
              billId,
              amount: bill.adjustedBillPayment,
              status: 'missing_email',
              message: `Wise-to-Wise recipient "${bill.resourceName}" needs an email address configured.`,
            });
          }

          // Get or create email recipient (required by API as targetAccount)
          let recipientAccountId = recipient.wiseRecipientAccountId;
          if (!recipientAccountId) {
            recipientAccountId = await wise.createEmailRecipient(
              bill.resourceName,
              recipient.wiseEmail!,
              recipient.targetCurrency
            );
            await prisma.wiseRecipient.update({
              where: { qboVendorId: bill.qboVendorId },
              data: { wiseRecipientAccountId: recipientAccountId },
            });
          }

          fastify.log.info({
            contactUuid: recipient.wiseContactId,
            recipientAccountId,
            payeeName: bill.resourceName,
          }, 'Using Wise-to-Wise transfer');

          // Quote with targetContactId routes directly to their Wise balance
          quote = await wise.createQuote(
            'CAD',
            recipient.targetCurrency,
            bill.adjustedBillPayment,
            recipient.wiseContactId!
          );

          // Transfer still needs targetAccount to satisfy API
          transfer = await wise.createTransfer(quote.id, recipientAccountId, reference);
        } else if (recipient.wiseEmail &&
          !recipient.wiseEmail.toLowerCase().includes('wise account') &&
          !recipient.wiseEmail.toLowerCase().includes('wise business')) {
          // ---------------------------------------------------------------
          // EMAIL RECIPIENT TRANSFER (fallback when no Wise-to-Wise contact)
          // ---------------------------------------------------------------
          // Recipient doesn't have a Wise account linked — send via email.
          // They'll get a link to claim the payment.

          let emailRecipientId = recipient.wiseRecipientAccountId;

          if (emailRecipientId) {
            fastify.log.info({
              cachedAccountId: emailRecipientId,
              payeeName: bill.resourceName,
            }, 'Using cached email recipient account ID');
          } else {
            fastify.log.info({
              email: recipient.wiseEmail,
              payeeName: bill.resourceName,
            }, 'Creating email recipient (no Wise-to-Wise contact)');

            emailRecipientId = await wise.createEmailRecipient(
              bill.resourceName,
              recipient.wiseEmail,
              recipient.targetCurrency
            );

            await prisma.wiseRecipient.update({
              where: { qboVendorId: bill.qboVendorId },
              data: { wiseRecipientAccountId: emailRecipientId },
            });
          }

          quote = await wise.createQuote(
            'CAD',
            recipient.targetCurrency,
            bill.adjustedBillPayment
          );

          transfer = await wise.createTransfer(quote.id, emailRecipientId, reference);
        } else {
          // ---------------------------------------------------------------
          // BANK ACCOUNT TRANSFER (using v1/accounts numeric ID)
          // ---------------------------------------------------------------
          let recipientAccountId: number | null = null;

          // Check if wiseContactId is a numeric account ID (from v1/accounts)
          if (recipient.wiseContactId && !recipient.wiseContactId.includes('-')) {
            recipientAccountId = parseInt(recipient.wiseContactId, 10);
            fastify.log.info({ recipientAccountId }, 'Using stored v1/accounts ID');
          }
          // Try email-based lookup
          else if (recipient.wiseEmail && !recipient.wiseEmail.toLowerCase().includes('wise account')) {
            const contact = await wise.findContact(recipient.wiseEmail, recipient.targetCurrency);
            if (contact) {
              recipientAccountId = contact.id;
            }
          }
          // Fall back to name-based matching
          if (!recipientAccountId) {
            const accountByName = await wise.findAccountByName(bill.resourceName, recipient.targetCurrency);
            if (accountByName) {
              recipientAccountId = accountByName.id;
              fastify.log.info({ recipientAccountId, type: accountByName.type }, 'Found account by name');
            }
          }

          if (!recipientAccountId) {
            return reply.status(400).send({
              success: false,
              billId,
              amount: bill.adjustedBillPayment,
              status: 'invalid_recipient',
              message: `No valid payment method for "${bill.resourceName}". Please configure their Wise contact ID or bank details.`,
            });
          }

          // Create quote (CAD -> target currency)
          quote = await wise.createQuote('CAD', recipient.targetCurrency, bill.adjustedBillPayment);

          // Create transfer with numeric account ID
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
        }, 'Wise payment initiated');

        // Send payment confirmation email (Wise payments only)
        const emailService = getEmailService();
        let emailResult: { success: boolean; messageId?: string; errorMessage?: string } = {
          success: false,
          messageId: undefined,
          errorMessage: 'Not attempted'
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
          } else {
            fastify.log.info({
              billId,
              payeeEmail,
              messageId: emailResult.messageId,
            }, 'Payment confirmation email sent');
          }
        } else {
          if (!payeeEmail) {
            fastify.log.info({ billId, payeeName: bill.resourceName }, 'No payee email available, skipping notification');
            emailResult.errorMessage = 'No payee email available';
          } else if (!emailService.isConfigured()) {
            fastify.log.info({ billId }, 'Email service not configured, skipping notification');
            emailResult.errorMessage = 'Email service not configured';
          }
        }

        // Create payment record to prevent duplicate payments
        await prisma.paymentRecord.create({
          data: {
            tenantId: tenant!.id,
            pcBillId: billId,
            qboInvoiceId: bill.externalInvoiceDocNum || '',
            payeeVendorId: recipient.wiseContactId || recipient.wiseEmail || 'unknown',
            payeeName: bill.resourceName,
            amount: bill.adjustedBillPayment,
            status: 'paid',
            paidAt: new Date(),
            paymentRef: String(transfer.id),
            controlResults: JSON.parse(JSON.stringify(controlResults)),
            // Email tracking fields
            payeeEmail: payeeEmail || null,
            emailSentAt: emailResult.success ? new Date() : null,
            emailMessageId: emailResult.messageId || null,
            emailStatus: emailResult.success ? 'sent' : (payeeEmail ? 'failed' : 'skipped'),
            emailError: emailResult.success ? null : emailResult.errorMessage,
          },
        });

        fastify.log.info({ billId, transferId: transfer.id }, 'PaymentRecord created');

        return {
          success: true,
          paymentId: String(transfer.id),
          billId,
          amount: bill.adjustedBillPayment,
          status: fundResult.status || transfer.status,
          message: `Wise transfer initiated: ${(quote.targetAmount ?? bill.adjustedBillPayment).toFixed(2)} ${recipient.targetCurrency} (rate: ${(quote.rate ?? 1).toFixed(4)})`,
        };
      }

      // =====================================================================
      // BILL.COM PAYMENT FLOW (US)
      // =====================================================================

      // Find the bill in Bill.com by bill doc number (QBO bill number)
      const billcomBill = await billcom.findBill(bill.externalBillDocNum)

      if (!billcomBill) {
        return reply.status(404).send({
          success: false,
          billId,
          amount: bill.adjustedBillPayment,
          status: 'not_found',
          message: `Bill not found in Bill.com: ${bill.externalBillDocNum}`,
        });
      }

      // Execute payment
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
      }, 'Bill.com payment initiated');

      // Create payment record to prevent duplicate payments
      await prisma.paymentRecord.create({
        data: {
          tenantId: tenant!.id,
          pcBillId: billId,
          qboInvoiceId: bill.externalInvoiceDocNum || '',
          payeeVendorId: billcomBill.vendorId,
          payeeName: bill.resourceName,
          amount: bill.adjustedBillPayment,
          status: 'paid',
          paidAt: new Date(),
          paymentRef: payment.id,
          controlResults: JSON.parse(JSON.stringify(controlResults)),
        },
      });

      fastify.log.info({ billId, paymentId: payment.id }, 'PaymentRecord created');

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
