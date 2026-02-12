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
  tenantCode: z.enum(['US', 'CA']),
  qboInvoiceNum: z.string().nullable(),
  qboBillNum: z.string().nullable(),
  billComId: z.string().nullable(),
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
  tenantCode: 'US' | 'CA';
  qboInvoiceNum: string | null;
  qboBillNum: string | null;
  billComId: string | null;
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
      // Fetch payable bills from PartnerConnect
      const rawBills = await pcClient.getPayableBills();

      // Get already-paid and dismissed bills to filter them out
      const [paidRecords, dismissedRecords] = await Promise.all([
        prisma.paymentRecord.findMany({
          where: { status: 'paid' },
          select: { pcBillId: true },
        }),
        prisma.dismissedBill.findMany({
          select: { pcBillId: true },
        }),
      ]);
      const excludedIds = new Set([
        ...paidRecords.map(p => p.pcBillId),
        ...dismissedRecords.map(d => d.pcBillId),
      ]);

      // Filter out bills that have already been paid or dismissed
      const unpaidBills = rawBills.filter(b => !excludedIds.has(b.uid));
      fastify.log.info({ total: rawBills.length, excluded: excludedIds.size, unpaid: unpaidBills.length }, 'Bills filtered');

      // Get tenants for proving period config
      const tenants = await prisma.tenant.findMany();
      const tenantMap = new Map(tenants.map(t => [t.name, t]));

      // Return bills immediately without control checks (they're slow)
      // Controls are checked on-demand via GET /api/bills/:id
      const billsWithControls: BillWithControls[] = unpaidBills.map((bill) => {
        const isCanada = ['CA', 'CAN', 'Canada'].includes(bill.tenantCode);
        const tenantType: 'US' | 'CA' = isCanada ? 'CA' : 'US';

        return {
          uid: bill.uid,
          description: bill.description,
          status: bill.statusCode,
          amount: bill.adjustedBillPayment,
          clientName: bill.clientName,
          payeeName: bill.resourceName,
          tenantCode: tenantType,
          qboInvoiceNum: bill.externalInvoiceDocNum || null,
          qboBillNum: bill.externalBillDocNum || null,
          billComId: tenantType === 'US' ? (bill.externalBillId || null) : null,
          controls: [], // Controls loaded on-demand
          readyToPay: false, // Unknown until controls checked
        };
      });

      // Filter by tenant if specified
      let filteredBills = billsWithControls;
      if (tenant !== 'all') {
        filteredBills = filteredBills.filter(b => b.tenantCode === tenant);
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
   * GET /api/bills/dismissed - List all dismissed bills
   */
  fastify.get('/dismissed', async () => {
    const dismissed = await prisma.dismissedBill.findMany({
      orderBy: { dismissedAt: 'desc' },
    });
    return {
      dismissed: dismissed.map(d => ({
        ...d,
        amount: Number(d.amount),
      })),
    };
  });

  /**
   * POST /api/bills/:id/dismiss - Dismiss a bill from the active queue
   */
  fastify.post('/:id/dismiss', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        reason: z.string().min(1, 'Reason is required'),
      }),
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { reason } = request.body as { reason: string };
    const user = (request as { user?: { email?: string } }).user;
    const dismissedBy = user?.email || 'unknown';

    // Check if already paid
    const existingPayment = await prisma.paymentRecord.findFirst({
      where: { pcBillId: id, status: 'paid' },
    });
    if (existingPayment) {
      return reply.status(409).send({
        error: 'Cannot dismiss a paid bill',
        message: `Bill ${id} has already been paid`,
        statusCode: 409,
      });
    }

    // Check if already dismissed
    const existingDismissal = await prisma.dismissedBill.findUnique({
      where: { pcBillId: id },
    });
    if (existingDismissal) {
      return reply.status(409).send({
        error: 'Bill already dismissed',
        message: `Bill ${id} was already dismissed by ${existingDismissal.dismissedBy}`,
        statusCode: 409,
      });
    }

    // Fetch bill data for the snapshot
    const pcClient = getPartnerConnectClient();
    const bill = await pcClient.getBill(id);
    const isCanada = ['CA', 'CAN', 'Canada'].includes(bill.tenantCode);

    const dismissed = await prisma.dismissedBill.create({
      data: {
        pcBillId: id,
        reason,
        dismissedBy,
        payeeName: bill.resourceName,
        clientName: bill.clientName,
        amount: bill.adjustedBillPayment,
        tenantCode: isCanada ? 'CA' : 'US',
        description: bill.description || null,
        qboInvoiceNum: bill.externalInvoiceDocNum || null,
        qboBillNum: bill.externalBillDocNum || null,
      },
    });

    fastify.log.info({ billId: id, dismissedBy, reason }, 'Bill dismissed');

    return {
      ...dismissed,
      amount: Number(dismissed.amount),
    };
  });

  /**
   * POST /api/bills/:id/restore - Restore a dismissed bill to the active queue
   */
  fastify.post('/:id/restore', {
    schema: {
      params: z.object({ id: z.string() }),
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const dismissed = await prisma.dismissedBill.findUnique({
      where: { pcBillId: id },
    });

    if (!dismissed) {
      return reply.status(404).send({
        error: 'Not found',
        message: `No dismissed bill with ID: ${id}`,
        statusCode: 404,
      });
    }

    await prisma.dismissedBill.delete({
      where: { pcBillId: id },
    });

    const user = (request as { user?: { email?: string } }).user;
    fastify.log.info({ billId: id, restoredBy: user?.email }, 'Bill restored');

    return { success: true, billId: id };
  });

  /**
   * POST /api/bills/check-controls - Batch check controls for multiple bills
   * Runs control checks in parallel for efficiency
   */
  fastify.post('/check-controls', {
    schema: {
      body: z.object({
        billIds: z.array(z.string()).max(50), // Limit to prevent overload
      }),
      response: {
        200: z.object({
          results: z.record(z.string(), z.object({
            controls: z.array(z.object({
              name: z.string(),
              passed: z.boolean(),
              reason: z.string().optional(),
            })),
            readyToPay: z.boolean(),
          })),
        }),
      },
    },
  }, async (request, reply) => {
    const { billIds } = request.body as { billIds: string[] };

    const pcClient = getPartnerConnectClient();

    if (!pcClient.isConfigured()) {
      return reply.status(503).send({
        error: 'PartnerConnect not configured',
        message: 'API credentials not set',
        statusCode: 503,
      });
    }

    // Get tenant configs
    const tenants = await prisma.tenant.findMany();
    const getTenant = (code: string) => {
      const isCanada = ['CA', 'CAN', 'Canada'].includes(code);
      return tenants.find(t => t.name === (isCanada ? 'Canada' : 'US'));
    };

    // Fetch and check controls in parallel
    const results: Record<string, { controls: { name: string; passed: boolean; reason?: string }[]; readyToPay: boolean }> = {};

    await Promise.all(billIds.map(async (billId) => {
      try {
        const bill = await pcClient.getBill(billId);
        const isCanada = ['CA', 'CAN', 'Canada'].includes(bill.tenantCode);
        const tenantType: 'US' | 'CA' = isCanada ? 'CA' : 'US';
        const tenant = getTenant(bill.tenantCode);
        const provingPeriod = tenant?.provingPeriodHours || 24;

        const controlResults = await runControlChecks(bill, tenantType, provingPeriod);

        results[billId] = {
          controls: controlResults.controls.map(c => ({
            name: c.name,
            passed: c.passed,
            reason: c.reason,
          })),
          readyToPay: controlResults.readyToPay,
        };
      } catch (err) {
        fastify.log.error(err, `Failed to check controls for bill ${billId}`);
        results[billId] = {
          controls: [{ name: 'error', passed: false, reason: String(err) }],
          readyToPay: false,
        };
      }
    }));

    return { results };
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

      // Get tenant config - normalize various formats
      const isCanada = ['CA', 'CAN', 'Canada'].includes(bill.tenantCode);
      const tenantType: 'US' | 'CA' = isCanada ? 'CA' : 'US';
      const tenant = await prisma.tenant.findFirst({
        where: { name: isCanada ? 'Canada' : 'US' },
      });
      const provingPeriod = tenant?.provingPeriodHours || 24;

      const controlResults = await runControlChecks(bill, tenantType, provingPeriod);

      return {
        uid: bill.uid,
        description: bill.description,
        status: bill.statusCode,
        amount: bill.adjustedBillPayment,
        clientName: bill.clientName,     // Client (who we invoice)
        payeeName: bill.resourceName,    // Payee (who we pay)
        tenantCode: tenantType,
        qboInvoiceNum: bill.externalInvoiceDocNum || null,
        qboBillNum: bill.externalBillDocNum || null,
        billComId: tenantType === 'US' ? (bill.externalBillId || null) : null,
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
