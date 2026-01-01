/**
 * Bills API routes.
 * Fetches bills from PartnerConnect and runs control checks.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getPartnerConnectClient, PCBill } from '../services/partnerconnect.js';
import { runControlChecks, ControlCheckResults } from '../services/controls.js';
import { requireAuth } from './auth.js';

// Response schemas
const billWithControlsSchema = z.object({
  uid: z.string(),
  description: z.string(),
  status: z.string(),
  amount: z.number(),
  clientName: z.string(),
  payeeName: z.string(),
  controls: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    reason: z.string().optional(),
  })),
  readyToPay: z.boolean(),
});

const billsResponseSchema = z.object({
  bills: z.array(billWithControlsSchema),
  summary: z.object({
    total: z.number(),
    readyToPay: z.number(),
    pending: z.number(),
  }),
});

export interface BillWithControls {
  uid: string;
  description: string;
  status: string;
  amount: number;
  clientName: string;
  payeeName: string;
  controls: { name: string; passed: boolean; reason?: string }[];
  readyToPay: boolean;
}

export const billsRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', requireAuth);

  /**
   * GET /api/bills - Fetch all approved bills with control status
   */
  fastify.get('/', {
    schema: {
      querystring: z.object({
        tenant: z.enum(['US', 'CA', 'all']).default('all'),
        status: z.enum(['ready', 'pending', 'all']).default('all'),
      }),
      response: {
        200: billsResponseSchema,
      },
    },
  }, async (request, reply) => {
    const { tenant, status } = request.query as { tenant: string; status: string };

    const pcClient = getPartnerConnectClient();

    // Check if configured
    if (!pcClient.isConfigured()) {
      return {
        bills: [],
        summary: { total: 0, readyToPay: 0, pending: 0 },
      };
    }

    try {
      // Fetch approved bills from PartnerConnect
      const rawBills = await pcClient.getApprovedBills();

      // Get tenants for proving period config
      const tenants = await prisma.tenant.findMany();
      const tenantMap = new Map(tenants.map(t => [t.pcTenantId, t]));

      // Run control checks on each bill
      const billsWithControls: BillWithControls[] = await Promise.all(
        rawBills.map(async (bill) => {
          // Determine tenant (for now assume US if not found)
          const tenantConfig = tenantMap.get(bill.clientUid);
          const tenantType: 'US' | 'CA' = tenantConfig?.name === 'Canada' ? 'CA' : 'US';
          const provingPeriod = tenantConfig?.provingPeriodHours || 24;

          const controlResults = await runControlChecks(bill, tenantType, provingPeriod);

          return {
            uid: bill.uid,
            description: bill.description,
            status: bill.status,
            amount: bill.amount,
            clientName: bill.clientName,
            payeeName: bill.payeeName,
            controls: controlResults.controls.map(c => ({
              name: c.name,
              passed: c.passed,
              reason: c.reason,
            })),
            readyToPay: controlResults.readyToPay,
          };
        })
      );

      // Filter by tenant if specified
      let filteredBills = billsWithControls;
      if (tenant !== 'all') {
        // TODO: Filter by tenant once we have that mapping
      }

      // Filter by status if specified
      if (status === 'ready') {
        filteredBills = filteredBills.filter(b => b.readyToPay);
      } else if (status === 'pending') {
        filteredBills = filteredBills.filter(b => !b.readyToPay);
      }

      const summary = {
        total: filteredBills.length,
        readyToPay: filteredBills.filter(b => b.readyToPay).length,
        pending: filteredBills.filter(b => !b.readyToPay).length,
      };

      return { bills: filteredBills, summary };

    } catch (err) {
      fastify.log.error(err, 'Failed to fetch bills');
      return reply.status(500).send({
        error: 'Failed to fetch bills',
        message: String(err),
        statusCode: 500,
      });
    }
  });

  /**
   * GET /api/bills/:id - Get single bill with full control details
   */
  fastify.get('/:id', {
    schema: {
      params: z.object({
        id: z.string(),
      }),
      response: {
        200: billWithControlsSchema,
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const pcClient = getPartnerConnectClient();

    if (!pcClient.isConfigured()) {
      return reply.status(503).send({
        error: 'PartnerConnect not configured',
        message: 'API credentials not set',
        statusCode: 503,
      });
    }

    try {
      const bill = await pcClient.getBill(id);

      // Get tenant config
      const tenant = await prisma.tenant.findFirst({
        where: { pcTenantId: bill.clientUid },
      });

      const tenantType: 'US' | 'CA' = tenant?.name === 'Canada' ? 'CA' : 'US';
      const provingPeriod = tenant?.provingPeriodHours || 24;

      const controlResults = await runControlChecks(bill, tenantType, provingPeriod);

      return {
        uid: bill.uid,
        description: bill.description,
        status: bill.status,
        amount: bill.amount,
        clientName: bill.clientName,
        payeeName: bill.payeeName,
        controls: controlResults.controls.map(c => ({
          name: c.name,
          passed: c.passed,
          reason: c.reason,
        })),
        readyToPay: controlResults.readyToPay,
      };

    } catch (err) {
      fastify.log.error(err, `Failed to fetch bill ${id}`);
      return reply.status(500).send({
        error: 'Failed to fetch bill',
        message: String(err),
        statusCode: 500,
      });
    }
  });
};
