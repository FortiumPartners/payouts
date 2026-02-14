# Fortium Payouts

> Control/validation layer for partner and subcontractor payouts
> Last Updated: 2026-01-09

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
- **Database**: Render PostgreSQL (shared `fortium-render-production-postgres`)
- **Deployment**: Render.com
- **Repository**: Public (fortiumpartners org) - NO SECRETS IN CODE

## Integrations

| System | Purpose | Auth |
|--------|---------|------|
| PartnerConnect | Bills data | OAuth2 client credentials (Auth0) |
| fpqbo | QBO invoice/bill data | API key |
| Bill.com | US payments | API key |
| Wise | Canada payments | API key |

## Local Development

Local dev connects directly to Render PostgreSQL (no local database).

### Development URLs

| Service  | URL |
|----------|-----|
| Frontend | http://localhost:3007 |
| API      | http://localhost:8005 |

### Commands

```bash
# Install dependencies
cd backend && npm install
cd frontend && npm install

# Run development
docker compose up -d

# Database (connects to Render postgres)
docker compose exec api npx prisma generate
docker compose exec api npx prisma db push
```

## Port Allocation

| Service   | Internal | External (Dev) |
|-----------|----------|----------------|
| API       | 8000     | 8005           |
| Frontend  | 3000     | 3007           |

## Deployment (Render.com)

### Production Services

| Service | URL |
|---------|-----|
| API | https://payouts-czsw.onrender.com |
| Frontend | https://payouts-frontend.onrender.com |
| Database | `payouts` db on `fortium-render-production-postgres` |

### Service IDs
- `srv-d5fbvlshg0os73f6p98g` - payouts-prod-api
- `srv-d62botshg0os738btr40` - payouts-frontend

**Required env vars for production:**
- `DATABASE_URL` - Render Postgres internal connection string
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` - OAuth credentials
- `BASE_URL` - Full URL of deployed API
- `VITE_API_URL` - API URL for frontend

## Related Projects

- `../atlas` - Pattern reference (Fastify + Prisma + React)
- `../outbound` - Pattern reference
- `../fpqbo` - QuickBooks API service
- `../pipelinemgr` - PartnerConnect integration patterns
