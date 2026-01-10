import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  serializerCompiler,
  validatorCompiler,
  ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { config } from './lib/config.js';
import { healthRoutes } from './routes/health.js';
import { authRoutes } from './routes/auth.js';
import { billsRoutes } from './routes/bills.js';
import { paymentsRoutes } from './routes/payments.js';
import { wiseRecipientsRoutes } from './routes/wise-recipients.js';
import { statusRoutes } from './routes/status.js';

const fastify = Fastify({
  logger: {
    level: config.LOG_LEVEL,
    transport:
      config.NODE_ENV === 'development'
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
  },
}).withTypeProvider<ZodTypeProvider>();

// Set up Zod validation
fastify.setValidatorCompiler(validatorCompiler);
fastify.setSerializerCompiler(serializerCompiler);

async function main() {
  // Cookies (for session)
  await fastify.register(cookie, {
    secret: config.SESSION_SECRET,
  });

  // CORS
  await fastify.register(cors, {
    origin: true,
    credentials: true,
  });

  // Swagger/OpenAPI
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: 'Payouts API',
        description: 'Partner and subcontractor payout control system',
        version: '0.1.0',
      },
      servers: [{ url: config.BASE_URL }],
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  });

  // Routes
  await fastify.register(healthRoutes);
  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(billsRoutes, { prefix: '/api/bills' });
  await fastify.register(paymentsRoutes, { prefix: '/api/payments' });
  await fastify.register(wiseRecipientsRoutes, { prefix: '/api/wise-recipients' });
  await fastify.register(statusRoutes, { prefix: '/api/status' });

  // Start server
  try {
    await fastify.listen({ port: config.PORT, host: config.HOST });
    fastify.log.info(`Server running at http://${config.HOST}:${config.PORT}`);
    fastify.log.info(`API docs at http://${config.HOST}:${config.PORT}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

main();
