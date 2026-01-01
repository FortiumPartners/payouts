# Fortium Payouts - Design Document

> Control/validation layer for partner and subcontractor payouts
> Created: 2026-01-01

## Overview

**Purpose:** Validate and execute payouts to partners and subcontractors across PartnerConnect projects.

**Core Flow:**
1. User loads page → fetches "approved but not paid" bills from PartnerConnect
2. System runs control checks against each bill
3. Bills passing all controls can be paid immediately (one bill, one payment)
4. Payment executed via Bill.com (US tenants) or Wise (Canada tenants)

**Tenancy Model:**
- PartnerConnect tenant → 1:1 → QBO company → payment processor
- US tenant → Bill.com
- Canada tenant → Wise

**Future State:** Auto-pay when invoice confirmed paid + proving period elapsed.

## Control Checks

Before a bill can be paid, it must pass these controls:

| Control | Source | Rule |
|---------|--------|------|
| Invoice paid | QBO (via fpqbo) | Related invoice marked paid |
| Invoice not voided | QBO (via fpqbo) | Invoice not voided after payment |
| Payee exists | Bill.com / Wise | Vendor exists in payment system |
| Proving period | Config | 24 hours elapsed since payment confirmed (adjustable) |
| Amount valid | QBO (via fpqbo) | Pay amount ≤ bill amount in QBO |

**Control Status per Bill:**
- ✅ Pass
- ❌ Fail (with reason)
- ⏳ Pending (e.g., proving period not elapsed)

Bills with all controls ✅ = ready to pay.

## Tech Stack

**Stack (following atlas/outbound pattern):**
- **Backend:** Node.js 20 + Fastify + TypeScript + Zod
- **Database:** Prisma + Supabase PostgreSQL
- **Frontend:** React 18 + Vite + Tailwind
- **Deployment:** Render.com (public repo in fortiumpartners org)

**Integrations:**

| System | Purpose | Method |
|--------|---------|--------|
| PartnerConnect API | Fetch approved-but-not-paid bills | OAuth2 client credentials (Auth0) |
| fpqbo API | Invoice status, bill amounts | API key |
| Bill.com API | Execute US payments, verify payee | API |
| Wise API | Execute Canada payments, verify payee | API |

**Auth:**
- Google OAuth, @fortiumpartners.com domain only
- Allowlist table with manually added emails

## Data Model

**Core Entities:**

```prisma
model Tenant {
  id                  String   @id @default(cuid())
  name                String   // "US" or "Canada"
  pcTenantId          String   @unique // PartnerConnect tenant ID
  qboCompanyId        String
  paymentProcessor    String   // "bill_com" or "wise"
  provingPeriodHours  Int      @default(24)
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  payments            PaymentRecord[]
}

model AdminUser {
  id          String    @id @default(cuid())
  email       String    @unique
  createdAt   DateTime  @default(now())
  lastLoginAt DateTime?
}

model PaymentRecord {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  pcBillId        String   // PartnerConnect bill ID
  qboInvoiceId    String
  payeeVendorId   String   // Bill.com or Wise vendor ID
  amount          Decimal
  status          String   // pending_controls, ready, paid, failed
  controlResults  Json     // { invoicePaid: true, ... }
  paidAt          DateTime?
  paymentRef      String?  // External payment reference
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([tenantId])
  @@index([status])
}
```

**Notes:**
- Bills fetched on-demand from PartnerConnect (not cached)
- PaymentRecord created when user initiates payment or for audit trail
- Control results stored as JSON for flexibility as we add controls

## UI

**Single Page App - Dashboard + List**

**Top: Summary Stats**
- Bills ready to pay: X ($Y total)
- Pending controls: X
- Paid today: X ($Y)

**Main: Bills Table**

| Payee | Project | Amount | Controls | Action |
|-------|---------|--------|----------|--------|
| Acme Corp | ProjectX | $5,000 | ✅✅✅✅✅ | ☐ [Pay] |
| Smith LLC | ProjectY | $2,500 | ✅✅❌⏳✅ | — |
| Jones Inc | ProjectZ | $8,000 | ✅✅✅✅✅ | ☐ [Pay] |

**Control icons expand on hover/click** to show details.

**Payment Actions:**
1. **Inline pay** - [Pay] button on each ready row
2. **Detail page** - Click row → detail view → [Pay] button
3. **Batch pay** - Checkboxes on ready rows → [Pay Selected] button

**Filters:**
- Tenant (US / Canada / All)
- Status (Ready / Pending / All)

## API Endpoints

**Auth:**
- `GET /auth/login` - Initiate Google OAuth
- `GET /auth/callback` - OAuth callback
- `GET /auth/logout` - Clear session

**Bills:**
- `GET /api/bills` - Fetch bills from PartnerConnect, run controls, return with status
- `GET /api/bills/:id` - Single bill detail with full control breakdown

**Payments:**
- `POST /api/payments` - Pay single bill `{ billId }`
- `POST /api/payments/batch` - Pay multiple `{ billIds: [...] }`
- `GET /api/payments` - Payment history

**Config:**
- `GET /api/tenants` - List tenants with settings
- `PATCH /api/tenants/:id` - Update proving period, etc.

**Health:**
- `GET /health` - Service health check

## Deployment & Security

**Render.com Setup:**
- **Web Service** - Node.js app (backend serves frontend)
- **Database** - Supabase PostgreSQL (external)

**Required Environment Variables:**
```
# Database
DATABASE_URL=postgres://...  (Supabase)

# Auth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_ALLOWED_DOMAIN=fortiumpartners.com
SESSION_SECRET=...

# Integrations
FPQBO_API_KEY_US=...
FPQBO_API_KEY_CA=...
PARTNERCONNECT_CLIENT_ID=...
PARTNERCONNECT_CLIENT_SECRET=...
PARTNERCONNECT_AUTH0_DOMAIN=...
BILLCOM_API_KEY=...
WISE_API_KEY=...
```

**Security:**
- Public repo → NO secrets in code
- `.env` in `.gitignore`
- Domain-restricted Google OAuth + allowlist
- HTTPS only (Render provides)

## Implementation Phases

### Phase 1: Foundation
- Project scaffolding (backend + frontend)
- Database schema + Prisma setup
- Google OAuth + allowlist auth
- Health check endpoint

### Phase 2: PartnerConnect Integration
- PC API client (OAuth2 client credentials)
- Fetch approved-but-not-paid bills
- Basic bills list UI

### Phase 3: Control Checks
- fpqbo API client
- Implement control checks
- Control status display in UI

### Phase 4: Bill.com Integration
- Bill.com API client
- Payee verification
- Payment execution (US)

### Phase 5: Wise Integration
- Wise API client
- Payee verification
- Payment execution (Canada)

### Phase 6: Polish
- Batch payment
- Payment history
- Dashboard stats
- Error handling + edge cases
