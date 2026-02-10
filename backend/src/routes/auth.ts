/**
 * Authentication routes for Fortium Identity OIDC.
 * Identity authenticates, Payouts authorizes (admin_users allowlist).
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { logger } from '../lib/logger.js';
import { identityClient, type OIDCState, type FortiumClaims } from '../lib/identity-client.js';
import { createSessionToken, verifySessionToken, type SessionPayload } from '../services/session.js';

// Cookie names
const OIDC_STATE_COOKIE = 'oidc_state';
const AUTH_TOKEN_COOKIE = 'auth_session';
const ID_TOKEN_COOKIE = 'id_token';
const REFRESH_TOKEN_COOKIE = 'refresh_token';

// Request schemas
const callbackSchema = z.object({
  code: z.string(),
  state: z.string(),
});

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /auth/login
   * Initiates OIDC login flow - redirects to Fortium Identity
   */
  fastify.get('/login', async (_request, reply) => {
    try {
      const { url, state } = await identityClient.generateAuthorizationUrl(
        config.IDENTITY_CALLBACK_URL
      );

      // Store OIDC state in signed cookie
      reply.setCookie(OIDC_STATE_COOKIE, JSON.stringify(state), {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 600, // 10 minutes
        path: '/',
        signed: true,
      });

      logger.info('Redirecting to Identity for authentication');
      reply.redirect(url);
    } catch (error) {
      logger.error({ error }, 'Failed to generate authorization URL');
      reply.redirect(`${config.FRONTEND_URL}/login?error=auth_init_failed`);
    }
  });

  /**
   * GET /auth/callback
   * Handles OIDC callback from Fortium Identity
   */
  fastify.get('/callback', async (request, reply) => {
    try {
      const { code, state } = callbackSchema.parse(request.query);

      // Retrieve and validate OIDC state from cookie
      const stateCookie = request.cookies[OIDC_STATE_COOKIE];
      if (!stateCookie) {
        logger.warn('Missing OIDC state cookie');
        return reply.redirect(`${config.FRONTEND_URL}/login?error=state_missing`);
      }

      // Unsign the cookie
      const unsigned = request.unsignCookie(stateCookie);
      if (!unsigned.valid || !unsigned.value) {
        logger.warn('Invalid OIDC state cookie signature');
        return reply.redirect(`${config.FRONTEND_URL}/login?error=state_invalid`);
      }

      const oidcState: OIDCState = JSON.parse(unsigned.value);

      // Validate state parameter
      if (state !== oidcState.state) {
        logger.warn('OIDC state mismatch');
        return reply.redirect(`${config.FRONTEND_URL}/login?error=state_mismatch`);
      }

      // Clear the state cookie
      reply.clearCookie(OIDC_STATE_COOKIE, { path: '/' });

      // Exchange code for tokens
      const { idToken, refreshToken, claims } = await identityClient.exchangeCode(code, oidcState);

      logger.info(
        { fortiumUserId: claims.fortium_user_id, email: claims.email },
        'OIDC authentication successful'
      );

      // AUTHORIZATION: Check admin_users allowlist
      // Identity authenticates, Payouts authorizes
      const adminUser = await prisma.adminUser.findUnique({
        where: { email: claims.email },
      });

      if (!adminUser) {
        logger.warn({ email: claims.email }, 'User not in admin_users allowlist');
        return reply.redirect(`${config.FRONTEND_URL}/login?error=not_authorized`);
      }

      // Update last login timestamp
      await prisma.adminUser.update({
        where: { email: claims.email },
        data: { lastLoginAt: new Date() },
      });

      // Create Payouts session JWT
      const sessionToken = await createSessionToken({
        fortiumUserId: claims.fortium_user_id,
        email: claims.email,
      });

      // Set auth cookies (sameSite: 'lax' for same-origin deployment)
      reply.setCookie(AUTH_TOKEN_COOKIE, sessionToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/',
        signed: true,
      });

      // Store ID token for potential logout
      reply.setCookie(ID_TOKEN_COOKIE, idToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
        path: '/',
        signed: true,
      });

      // Store refresh token (7-day TTL)
      if (refreshToken) {
        reply.setCookie(REFRESH_TOKEN_COOKIE, refreshToken, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60, // 7 days
          path: '/',
          signed: true,
        });
      }

      // Redirect to frontend dashboard
      logger.info({ email: claims.email }, 'Session created for user');
      reply.redirect(`${config.FRONTEND_URL}/`);
    } catch (error) {
      const err = error as Error;
      logger.error({
        message: err.message,
        name: err.name,
        stack: err.stack,
      }, 'OIDC callback error');

      if (error instanceof z.ZodError) {
        return reply.redirect(`${config.FRONTEND_URL}/login?error=invalid_callback`);
      }

      reply.redirect(`${config.FRONTEND_URL}/login?error=callback_failed`);
    }
  });

  /**
   * GET /auth/me
   * Returns current authenticated user
   * Response shape: { user: { id, email, lastLoginAt } }
   */
  fastify.get('/me', async (request, reply) => {
    const tokenCookie = request.cookies[AUTH_TOKEN_COOKIE];

    if (!tokenCookie) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    // Unsign the cookie
    const unsigned = request.unsignCookie(tokenCookie);
    if (!unsigned.valid || !unsigned.value) {
      reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      return reply.status(401).send({ error: 'Session expired' });
    }

    const session = await verifySessionToken(unsigned.value);
    if (!session) {
      reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      return reply.status(401).send({ error: 'Session expired' });
    }

    // Fetch user from database to get full details
    const user = await prisma.adminUser.findUnique({
      where: { email: session.email },
      select: { id: true, email: true, lastLoginAt: true },
    });

    if (!user) {
      reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      return reply.status(401).send({ error: 'User not found' });
    }

    return { user };
  });

  /**
   * POST /auth/test-login
   * Test login for E2E testing, Playwright, Claude automation
   *
   * SECURITY: 5-layer protection:
   * - Layer 1: Never available in production
   * - Layer 2: Must be explicitly enabled via env var
   * - Layer 3: Requires secret API key
   * - Layer 4: Only allows test email domains
   * - Layer 5: Audit logged
   */
  fastify.post('/test-login', async (request, reply) => {
    // Layer 1: Never in production
    if (process.env.NODE_ENV === 'production') {
      return reply.status(404).send({ error: 'Not found' });
    }

    // Layer 2: Must be explicitly enabled
    if (process.env.ENABLE_TEST_AUTH !== 'true') {
      return reply.status(404).send({ error: 'Not found' });
    }

    // Layer 3: Require test API key
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

    // Layer 4: Only allow test email domains
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

      // Create or update admin user for test
      const adminUser = await prisma.adminUser.upsert({
        where: { email },
        create: {
          email,
          lastLoginAt: new Date(),
        },
        update: {
          lastLoginAt: new Date(),
        },
      });

      // Create Payouts session JWT (same as normal auth flow)
      const sessionToken = await createSessionToken({
        fortiumUserId,
        email,
      });

      // Set auth cookie (same as normal auth flow, same-origin)
      reply.setCookie(AUTH_TOKEN_COOKIE, sessionToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400, // 24 hours
        path: '/',
        signed: true,
      });

      // Layer 5: Audit log
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

  /**
   * POST /auth/refresh
   * Exchange refresh token for new tokens
   */
  fastify.post('/refresh', async (request, reply) => {
    const refreshCookie = request.cookies[REFRESH_TOKEN_COOKIE];
    if (!refreshCookie) {
      return reply.status(401).send({ error: 'No refresh token' });
    }

    const unsigned = request.unsignCookie(refreshCookie);
    if (!unsigned.valid || !unsigned.value) {
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      return reply.status(401).send({ error: 'Invalid refresh token' });
    }

    try {
      const tokens = await identityClient.refreshToken(unsigned.value);

      // Create new session
      const sessionToken = await createSessionToken({
        fortiumUserId: (request as any).fortiumUserId || 'unknown',
        email: (request as any).userEmail || 'unknown',
      });

      reply.setCookie(AUTH_TOKEN_COOKIE, sessionToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 86400,
        path: '/',
        signed: true,
      });

      if (tokens.idToken) {
        reply.setCookie(ID_TOKEN_COOKIE, tokens.idToken, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 86400,
          path: '/',
          signed: true,
        });
      }

      if (tokens.refreshToken) {
        reply.setCookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
          httpOnly: true,
          secure: config.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 7 * 24 * 60 * 60,
          path: '/',
          signed: true,
        });
      }

      reply.send({ success: true });
    } catch (error) {
      logger.error({ error }, 'Token refresh failed');
      reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      reply.clearCookie(ID_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
      return reply.status(401).send({ error: 'Token refresh failed' });
    }
  });

  /**
   * GET /auth/logout
   * Clears session and redirects to login (or Identity logout)
   */
  fastify.get('/logout', async (request, reply) => {
    // Get ID token for logout hint
    const idTokenCookie = request.cookies[ID_TOKEN_COOKIE];
    let idToken: string | undefined;
    if (idTokenCookie) {
      const unsigned = request.unsignCookie(idTokenCookie);
      if (unsigned.valid && unsigned.value) {
        idToken = unsigned.value;
      }
    }

    // Clear all auth cookies
    reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    reply.clearCookie(ID_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });

    logger.info('User logged out');

    // Redirect to Identity logout for full SSO logout
    const logoutUrl = identityClient.getLogoutUrl(idToken, config.FRONTEND_URL);
    return reply.redirect(logoutUrl);
  });

  /**
   * POST /auth/logout
   * API logout endpoint - returns logout URL for frontend to handle
   */
  fastify.post('/logout', async (request, reply) => {
    // Get ID token for logout hint
    const idTokenCookie = request.cookies[ID_TOKEN_COOKIE];
    let idToken: string | undefined;
    if (idTokenCookie) {
      const unsigned = request.unsignCookie(idTokenCookie);
      if (unsigned.valid && unsigned.value) {
        idToken = unsigned.value;
      }
    }

    // Clear all auth cookies
    reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    reply.clearCookie(ID_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });

    logger.info('User logged out');

    // Return logout URL for frontend to redirect to Identity logout if desired
    const logoutUrl = identityClient.getLogoutUrl(idToken, config.FRONTEND_URL);

    reply.send({
      success: true,
      logoutUrl, // Frontend can redirect here for full SSO logout
    });
  });
};

/**
 * Auth middleware - validates session and adds user to request
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const tokenCookie = request.cookies[AUTH_TOKEN_COOKIE];

  if (!tokenCookie) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  // Unsign the cookie
  const unsigned = request.unsignCookie(tokenCookie);
  if (!unsigned.valid || !unsigned.value) {
    reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    return reply.status(401).send({ error: 'Session expired' });
  }

  const session = await verifySessionToken(unsigned.value);
  if (!session) {
    reply.clearCookie(AUTH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    reply.clearCookie(REFRESH_TOKEN_COOKIE, { path: '/', sameSite: 'lax', secure: config.NODE_ENV === 'production' });
    return reply.status(401).send({ error: 'Session expired' });
  }

  // Add session to request for downstream use
  (request as any).userEmail = session.email;
  (request as any).fortiumUserId = session.fortiumUserId;
}
