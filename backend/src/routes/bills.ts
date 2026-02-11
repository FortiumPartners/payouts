/**
 * Bills API routes.
 * Fetches bills from PartnerConnect and runs control checks.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { getPartnerConnectClient, PCBill } from '../services/partnerconnect.js';
import { runControlChecks, ControlCheckResults } from '../services/controls.js';
import { validateBill, type BillData } from '../services/validation-rules.js';
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
        prisma.paymentRecord.findMany({ where: { status: 'paid' }, select: { pcBillId: true } }),
        prisma.dismissedBill.findMany({ select: { pcBillId: true } }),
      ]);
      const excludedIds = new Set([
        ...paidRecords.map(p => p.pcBillId),
        ...dismissedRecords.map(d => d.pcBillId),
      ]);

      // Filter out bills that have already been paid or dismissed
      const unpaidBills = rawBills.filter(b => !excludedIds.has(b.uid));
      fastify.log.info({ total: rawBills.length, paid: paidRecords.length, dismissed: dismissedRecords.length, unpaid: unpaidBills.length }, 'Bills filtered');

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
   * GET /api/bills/dismissed - List all dismissed bills
   */
  fastify.get('/dismissed', async () => {
    const dismissed = await prisma.dismissedBill.findMany({
      orderBy: { dismissedAt: 'desc' },
    });
    return { dismissed };
  });

  /**
   * POST /api/bills/:id/dismiss - Dismiss a bill from the active queue
   */
  fastify.post('/:id/dismiss', {
    schema: {
      params: z.object({ id: z.string() }),
      body: z.object({
        reason: z.string().min(1),
        dismissedBy: z.string().min(1),
        payeeName: z.string(),
        clientName: z.string(),
        amount: z.number(),
        tenantCode: z.string(),
        description: z.string().optional(),
        qboInvoiceNum: z.string().optional(),
        qboBillNum: z.string().optional(),
      }),
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as {
      reason: string;
      dismissedBy: string;
      payeeName: string;
      clientName: string;
      amount: number;
      tenantCode: string;
      description?: string;
      qboInvoiceNum?: string;
      qboBillNum?: string;
    };

    // Check if already paid
    const paidRecord = await prisma.paymentRecord.findFirst({
      where: { pcBillId: id, status: 'paid' },
    });
    if (paidRecord) {
      return reply.status(409).send({ error: 'Bill has already been paid', statusCode: 409 });
    }

    // Check if already dismissed
    const existing = await prisma.dismissedBill.findUnique({ where: { pcBillId: id } });
    if (existing) {
      return reply.status(409).send({ error: 'Bill is already dismissed', statusCode: 409 });
    }

    const dismissed = await prisma.dismissedBill.create({
      data: {
        pcBillId: id,
        reason: body.reason,
        dismissedBy: body.dismissedBy,
        payeeName: body.payeeName,
        clientName: body.clientName,
        amount: body.amount,
        tenantCode: body.tenantCode,
        description: body.description,
        qboInvoiceNum: body.qboInvoiceNum,
        qboBillNum: body.qboBillNum,
      },
    });

    fastify.log.info({ pcBillId: id, dismissedBy: body.dismissedBy }, 'Bill dismissed');
    return dismissed;
  });

  /**
   * POST /api/bills/:id/restore - Restore a dismissed bill to active queue
   */
  fastify.post('/:id/restore', {
    schema: {
      params: z.object({ id: z.string() }),
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await prisma.dismissedBill.findUnique({ where: { pcBillId: id } });
    if (!existing) {
      return reply.status(404).send({ error: 'Dismissed bill not found', statusCode: 404 });
    }

    await prisma.dismissedBill.delete({ where: { pcBillId: id } });

    fastify.log.info({ pcBillId: id }, 'Bill restored');
    return { success: true, pcBillId: id };
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

  /**
   * POST /api/bills/:id/validate - Run validation rules against a bill
   */
  fastify.post('/:id/validate', {
    schema: {
      params: z.object({ id: z.string() }),
      response: {
        200: z.object({
          billId: z.string(),
          passed: z.boolean(),
          results: z.array(z.object({
            ruleId: z.string(),
            ruleName: z.string(),
            ruleType: z.string(),
            passed: z.boolean(),
            reason: z.string(),
          })),
          failedCount: z.number(),
          passedCount: z.number(),
        }),
      },
    },
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const pcClient = getPartnerConnectClient();

    if (!pcClient.isConfigured()) {
      return reply.status(503).send({
        error: 'PartnerConnect not configured',
        statusCode: 503,
      });
    }

    try {
      const bill = await pcClient.getBill(id);
      const isCanada = ['CA', 'CAN', 'Canada'].includes(bill.tenantCode);

      const billData: BillData = {
        uid: bill.uid,
        payeeName: bill.resourceName,
        clientName: bill.clientName,
        amount: bill.adjustedBillPayment,
        description: bill.description,
        tenantCode: isCanada ? 'CA' : 'US',
        date: bill.trxDate?.toISOString().split('T')[0],
        status: bill.statusCode,
        qboInvoiceNum: bill.externalInvoiceDocNum || null,
        qboBillNum: bill.externalBillDocNum || null,
      };

      // Fetch all bills for duplicate detection
      const rawBills = await pcClient.getPayableBills();
      const allBillData: BillData[] = rawBills.map(b => ({
        uid: b.uid,
        payeeName: b.resourceName,
        clientName: b.clientName,
        amount: b.adjustedBillPayment,
        description: b.description,
        tenantCode: ['CA', 'CAN', 'Canada'].includes(b.tenantCode) ? 'CA' : 'US',
        date: b.trxDate?.toISOString().split('T')[0],
        status: b.statusCode,
      }));

      const result = await validateBill(billData, allBillData);
      return result;
    } catch (err) {
      fastify.log.error(err, `Failed to validate bill ${id}`);
      return reply.status(500).send({
        error: 'Failed to validate bill',
        message: String(err),
        statusCode: 500,
      });
    }
  });
};
