import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Auth
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),
  GOOGLE_ALLOWED_DOMAIN: z.string().default('fortiumpartners.com'),
  SESSION_SECRET: z.string(),
  BASE_URL: z.string().default('http://localhost:8000'),

  // Integrations
  FPQBO_API_URL: z.string().optional(),
  FPQBO_API_KEY_US: z.string().optional(),
  FPQBO_API_KEY_CA: z.string().optional(),
  PARTNERCONNECT_API_URL: z.string().optional(),
  PARTNERCONNECT_CLIENT_ID: z.string().optional(),
  PARTNERCONNECT_CLIENT_SECRET: z.string().optional(),
  PARTNERCONNECT_AUTH0_DOMAIN: z.string().optional(),
  PARTNERCONNECT_AUDIENCE: z.string().optional(),
  BILLCOM_API_URL: z.string().optional(),
  BILLCOM_API_KEY: z.string().optional(),
  WISE_API_URL: z.string().optional(),
  WISE_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export const config = envSchema.parse(process.env);
