import { FastifyPluginAsync } from 'fastify';
import { healthResponseSchema, HealthResponse } from '../schemas/common.js';
import { prisma } from '../lib/prisma.js';

const SERVER_START_TIME = new Date().toISOString();

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  // Basic health check
  fastify.get('/health', {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async (): Promise<HealthResponse> => {
    return {
      status: 'healthy',
      service: 'payouts-api',
      timestamp: new Date().toISOString(),
      startedAt: SERVER_START_TIME,
    };
  });

  // TEMP: Debug endpoint to get CA payees for data recovery
  fastify.get('/debug/ca-payees', async () => {
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

  // TEMP: Debug endpoint to get current CA bill details from PartnerConnect
  fastify.get('/debug/ca-bills', async () => {
    const { getPartnerConnectClient } = await import('../services/partnerconnect.js');
    const client = getPartnerConnectClient();
    const bills = await client.getPayableBills();
    const caBills = bills.filter(b => ['CA', 'CAN', 'Canada'].includes(b.tenantCode));
    return {
      bills: caBills.map(b => ({
        uid: b.uid,
        payeeName: b.resourceName,
        qboVendorId: b.qboVendorId,
        amount: b.adjustedBillPayment,
      })),
    };
  });

  // TEMP: Debug endpoint to get a single bill with full details
  fastify.get('/debug/bill/:id', async (request) => {
    const { id } = request.params as { id: string };
    const { getPartnerConnectClient } = await import('../services/partnerconnect.js');
    const client = getPartnerConnectClient();
    const bill = await client.getBill(id);
    return { bill };
  });

  // TEMP: Debug endpoint to create Wise recipient mappings for data recovery
  fastify.post('/debug/wise-recipients', async (request) => {
    const { qboVendorId, payeeName, wiseEmail, targetCurrency, wiseContactId } = request.body as {
      qboVendorId: string;
      payeeName: string;
      wiseEmail: string;
      targetCurrency?: string;
      wiseContactId?: string;
    };

    const recipient = await prisma.wiseRecipient.upsert({
      where: { qboVendorId },
      create: {
        qboVendorId,
        payeeName,
        wiseEmail,
        targetCurrency: targetCurrency || 'CAD',
        wiseContactId: wiseContactId || null,
      },
      update: {
        payeeName,
        wiseEmail,
        targetCurrency: targetCurrency || 'CAD',
        wiseContactId: wiseContactId || null,
      },
    });

    return { recipient };
  });

  // Health check with database
  fastify.get('/health/db', {
    schema: {
      response: {
        200: healthResponseSchema,
      },
    },
  }, async (): Promise<HealthResponse> => {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'connected';
    } catch (error) {
      fastify.log.error(error, 'Database health check failed');
    }

    return {
      status: dbStatus === 'connected' ? 'healthy' : 'degraded',
      service: 'payouts-api',
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  });
};
