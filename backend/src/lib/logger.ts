/**
 * Pino logger configuration and standalone instance.
 *
 * In production with OTEL_EXPORTER_OTLP_ENDPOINT set, logs are sent to both:
 *   1. stdout (for Render log viewer)
 *   2. Grafana Cloud Loki (via pino-opentelemetry-transport)
 *
 * Exports:
 *   - buildTransport(): transport config for pino/Fastify logger
 *   - logger: standalone pino instance for use outside Fastify routes
 */

import { pino } from 'pino';
import { config } from './config.js';

/**
 * Build pino transport configuration.
 * Returns pino-pretty in dev, dual transport (stdout + OTel) in production,
 * or undefined for plain stdout.
 */
export function buildTransport() {
  if (config.NODE_ENV === 'development') {
    return {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        ignore: 'pid,hostname',
      },
    };
  }

  // Production: send to both stdout and OTel (if configured)
  const otlpEndpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!otlpEndpoint) return undefined; // stdout only

  return {
    targets: [
      // stdout for Render log viewer
      { target: 'pino/file', options: { destination: 1 }, level: 'info' as const },
      // OTel log export for Grafana Cloud Loki
      // pino-opentelemetry-transport reads OTEL_EXPORTER_OTLP_ENDPOINT from env automatically
      {
        target: 'pino-opentelemetry-transport',
        options: {
          resourceAttributes: {
            'service.name': process.env.OTEL_SERVICE_NAME || 'payouts-api',
            'service.version': process.env.npm_package_version || '0.1.0',
          },
          loggerName: process.env.OTEL_SERVICE_NAME || 'payouts-api',
          serviceVersion: process.env.npm_package_version || '0.1.0',
        },
        level: 'info' as const,
      },
    ],
  };
}

/** Redact config shared between Fastify logger and standalone logger */
export const redactConfig = {
  paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  censor: '[REDACTED]',
};

/** Base fields added to every log entry */
export const baseFields = {
  env: config.NODE_ENV,
  service: 'payouts-api',
};

/** Standalone logger for use outside of Fastify routes */
export const logger = pino({
  level: config.NODE_ENV === 'development' ? 'debug' : config.LOG_LEVEL,
  transport: buildTransport(),
  base: baseFields,
  redact: redactConfig,
});

export type Logger = pino.Logger;
