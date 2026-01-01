# Fortium Payouts

> Control/validation layer for partner and subcontractor payouts
> Last Updated: 2026-01-01

## Project Overview

Payouts is a validation layer that ensures bills approved in PartnerConnect meet all control requirements before payment is executed via Bill.com (US) or Wise (Canada).

**Design Document:** `docs/plans/2026-01-01-payouts-design.md`

## Technology Stack

### Backend
- **Runtime**: Node.js 20 (Alpine)
- **Framework**: Fastify with TypeScript
- **Validation**: Zod schemas (contract-first)
- **ORM**: Prisma with PostgreSQL (Supabase)
- **Logging**: Pino with pino-pretty (dev)
- **API Docs**: Swagger/OpenAPI via @fastify/swagger

### Frontend
- **Framework**: React 18 with TypeScript
- **Build**: Vite
- **Styling**: Tailwind CSS

### Infrastructure
- **Database**: Supabase PostgreSQL
- **Deployment**: Render.com
- **Repository**: Public (fortiumpartners org) - NO SECRETS IN CODE

## Integrations

| System | Purpose | Auth |
|--------|---------|------|
| PartnerConnect | Bills data | OAuth2 client credentials (Auth0) |
| fpqbo | QBO invoice/bill data | API key |
| Bill.com | US payments | API key |
| Wise | Canada payments | API key |

## Development Commands

```bash
# Install dependencies
cd backend && npm install
cd frontend && npm install

# Run development
docker compose up -d

# Database
docker compose exec api npx prisma generate
docker compose exec api npx prisma db push
docker compose exec api npx prisma migrate dev --name <name>
```

## Environment Variables

See `.env.example` for required variables. Never commit `.env`.

## Port Allocation

| Service   | Internal | External |
|-----------|----------|----------|
| API       | 8000     | TBD      |
| Frontend  | 3000     | TBD      |

## Related Projects

- `../atlas` - Pattern reference (Fastify + Prisma + React)
- `../outbound` - Pattern reference
- `../fpqbo` - QuickBooks API service
- `../pipelinemgr` - PartnerConnect integration patterns
