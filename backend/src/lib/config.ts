import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(8000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Fortium Identity (OIDC)
  IDENTITY_ISSUER: z.string().url().default('https://identity.fortiumsoftware.com'),
  IDENTITY_CLIENT_ID: z.string().default('payouts'),
  IDENTITY_CLIENT_SECRET: z.string(),
  IDENTITY_CALLBACK_URL: z.string().url(),

  // JWT (for Payouts sessions)
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('24h'),

  // URLs
  BASE_URL: z.string().default('http://localhost:8000'),
  FRONTEND_URL: z.string().default('http://localhost:3007'),

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
  BILLCOM_USERNAME: z.string().optional(),
  BILLCOM_PASSWORD: z.string().optional(),
  BILLCOM_DEV_KEY: z.string().optional(),
  BILLCOM_ORG_ID: z.string().optional(),
  BILLCOM_MFA_ID: z.string().optional(),
  BILLCOM_DEVICE_ID: z.string().default('fortium-payouts'),

  // Wise
  WISE_API_URL: z.string().default('https://api.wise.com'),
  WISE_API_TOKEN: z.string().optional(),
  WISE_SANDBOX: z.string().default('false'), // 'true' for sandbox

  // Email (Postmark)
  POSTMARK_API_TOKEN: z.string().optional(),
  POSTMARK_FROM_EMAIL: z.string().default('accounting@fortiumpartners.com'),
  POSTMARK_FROM_NAME: z.string().default('Fortium Partners'),
  FORTIUM_FINANCE_EMAIL: z.string().default('accounting@fortiumpartners.com'),
});

export type Env = z.infer<typeof envSchema>;

export const config = envSchema.parse(process.env);
