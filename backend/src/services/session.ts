/**
 * Session management using signed cookies.
 * Adapted from fpqbo pattern.
 */

import crypto from 'crypto';
import { config } from '../lib/config.js';

const ALGORITHM = 'aes-256-gcm';
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Create a signed session token for the given email.
 */
export function createSessionToken(email: string): string {
  const payload = JSON.stringify({
    email,
    exp: Date.now() + SESSION_MAX_AGE_MS,
  });

  // Derive key from secret
  const key = crypto.scryptSync(config.SESSION_SECRET, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(payload, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  // Combine iv + authTag + encrypted
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')]).toString('base64url');
}

/**
 * Verify a session token and extract the email.
 * Returns null if invalid or expired.
 */
export function verifySessionToken(token: string): string | null {
  try {
    const data = Buffer.from(token, 'base64url');
    const iv = data.subarray(0, 16);
    const authTag = data.subarray(16, 32);
    const encrypted = data.subarray(32);

    const key = crypto.scryptSync(config.SESSION_SECRET, 'salt', 32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const payload = JSON.parse(decrypted.toString('utf8'));

    // Check expiration
    if (payload.exp < Date.now()) {
      return null;
    }

    return payload.email;
  } catch {
    return null;
  }
}
