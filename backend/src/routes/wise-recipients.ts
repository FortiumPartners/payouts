/**
 * Wise Recipients API routes.
 * CRUD operations for managing payee → Wise email mappings.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from './auth.js';
import { getWiseClient } from '../services/wise.js';

// Schemas
const wiseRecipientSchema = z.object({
  id: z.string(),
  qboVendorId: z.string(),
  payeeName: z.string(),
  wiseEmail: z.string(),  // May be empty for Wise-to-Wise contacts
  targetCurrency: z.string(),
  wiseContactId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const createRecipientSchema = z.object({
  qboVendorId: z.string().min(1, 'QBO Vendor ID is required'),
  payeeName: z.string().min(1, 'Payee name is required'),
  // For Wise-to-Wise contacts, email may be empty (use contactId instead)
  wiseEmail: z.string().default(''),
  targetCurrency: z.enum(['USD', 'CAD']).default('CAD'),
  // Contact UUID from Wise API (for Wise-to-Wise contacts)
  wiseContactId: z.string().optional(),
}).refine(
  (data) => data.wiseEmail || data.wiseContactId,
  { message: 'Either Wise email or contact ID is required' }
);

const updateRecipientSchema = z.object({
  wiseEmail: z.string().email('Valid email is required').optional(),
  targetCurrency: z.enum(['USD', 'CAD']).optional(),
});

export const wiseRecipientsRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', requireAuth);

  /**
   * GET /api/wise-recipients/ca-payees - List CA payees from payment history
   * Debug endpoint to help rebuild wise_recipients mappings
   * TEMP: No auth required for data recovery
   */
  fastify.get('/ca-payees', {
    config: { skipAuth: true },
    schema: {
      response: {
        200: z.object({
          payees: z.array(z.object({
            payeeName: z.string(),
            payeeVendorId: z.string(),
            payeeEmail: z.string().nullable(),
          })),
        }),
      },
    },
  }, async () => {
    const payments = await prisma.paymentRecord.findMany({
      where: { tenantId: 'ca1' },
      select: {
        payeeName: true,
        payeeVendorId: true,
        payeeEmail: true,
      },
      distinct: ['payeeVendorId'],
    });

    return { payees: payments };
  });

  /**
   * GET /api/wise-recipients - List all recipients
   */
  fastify.get('/', {
    schema: {
      response: {
        200: z.object({
          recipients: z.array(wiseRecipientSchema),
        }),
      },
    },
  }, async () => {
    const recipients = await prisma.wiseRecipient.findMany({
      orderBy: { payeeName: 'asc' },
    });

    return {
      recipients: recipients.map(r => ({
        ...r,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      })),
    };
  });

  /**
   * GET /api/wise-recipients/balance - Get Wise account balances
   */
  fastify.get('/balance', {
    schema: {
      response: {
        200: z.object({
          balances: z.array(z.object({
            currency: z.string(),
            amount: z.number(),
            reserved: z.number(),
          })),
        }),
      },
    },
  }, async (request, reply) => {
    const wise = getWiseClient();

    if (!wise.isConfigured()) {
      return reply.status(503).send({
        error: 'Wise not configured',
        message: 'Wise API token is not configured',
        statusCode: 503,
      });
    }

    try {
      const balances = await wise.getBalances();

      const mapped = balances.map(b => ({
        currency: b.currency,
        amount: b.amount.value,
        reserved: b.reservedAmount.value,
      }));

      console.log(`[Wise balance] Returning:`, JSON.stringify(mapped));

      return { balances: mapped };
    } catch (err) {
      request.log.error(err, 'Failed to fetch Wise balances');
      return reply.status(500).send({
        error: 'Wise API error',
        message: err instanceof Error ? err.message : 'Failed to fetch Wise balances',
        statusCode: 500,
      });
    }
  });

  /**
   * GET /api/wise-recipients/wise-accounts - List accounts from Wise API
   * Returns all external recipients from Wise for selection
   */
  fastify.get('/wise-accounts', {
    schema: {
      response: {
        200: z.object({
          accounts: z.array(z.object({
            id: z.number(),
            name: z.string(),
            nickname: z.string().nullable(),
            email: z.string().nullable(),
            currency: z.string(),
            country: z.string(),
            type: z.string(),
            accountSummary: z.string(),
          })),
        }),
      },
    },
  }, async (request, reply) => {
    const wise = getWiseClient();

    if (!wise.isConfigured()) {
      return reply.status(503).send({
        error: 'Wise not configured',
        message: 'Wise API token is not configured',
        statusCode: 503,
      });
    }

    try {
      const recipients = await wise.listRecipients();

      return {
        accounts: recipients.map(r => ({
          id: r.id,
          name: r.name?.fullName || '',
          nickname: r.nickname || null,
          email: r.email || r.details?.email || r.details?.interacAccount || null,
          currency: r.currency,
          country: r.country,
          type: r.type,
          accountSummary: r.accountSummary,
          // Include UUID for Wise-to-Wise transfers
          contactUuid: r.contactUuid || null,
        })),
      };
    } catch (err) {
      request.log.error(err, 'Failed to fetch Wise accounts');
      return reply.status(500).send({
        error: 'Wise API error',
        message: err instanceof Error ? err.message : 'Failed to fetch Wise accounts',
        statusCode: 500,
      });
    }
  });

  /**
   * POST /api/wise-recipients - Create a new recipient
   */
  fastify.post('/', {
    schema: {
      body: createRecipientSchema,
      response: {
        201: wiseRecipientSchema,
      },
    },
  }, async (request, reply) => {
    const { qboVendorId, payeeName, wiseEmail, targetCurrency, wiseContactId } = request.body as z.infer<typeof createRecipientSchema>;

    try {
      const recipient = await prisma.wiseRecipient.create({
        data: {
          qboVendorId,
          payeeName,
          wiseEmail,
          targetCurrency,
          wiseContactId: wiseContactId ? String(wiseContactId) : null,
        },
      });

      return reply.status(201).send({
        ...recipient,
        createdAt: recipient.createdAt.toISOString(),
        updatedAt: recipient.updatedAt.toISOString(),
      });
    } catch (err) {
      // Handle unique constraint violation
      if ((err as { code?: string }).code === 'P2002') {
        return reply.status(409).send({
          error: 'Recipient already exists',
          message: `A recipient mapping for "${payeeName}" already exists`,
          statusCode: 409,
        });
      }
      throw err;
    }
  });

  /**
   * PUT /api/wise-recipients/:id - Update a recipient
   */
  fastify.put('/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      body: updateRecipientSchema,
      response: {
        200: wiseRecipientSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const updates = request.body as z.infer<typeof updateRecipientSchema>;

    try {
      // Clear cached contact ID if email changes
      const data: Record<string, string | null> = { ...updates };
      if (updates.wiseEmail) {
        data.wiseContactId = null;
      }

      const recipient = await prisma.wiseRecipient.update({
        where: { id },
        data,
      });

      return {
        ...recipient,
        createdAt: recipient.createdAt.toISOString(),
        updatedAt: recipient.updatedAt.toISOString(),
      };
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        return reply.status(404).send({
          error: 'Not found',
          message: 'Recipient not found',
          statusCode: 404,
        });
      }
      throw err;
    }
  });

  /**
   * DELETE /api/wise-recipients/:id - Delete a recipient
   */
  fastify.delete('/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    try {
      await prisma.wiseRecipient.delete({
        where: { id },
      });

      return reply.status(204).send();
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') {
        return reply.status(404).send({
          error: 'Not found',
          message: 'Recipient not found',
          statusCode: 404,
        });
      }
      throw err;
    }
  });
};
