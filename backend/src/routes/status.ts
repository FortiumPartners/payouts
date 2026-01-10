/**
 * Integration status routes.
 * Health checks for all external integrations.
 */

import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { getPartnerConnectClient } from '../services/partnerconnect.js';
import { getFpqboClient } from '../services/fpqbo.js';
import { getBillComClient } from '../services/billcom.js';
import { getWiseClient } from '../services/wise.js';
import { requireAuth } from './auth.js';

type IntegrationStatus = 'connected' | 'error' | 'not_configured';

interface IntegrationCheck {
  name: string;
  status: IntegrationStatus;
  message: string;
  lastChecked: string;
}

const integrationCheckSchema = z.object({
  name: z.string(),
  status: z.enum(['connected', 'error', 'not_configured']),
  message: z.string(),
  lastChecked: z.string(),
});

export const statusRoutes: FastifyPluginAsync = async (fastify) => {
  // Apply auth to all routes
  fastify.addHook('preHandler', requireAuth);

  /**
   * GET /api/status/integrations - Check all integration statuses
   */
  fastify.get('/integrations', {
    schema: {
      response: {
        200: z.object({
          integrations: z.array(integrationCheckSchema),
          allHealthy: z.boolean(),
        }),
      },
    },
  }, async () => {
    const now = new Date().toISOString();

    // Helper to create a check result
    const makeCheck = (name: string, status: IntegrationStatus, message: string): IntegrationCheck => ({
      name, status, message, lastChecked: now,
    });

    // Run all checks in parallel for speed
    const checkPromises = [
      // PartnerConnect
      (async (): Promise<IntegrationCheck> => {
        try {
          const pc = getPartnerConnectClient();
          if (!pc.isConfigured()) {
            return makeCheck('PartnerConnect', 'not_configured', 'Missing credentials');
          }
          await pc.getAccessToken();
          return makeCheck('PartnerConnect', 'connected', 'OAuth connected');
        } catch (err) {
          return makeCheck('PartnerConnect', 'error', err instanceof Error ? err.message : 'Failed');
        }
      })(),

      // QuickBooks US - just check if configured, skip slow health check
      (async (): Promise<IntegrationCheck> => {
        const fpqbo = getFpqboClient('US');
        if (!fpqbo.isConfigured()) {
          return makeCheck('QuickBooks (US)', 'not_configured', 'Missing FPQBO_API_KEY_US');
        }
        return makeCheck('QuickBooks (US)', 'connected', 'Configured');
      })(),

      // QuickBooks CA - just check if configured, skip slow health check
      (async (): Promise<IntegrationCheck> => {
        const fpqbo = getFpqboClient('CA');
        if (!fpqbo.isConfigured()) {
          return makeCheck('QuickBooks (CA)', 'not_configured', 'Missing FPQBO_API_KEY_CA');
        }
        return makeCheck('QuickBooks (CA)', 'connected', 'Configured');
      })(),

      // Bill.com - just check if configured, skip slow health check
      (async (): Promise<IntegrationCheck> => {
        const billcom = getBillComClient();
        if (!billcom.isConfigured()) {
          return makeCheck('Bill.com', 'not_configured', 'Missing credentials');
        }
        return makeCheck('Bill.com', 'connected', 'Configured');
      })(),

      // Wise
      (async (): Promise<IntegrationCheck> => {
        try {
          const wise = getWiseClient();
          if (!wise.isConfigured()) {
            return makeCheck('Wise', 'not_configured', 'Missing WISE_API_TOKEN');
          }
          await wise.getBusinessProfileId();
          return makeCheck('Wise', 'connected', 'API connected');
        } catch (err) {
          return makeCheck('Wise', 'error', err instanceof Error ? err.message : 'Failed');
        }
      })(),
    ];

    const checks = await Promise.all(checkPromises);
    const allHealthy = checks.every(c => c.status === 'connected');

    return { integrations: checks, allHealthy };
  });
};
