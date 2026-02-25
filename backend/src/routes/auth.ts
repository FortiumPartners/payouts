/**
 * Authentication routes for Fortium Identity OIDC.
 * Uses @fortium/identity-client-fastify plugin.
 * Identity authenticates, Payouts authorizes (admin_users allowlist).
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { identityPlugin } from '@fortium/identity-client/fastify';
import { verifySessionToken, createSessionToken } from '@fortium/identity-client';
import type { FortiumClaims, SessionPayload } from '@fortium/identity-client';

const AUTH_TOKEN_COOKIE = 'auth_token';

const sessionConfig = {
  jwtSecret: config.JWT_SECRET,
  issuer: 'payouts',
};

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register the shared identity plugin
  await fastify.register(identityPlugin, {
    issuer: config.IDENTITY_ISSUER,
    clientId: config.IDENTITY_CLIENT_ID,
    clientSecret: config.IDENTITY_CLIENT_SECRET,
    callbackUrl: config.IDENTITY_CALLBACK_URL,
    frontendUrl: config.FRONTEND_URL,
    jwtSecret: config.JWT_SECRET,
    sessionIssuer: 'payouts',
    sessionExpiresIn: config.JWT_EXPIRES_IN,
    postLoginPath: '/',
    postLogoutPath: '/login',

    // Payouts authorization: admin allowlist
    authorize: async (claims: FortiumClaims) => {
      logger.info(
        { fortiumUserId: claims.fortium_user_id, email: claims.email },
        'OIDC authentication successful'
      );

      const adminUser = await prisma.adminUser.findUnique({
        where: { email: claims.email },
      });

      if (!adminUser) {
        logger.warn({ email: claims.email }, 'User not in admin_users allowlist');
        throw new Error('not_authorized');
      }

      await prisma.adminUser.update({
        where: { email: claims.email },
        data: { lastLoginAt: new Date() },
      });

      return {};
    },

    // Payouts /auth/me response
    getMe: async (session: SessionPayload) => {
      const user = await prisma.adminUser.findUnique({
        where: { email: session.email },
        select: { id: true, email: true, lastLoginAt: true },
      });

      if (!user) {
        throw new Error('User not found');
      }

      return { user };
    },
  });

  /**
   * GET /auth/switch-account
   * Clears Payouts cookies, then redirects to Identity's signout-and-retry
   * which destroys the Identity session and redirects back to Payouts
   * /login?switch=1. The frontend then auto-starts login with account picker.
   */
  fastify.get('/switch-account', async (_request, reply) => {
    reply.clearCookie('auth_token', { path: '/' });
    reply.clearCookie('id_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });
    reply.clearCookie('oidc_state', { path: '/' });

    const identityBase = config.IDENTITY_ISSUER.replace(/\/oidc$/, '');
    const returnTo = `${config.FRONTEND_URL}/login?switch=1`;
    reply.redirect(`${identityBase}/auth/signout-and-retry?client_id=${config.IDENTITY_CLIENT_ID}&return_to=${encodeURIComponent(returnTo)}`);
  });

  /**
   * POST /auth/test-login
   * Test login for E2E testing, Playwright, Claude automation
   */
  fastify.post('/test-login', async (request, reply) => {
    if (process.env.NODE_ENV === 'production') {
      return reply.status(404).send({ error: 'Not found' });
    }

    if (process.env.ENABLE_TEST_AUTH !== 'true') {
      return reply.status(404).send({ error: 'Not found' });
    }

    const testKey = request.headers['x-test-key'];
    if (!process.env.TEST_AUTH_KEY || testKey !== process.env.TEST_AUTH_KEY) {
      logger.warn('Test login attempted with invalid or missing X-Test-Key');
      return reply.status(401).send({ error: 'Invalid test key' });
    }

    const body = request.body as {
      email?: string;
      fortiumUserId?: string;
    };

    if (!body.email) {
      return reply.status(400).send({ error: 'Email is required' });
    }

    const allowedTestDomains = [
      'test.fortium.local',
      'test.example.com',
      'playwright.test',
      'e2e.test',
    ];

    const emailDomain = body.email.split('@')[1]?.toLowerCase();
    if (!emailDomain || !allowedTestDomains.includes(emailDomain)) {
      return reply.status(400).send({
        error: 'Email domain not allowed for test login',
        allowedDomains: allowedTestDomains,
      });
    }

    try {
      const email = body.email.toLowerCase();
      const fortiumUserId = body.fortiumUserId || `test-${Date.now()}`;

      const adminUser = await prisma.adminUser.upsert({
        where: { email },
        create: { email, lastLoginAt: new Date() },
        update: { lastLoginAt: new Date() },
      });

      const sessionToken = await createSessionToken(
        { fortiumUserId, email },
        sessionConfig
      );

      reply.setCookie(AUTH_TOKEN_COOKIE, sessionToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
        path: '/',
        signed: true,
      });

      logger.info(
        { fortiumUserId, email, testLogin: true },
        'TEST LOGIN: Session established via test endpoint'
      );

      return reply.send({
        success: true,
        user: {
          id: adminUser.id,
          email: adminUser.email,
          lastLoginAt: adminUser.lastLoginAt,
        },
        message: 'Test login successful. Session cookie has been set.',
      });
    } catch (error) {
      logger.error({ error, email: body.email }, 'Test login error');
      return reply.status(500).send({ error: 'Test login failed' });
    }
  });
};

/**
 * Auth middleware - validates session and adds user to request.
 * Used by other route files (bills, payments, etc.)
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tokenCookie = request.cookies[AUTH_TOKEN_COOKIE];

  if (!tokenCookie) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  const unsigned = request.unsignCookie(tokenCookie);
  if (!unsigned.valid || !unsigned.value) {
    reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/' });
    return reply.status(401).send({ error: 'Session expired' });
  }

  const session = await verifySessionToken(unsigned.value, sessionConfig);
  if (!session) {
    reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/' });
    return reply.status(401).send({ error: 'Session expired' });
  }

  (request as any).userEmail = session.email;
  (request as any).fortiumUserId = session.fortiumUserId;
}
