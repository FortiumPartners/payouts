import { PrismaClient } from '@prisma/client';
import { config } from './config.js';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Create Prisma client with keepalive for Render PostgreSQL.
 * Render's external connections have aggressive idle timeouts.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: config.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

  // Keepalive ping every 30 seconds to prevent idle disconnects
  const KEEPALIVE_INTERVAL = 30000;
  setInterval(async () => {
    try {
      await client.$queryRaw`SELECT 1`;
    } catch (error) {
      console.warn('[Prisma] Keepalive ping failed, connection may need refresh');
    }
  }, KEEPALIVE_INTERVAL);

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (config.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
