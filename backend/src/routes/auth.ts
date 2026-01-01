/**
 * Authentication routes for Google OAuth.
 * Follows fpqbo pattern: domain-restricted + allowlist.
 */

import { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '../lib/prisma.js';
import { config } from '../lib/config.js';
import { createSessionToken, verifySessionToken } from '../services/session.js';

// Google OAuth endpoints
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';

export const authRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /auth/login - Initiate Google OAuth flow
   */
  fastify.get('/login', async (request, reply) => {
    const state = Math.random().toString(36).substring(2);

    // Store state in cookie for CSRF protection
    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 300, // 5 minutes
      path: '/',
    });

    const params = new URLSearchParams({
      client_id: config.GOOGLE_CLIENT_ID,
      redirect_uri: `${config.BASE_URL}/auth/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });

    return reply.redirect(`${GOOGLE_AUTH_URL}?${params}`);
  });

  /**
   * GET /auth/callback - Handle OAuth callback from Google
   */
  fastify.get('/callback', async (request: FastifyRequest<{
    Querystring: { code?: string; state?: string; error?: string };
  }>, reply) => {
    const { code, state, error } = request.query;

    // Handle OAuth errors
    if (error) {
      fastify.log.error(`OAuth error: ${error}`);
      return reply.redirect(`${config.FRONTEND_URL}/login?error=oauth_failed`);
    }

    // Validate state (CSRF protection)
    const storedState = request.cookies.oauth_state;
    if (!state || state !== storedState) {
      fastify.log.warn('OAuth state mismatch');
      return reply.redirect(`${config.FRONTEND_URL}/login?error=invalid_state`);
    }

    // Clear state cookie
    reply.clearCookie('oauth_state', { path: '/' });

    if (!code) {
      return reply.redirect(`${config.FRONTEND_URL}/login?error=no_code`);
    }

    try {
      // Exchange code for tokens
      const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.GOOGLE_CLIENT_ID,
          client_secret: config.GOOGLE_CLIENT_SECRET,
          redirect_uri: `${config.BASE_URL}/auth/callback`,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        fastify.log.error(`Token exchange failed: ${errorData}`);
        return reply.redirect(`${config.FRONTEND_URL}/login?error=token_failed`);
      }

      const tokens = await tokenResponse.json() as { access_token: string };

      // Get user info
      const userResponse = await fetch(GOOGLE_USERINFO_URL, {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });

      if (!userResponse.ok) {
        return reply.redirect(`${config.FRONTEND_URL}/login?error=userinfo_failed`);
      }

      const userInfo = await userResponse.json() as { email: string; name?: string };
      const email = userInfo.email;

      fastify.log.info(`OAuth callback for email: ${email}`);

      // Validate domain
      const domain = email.split('@')[1];
      if (domain !== config.GOOGLE_ALLOWED_DOMAIN) {
        fastify.log.warn(`Domain validation failed for ${email}`);
        return reply.redirect(`${config.FRONTEND_URL}/login?error=invalid_domain`);
      }

      // Check allowlist (admin_users table)
      const adminUser = await prisma.adminUser.findUnique({
        where: { email },
      });

      if (!adminUser) {
        fastify.log.warn(`Allowlist validation failed for ${email}`);
        return reply.redirect(`${config.FRONTEND_URL}/login?error=not_authorized`);
      }

      // Update last login
      await prisma.adminUser.update({
        where: { email },
        data: { lastLoginAt: new Date() },
      });

      // Create session cookie
      const sessionToken = createSessionToken(email);

      reply.setCookie('auth_session', sessionToken, {
        httpOnly: true,
        secure: config.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      fastify.log.info(`Session created for ${email}`);
      return reply.redirect(`${config.FRONTEND_URL}/`);

    } catch (err) {
      fastify.log.error(err, 'OAuth callback error');
      return reply.redirect(`${config.FRONTEND_URL}/login?error=auth_failed`);
    }
  });

  /**
   * GET /auth/logout - Clear session and redirect to login
   */
  fastify.get('/logout', async (request, reply) => {
    reply.clearCookie('auth_session', { path: '/' });
    return reply.redirect(`${config.FRONTEND_URL}/login`);
  });

  /**
   * GET /auth/me - Get current user info
   */
  fastify.get('/me', async (request, reply) => {
    const token = request.cookies.auth_session;

    if (!token) {
      return reply.status(401).send({ error: 'Not authenticated' });
    }

    const email = verifySessionToken(token);
    if (!email) {
      reply.clearCookie('auth_session', { path: '/' });
      return reply.status(401).send({ error: 'Session expired' });
    }

    const user = await prisma.adminUser.findUnique({
      where: { email },
      select: { id: true, email: true, lastLoginAt: true },
    });

    if (!user) {
      reply.clearCookie('auth_session', { path: '/' });
      return reply.status(401).send({ error: 'User not found' });
    }

    return { user };
  });
};

/**
 * Auth middleware - validates session and adds user to request
 */
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const token = request.cookies.auth_session;

  if (!token) {
    return reply.status(401).send({ error: 'Not authenticated' });
  }

  const email = verifySessionToken(token);
  if (!email) {
    reply.clearCookie('auth_session', { path: '/' });
    return reply.status(401).send({ error: 'Session expired' });
  }

  // Add email to request for downstream use
  (request as any).userEmail = email;
}
