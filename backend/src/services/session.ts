/**
 * Session management using JWT tokens in signed cookies.
 * Adapted for Fortium Identity OIDC authentication.
 */

import { SignJWT, jwtVerify } from 'jose';
import { config } from '../lib/config.js';

// Session payload stored in JWT
export interface SessionPayload {
  fortiumUserId: string;
  email: string;
}

/**
 * Create a signed JWT session token for the given user.
 */
export async function createSessionToken(payload: SessionPayload): Promise<string> {
  const secret = new TextEncoder().encode(config.JWT_SECRET);

  return new SignJWT({
    fortiumUserId: payload.fortiumUserId,
    email: payload.email,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(config.JWT_EXPIRES_IN)
    .setIssuer('payouts')
    .sign(secret);
}

/**
 * Verify a session token and extract the payload.
 * Returns null if invalid or expired.
 */
export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const secret = new TextEncoder().encode(config.JWT_SECRET);
    const { payload } = await jwtVerify(token, secret, {
      issuer: 'payouts',
    });

    // Ensure required fields are present
    if (!payload.fortiumUserId || !payload.email) {
      return null;
    }

    return {
      fortiumUserId: payload.fortiumUserId as string,
      email: payload.email as string,
    };
  } catch {
    return null;
  }
}
