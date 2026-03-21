# Bill Details Enrichment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich the Bill Details panel with dates (trxDate, dueDate from PC), QBO payment status, Wise recipient info, payment history, and aging indicators.

**Architecture:** PC dates are added to the existing bill list response (free — already fetched). All other enrichment data lazy-loads via a new `GET /api/bills/:id/details` endpoint when a bill row is expanded. Each enrichment source (QBO, Wise, PaymentRecord) is fetched independently — one failure doesn't block the others.

**Tech Stack:** Fastify + Zod (backend), fpqbo client (QBO data), Prisma (WiseRecipient + PaymentRecord), React 18 (frontend)

**Spec:** `docs/superpowers/specs/2026-03-21-bill-details-enrichment-design.md`

---

## File Map

| File | Responsibility | Change Type |
|------|---------------|-------------|
| `backend/src/routes/bills.ts` | Bill list response + new details endpoint | Modify |
| `backend/src/services/fpqbo.ts` | QBO bill lookup by doc number | Modify |
| `frontend/src/lib/api.ts` | BillDetails type + API method | Modify |
| `frontend/src/components/BillsList.tsx` | Lazy-load details on expand, render enriched panel | Modify |

No new files. No database migrations.

---

### Task 1: Add trxDate/dueDate to bill list response

**Files:**
- Modify: `backend/src/routes/bills.ts:14-55` (schema + interface + mapping)

- [ ] **Step 1: Add fields to Zod schema and interface**

In `billWithControlsSchema`, add after `billComId`:
```typescript
trxDate: z.string().nullable(),
dueDate: z.string().nullable(),
```

In `BillWithControls` interface, add after `billComId`:
```typescript
trxDate: string | null;
dueDate: string | null;
```

- [ ] **Step 2: Map fields from PCBill in the bill list handler**

In the `unpaidBills.map()` at line ~116, add to the returned object after `billComId`:
```typescript
trxDate: bill.trxDate ? bill.trxDate.toISOString() : null,
dueDate: bill.dueDate ? bill.dueDate.toISOString() : null,
```

- [ ] **Step 3: Map fields in the single bill handler (GET /:id)**

In the return object at line ~395, add after `billComId`:
```typescript
trxDate: bill.trxDate ? bill.trxDate.toISOString() : null,
dueDate: bill.dueDate ? bill.dueDate.toISOString() : null,
```

- [ ] **Step 4: Verify backend compiles**

Run: `cd /Users/burkestudio/projects/payouts/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/bills.ts
git commit -m "feat: add trxDate/dueDate to bill list response"
```

---

### Task 2: Add getBillByDocNumber to fpqbo client

**Files:**
- Modify: `backend/src/services/fpqbo.ts`

The existing `getBill(billId)` takes a QBO bill ID. But from the bill list, we have `externalBillDocNum` (the doc number, like "1047-Croteau") and `externalBillId` (the QBO internal ID). We can use `externalBillId` directly with the existing `getBill()`. However, we also need `getBillPaymentsForBill()` which already exists.

For the details endpoint, we'll use:
- `getBill(externalBillId)` — already exists, returns `QBOBill` with `dueDate`
- `getBillPaymentsForBill(externalBillId)` — already exists, returns `QBOBillPayment[]` with `txnDate`

No changes needed to fpqbo.ts — the methods already exist.

**Skip this task — no fpqbo changes needed.**

---

### Task 3: Add bill details endpoint

**Files:**
- Modify: `backend/src/routes/bills.ts` (add new route)

- [ ] **Step 1: Add Zod response schema for bill details**

Add after the existing `billsResponseSchema`:
```typescript
const billDetailsSchema = z.object({
  qboBillDueDate: z.string().nullable(),
  qboPaidDate: z.string().nullable(),
  wiseRecipientName: z.string().nullable(),
  wisePaymentMethod: z.enum(['wise-to-wise', 'bank', 'email']).nullable(),
  lastPayment: z.object({
    amount: z.number(),
    paidAt: z.string(),
  }).nullable(),
});
```

- [ ] **Step 2: Add imports**

Add to the imports at the top of `bills.ts`:
```typescript
import { getFpqboClient, FpqboError } from '../services/fpqbo.js';
```

- [ ] **Step 3: Add GET /:id/details route**

Add this route BEFORE the existing `GET /:id` route (Fastify matches routes in registration order, and `/:id/details` must not be captured by `/:id`):

```typescript
/**
 * GET /api/bills/:id/details - Lazy-loaded enrichment data for a single bill.
 * Returns QBO dates, Wise recipient info, and payment history.
 * Each enrichment is independent — one failure doesn't block others.
 */
fastify.get('/:id/details', {
  schema: {
    params: z.object({ id: z.string() }),
    response: { 200: billDetailsSchema },
  },
}, async (request, reply) => {
  const { id } = request.params as { id: string };
  const pcClient = getPartnerConnectClient();

  if (!pcClient.isConfigured()) {
    return reply.status(503).send({
      error: 'PartnerConnect not configured',
      message: 'API credentials not set',
      statusCode: 503,
    });
  }

  // Fetch the bill from PC to get tenant, QBO IDs, payee info
  const bill = await pcClient.getBill(id);
  const isCanada = ['CA', 'CAN', 'Canada'].includes(bill.tenantCode);
  const tenantType: 'US' | 'CA' = isCanada ? 'CA' : 'US';

  // Result — each field starts null, enriched independently
  let qboBillDueDate: string | null = null;
  let qboPaidDate: string | null = null;
  let wiseRecipientName: string | null = null;
  let wisePaymentMethod: 'wise-to-wise' | 'bank' | 'email' | null = null;
  let lastPayment: { amount: number; paidAt: string } | null = null;

  // 1. QBO enrichment — bill due date + BillPayment date
  if (bill.externalBillId) {
    try {
      const fpqbo = getFpqboClient(tenantType);
      const qboBill = await fpqbo.getBill(bill.externalBillId);
      qboBillDueDate = qboBill.dueDate ? qboBill.dueDate.toISOString() : null;

      // Check for BillPayment
      try {
        const payments = await fpqbo.getBillPaymentsForBill(bill.externalBillId);
        if (payments.length > 0) {
          qboPaidDate = payments[0].txnDate || null;
        }
      } catch (bpErr) {
        // BillPayment lookup failed — not critical
        if (!(bpErr instanceof FpqboError && bpErr.isNotFound)) {
          fastify.log.warn({ billId: id, err: bpErr }, 'Failed to fetch QBO BillPayments');
        }
      }
    } catch (err) {
      fastify.log.warn({ billId: id, err }, 'Failed to fetch QBO bill for enrichment');
    }
  }

  // 2. Wise recipient enrichment (CA only)
  if (isCanada && bill.qboVendorId) {
    try {
      const recipient = await prisma.wiseRecipient.findUnique({
        where: { qboVendorId: bill.qboVendorId },
      });
      if (recipient) {
        wiseRecipientName = recipient.payeeName;
        if (recipient.wiseContactId) {
          wisePaymentMethod = 'wise-to-wise';
        } else if (recipient.wiseRecipientAccountId) {
          wisePaymentMethod = 'bank';
        } else {
          wisePaymentMethod = 'email';
        }
      }
    } catch (err) {
      fastify.log.warn({ billId: id, err }, 'Failed to fetch Wise recipient');
    }
  }

  // 3. Last payment for this payee
  try {
    const lastPaid = await prisma.paymentRecord.findFirst({
      where: {
        payeeVendorId: bill.qboVendorId || undefined,
        status: 'paid',
      },
      orderBy: { paidAt: 'desc' },
      select: { amount: true, paidAt: true },
    });
    if (lastPaid && lastPaid.paidAt) {
      lastPayment = {
        amount: Number(lastPaid.amount),
        paidAt: lastPaid.paidAt.toISOString(),
      };
    }
  } catch (err) {
    fastify.log.warn({ billId: id, err }, 'Failed to fetch last payment');
  }

  return {
    qboBillDueDate,
    qboPaidDate,
    wiseRecipientName,
    wisePaymentMethod,
    lastPayment,
  };
});
```

- [ ] **Step 4: Verify backend compiles**

Run: `cd /Users/burkestudio/projects/payouts/backend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/bills.ts
git commit -m "feat: add GET /api/bills/:id/details endpoint for lazy enrichment"
```

---

### Task 4: Frontend types and API method

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add trxDate/dueDate to Bill interface**

In the `Bill` interface (line ~23), add after `readyToPay`:
```typescript
trxDate: string | null;
dueDate: string | null;
```

- [ ] **Step 2: Add BillDetails interface**

Add after the `Bill` interface:
```typescript
export interface BillDetails {
  qboBillDueDate: string | null;
  qboPaidDate: string | null;
  wiseRecipientName: string | null;
  wisePaymentMethod: 'wise-to-wise' | 'bank' | 'email' | null;
  lastPayment: { amount: number; paidAt: string } | null;
}
```

- [ ] **Step 3: Add getBillDetails API method**

Add to the `ApiClient` class, after `getBill()`:
```typescript
async getBillDetails(id: string): Promise<BillDetails> {
  return this.request<BillDetails>(`/bills/${id}/details`);
}
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd /Users/burkestudio/projects/payouts/frontend && npx tsc --noEmit`
Expected: no errors (or only pre-existing errors)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add BillDetails type and API method"
```

---

### Task 5: Render enriched Bill Details panel

**Files:**
- Modify: `frontend/src/components/BillsList.tsx:170-385` (BillRow component)

- [ ] **Step 1: Add imports and details cache**

Add to imports at top:
```typescript
import { Bill, ControlResult, BillDetails, api } from '../lib/api';
```

Add `detailsCache` prop to `BillsListProps`:
```typescript
interface BillsListProps {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  controlStates: Map<string, BillControlState>;
  detailsCache: Map<string, BillDetails>;
  onLoadDetails?: (billId: string) => void;
  onPayBill?: (bill: Bill) => void;
  onDismissBill?: (bill: Bill) => void;
}
```

Update `BillRow` props to accept details:
```typescript
function BillRow({
  bill,
  controlState,
  details,
  detailsLoading,
  onExpand,
  onPay,
  onDismiss,
  indented = false,
}: {
  bill: Bill;
  controlState?: BillControlState;
  details?: BillDetails;
  detailsLoading?: boolean;
  onExpand?: (billId: string) => void;
  onPay?: (bill: Bill) => void;
  onDismiss?: (bill: Bill) => void;
  indented?: boolean;
})
```

- [ ] **Step 2: Add details loading to BillRow expand handler**

Replace the `handleExpand` function:
```typescript
const handleExpand = () => {
  const willExpand = !expanded;
  setExpanded(willExpand);
  if (willExpand) {
    onExpand?.(bill.uid);
  }
};
```

- [ ] **Step 3: Add aging helper function**

Add before the `BillRow` component:
```typescript
function getAgingInfo(trxDate: string | null): { days: number; color: string; bgColor: string } | null {
  if (!trxDate) return null;
  const days = Math.floor((Date.now() - new Date(trxDate).getTime()) / (1000 * 60 * 60 * 24));
  if (days < 30) return { days, color: 'text-green-800', bgColor: 'bg-green-100' };
  if (days <= 60) return { days, color: 'text-yellow-800', bgColor: 'bg-yellow-100' };
  return { days, color: 'text-red-800', bgColor: 'bg-red-100' };
}

function formatDate(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('en-CA'); // YYYY-MM-DD format
}
```

- [ ] **Step 4: Replace the Bill Details panel (right column) in BillRow**

Replace the existing `<div>` at line ~318 (the "Bill Details" `<h4>` section) with:
```tsx
<div>
  <h4 className="font-medium mb-3">Bill Details</h4>
  <div className="space-y-3">
    {/* PartnerConnect */}
    <div className="text-sm">
      <div className="text-xs font-semibold text-indigo-600 uppercase tracking-wide mb-1">PartnerConnect</div>
      <dl className="space-y-0.5">
        <div>
          <dt className="text-muted-foreground inline">Bill: </dt>
          <dd className="inline font-mono text-xs">{bill.uid}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground inline">Status: </dt>
          <dd className="inline">{bill.status}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground inline">Trx Date: </dt>
          <dd className="inline font-medium">{formatDate(bill.trxDate)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground inline">Due Date: </dt>
          <dd className="inline font-medium">{formatDate(bill.dueDate)}</dd>
        </div>
      </dl>
    </div>

    {/* QuickBooks */}
    <div className="text-sm">
      <div className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-1">QuickBooks</div>
      <dl className="space-y-0.5">
        <div>
          <dt className="text-muted-foreground inline">Invoice: </dt>
          <dd className="inline font-mono">{bill.qboInvoiceNum || '-'}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground inline">Bill: </dt>
          <dd className="inline font-mono">{bill.qboBillNum || '-'}</dd>
        </div>
        {detailsLoading ? (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span className="text-xs">Loading...</span>
          </div>
        ) : details ? (
          <>
            <div>
              <dt className="text-muted-foreground inline">Bill Due: </dt>
              <dd className="inline font-medium">{formatDate(details.qboBillDueDate)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground inline">Paid: </dt>
              <dd className={`inline font-medium ${details.qboPaidDate ? 'text-green-600' : ''}`}>
                {details.qboPaidDate ? formatDate(details.qboPaidDate) : '-'}
              </dd>
            </div>
          </>
        ) : null}
      </dl>
    </div>

    {/* Wise (CA) or Bill.com (US) */}
    <div className="text-sm">
      <div className={`text-xs font-semibold uppercase tracking-wide mb-1 ${
        bill.tenantCode === 'CA' ? 'text-teal-600' : 'text-sky-600'
      }`}>
        {bill.tenantCode === 'US' ? 'Bill.com' : 'Wise'}
      </div>
      <dl className="space-y-0.5">
        {bill.tenantCode === 'US' ? (
          <div>
            <dt className="text-muted-foreground inline">Bill: </dt>
            <dd className="inline font-mono">{bill.billComId || '-'}</dd>
          </div>
        ) : (
          <>
            {details?.wiseRecipientName ? (
              <>
                <div>
                  <dt className="text-muted-foreground inline">Recipient: </dt>
                  <dd className="inline font-medium">{details.wiseRecipientName}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground inline">Method: </dt>
                  <dd className="inline font-medium capitalize">{details.wisePaymentMethod?.replace(/-/g, ' ') || '-'}</dd>
                </div>
              </>
            ) : detailsLoading ? (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Loading...</span>
              </div>
            ) : (
              <div>
                <dt className="text-muted-foreground inline">Payment: </dt>
                <dd className="inline">CAD transfer</dd>
              </div>
            )}
          </>
        )}
      </dl>
    </div>

    {/* Payment History + Aging */}
    {(details?.lastPayment || bill.trxDate) && (
      <div className="text-sm">
        <div className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">Payment History</div>
        <dl className="space-y-0.5">
          {details?.lastPayment && (
            <div>
              <dt className="text-muted-foreground inline">Last Paid: </dt>
              <dd className="inline font-medium">
                {formatDate(details.lastPayment.paidAt)} — {formatAmount(details.lastPayment.amount)}
              </dd>
            </div>
          )}
          {(() => {
            const aging = getAgingInfo(bill.trxDate);
            if (!aging) return null;
            return (
              <div>
                <dt className="text-muted-foreground inline">Aging: </dt>
                <dd className="inline">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${aging.bgColor} ${aging.color}`}>
                    {aging.days} days
                  </span>
                </dd>
              </div>
            );
          })()}
        </dl>
      </div>
    )}

    {/* Description */}
    {bill.description && (
      <div className="text-sm pt-2 border-t">
        <div className="text-muted-foreground text-xs">{bill.description}</div>
      </div>
    )}
  </div>
</div>
```

- [ ] **Step 5: Wire up details cache and loading in BillsList**

In the `BillsList` component, add state for loading tracking and the details fetch handler. Update the component signature to accept the new props:

```typescript
export function BillsList({ bills, loading, error, viewMode, controlStates, detailsCache, onLoadDetails, onPayBill, onDismissBill }: BillsListProps) {
```

Pass `detailsCache` and `onLoadDetails` through to `ListView` and `GroupedView`, then down to `BillRow`:

In `ListView`, update the `BillRow` call:
```tsx
<BillRow
  key={bill.uid}
  bill={bill}
  controlState={controlStates.get(bill.uid)}
  details={detailsCache.get(bill.uid)}
  detailsLoading={!detailsCache.has(bill.uid) && false}
  onExpand={onLoadDetails}
  onPay={onPayBill}
  onDismiss={onDismissBill}
/>
```

Similarly update the `BillRow` in `PayeeGroupRow`.

- [ ] **Step 6: Verify frontend compiles**

Run: `cd /Users/burkestudio/projects/payouts/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/BillsList.tsx
git commit -m "feat: render enriched Bill Details panel with lazy-loaded data"
```

---

### Task 6: Wire up details fetching in App.tsx

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Add details cache state and fetch handler**

Add state near the other bill-related state:
```typescript
const [billDetailsCache, setBillDetailsCache] = useState<Map<string, BillDetails>>(new Map());
const [detailsLoading, setDetailsLoading] = useState<Set<string>>(new Set());
```

Add the fetch handler:
```typescript
const handleLoadDetails = useCallback(async (billId: string) => {
  // Skip if already cached or loading
  if (billDetailsCache.has(billId) || detailsLoading.has(billId)) return;

  setDetailsLoading(prev => new Set(prev).add(billId));
  try {
    const details = await api.getBillDetails(billId);
    setBillDetailsCache(prev => new Map(prev).set(billId, details));
  } catch (err) {
    console.error('Failed to load bill details:', err);
  } finally {
    setDetailsLoading(prev => {
      const next = new Set(prev);
      next.delete(billId);
      return next;
    });
  }
}, [billDetailsCache, detailsLoading]);
```

Add import for `BillDetails` from `'./lib/api'` and `useCallback` from `'react'`.

- [ ] **Step 2: Pass props to BillsList**

Find the `<BillsList` JSX and add the new props:
```tsx
<BillsList
  bills={filteredBills}
  loading={billsLoading}
  error={billsError}
  viewMode={viewMode}
  controlStates={controlStates}
  detailsCache={billDetailsCache}
  onLoadDetails={handleLoadDetails}
  onPayBill={handlePayBill}
  onDismissBill={handleDismissBill}
/>
```

- [ ] **Step 3: Verify frontend compiles and test locally**

Run: `cd /Users/burkestudio/projects/payouts/frontend && npx tsc --noEmit`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/App.tsx
git commit -m "feat: wire up bill details cache and lazy loading in App"
```

---

### Task 7: Push to main and deploy

- [ ] **Step 1: Push all commits to main**

```bash
git push origin main
```

Render auto-deploys from main.

- [ ] **Step 2: Verify deployment**

Check Render dashboard or wait for deploy to complete. Test by expanding a bill row in the UI and confirming the enriched panel loads.
