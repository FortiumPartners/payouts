# Bill Details Enrichment — Design Spec

## Summary

Enrich the Bill Details panel (shown when expanding a bill row) with dates, QBO payment status, Wise recipient info, payment history, and aging. Data comes from PartnerConnect (free), QBO (lazy), Wise mappings (lazy), and Payouts DB (lazy).

## Data Sources & Loading Strategy

### Included in bill list response (free — already fetched from PC)
- **trxDate** — when the bill was created in PartnerConnect
- **dueDate** — payment due date from PartnerConnect

### Lazy-loaded on row expand (`GET /api/bills/:id/details`)
- **QBO bill due date** — from fpqbo bill lookup
- **QBO payment date** — from fpqbo BillPayment query
- **Wise recipient name** — from WiseRecipient DB mapping + contact name
- **Wise payment method** — derived from recipient type (Wise-to-Wise / Bank / Email)
- **Last payment for this payee** — from PaymentRecord table
- **Days aging** — computed on frontend from trxDate (color-coded: green <30d, yellow 30-60d, red >60d)

## Backend Changes

### 1. Add trxDate/dueDate to bill list response

**File:** `backend/src/routes/bills.ts`

Add `trxDate` and `dueDate` to `billWithControlsSchema` and the response mapping:
```typescript
trxDate: z.string().nullable(),  // ISO date
dueDate: z.string().nullable(),  // ISO date
```

Map from PCBill:
```typescript
trxDate: bill.trxDate ? bill.trxDate.toISOString() : null,
dueDate: bill.dueDate ? bill.dueDate.toISOString() : null,
```

### 2. New endpoint: `GET /api/bills/:id/details`

**File:** `backend/src/routes/bills.ts`

Returns enriched data for a single bill. Does NOT duplicate the base bill data — frontend merges.

```typescript
interface BillDetails {
  // QBO
  qboBillDueDate: string | null;
  qboPaidDate: string | null;
  // Wise (CA only)
  wiseRecipientName: string | null;
  wisePaymentMethod: 'wise-to-wise' | 'bank' | 'email' | null;
  // Payment history
  lastPayment: {
    amount: number;
    paidAt: string;
  } | null;
}
```

**Implementation:**
1. Fetch PCBill to get tenant, QBO IDs, resource info
2. If QBO bill doc number exists → `fpqboClient.getBill(docNumber)` for due date
3. If QBO bill ID exists → query fpqbo for BillPayment records matching that bill
4. If CA tenant → query `WiseRecipient` by qboVendorId, derive method from wiseContactId presence
5. Query `PaymentRecord` for most recent payment to this payee (by payeeName or payeeVendorId)

**Error handling:** Each enrichment is independent. If QBO call fails, return nulls for QBO fields but still return Wise and payment data. Never fail the whole endpoint because one enrichment errored.

### 3. fpqbo client additions

**File:** `backend/src/services/fpqbo.ts`

Add method to query BillPayment by bill ID:
```typescript
async getBillPayments(billId: string): Promise<QBOBillPayment[]>
```

This queries fpqbo for BillPayment records associated with a specific QBO bill. Returns empty array if none found.

## Frontend Changes

### 1. Add types

**File:** `frontend/src/lib/api.ts`

Add to `Bill` interface:
```typescript
trxDate: string | null;
dueDate: string | null;
```

Add new interface:
```typescript
interface BillDetails {
  qboBillDueDate: string | null;
  qboPaidDate: string | null;
  wiseRecipientName: string | null;
  wisePaymentMethod: 'wise-to-wise' | 'bank' | 'email' | null;
  lastPayment: { amount: number; paidAt: string } | null;
}
```

Add API method:
```typescript
async getBillDetails(id: string): Promise<BillDetails>
```

### 2. Update BillRow component

**File:** `frontend/src/components/BillsList.tsx`

On expand, call `api.getBillDetails(bill.uid)` and cache the result in component state. Show a loading spinner in the Bill Details panel while fetching.

**Bill Details panel layout (right column):**

```
PARTNERCONNECT
Bill:      Xe6FgQY5fpW50m...
Status:    Approved
Trx Date:  2026-02-15
Due Date:  2026-03-15

QUICKBOOKS
Invoice:   1047
Bill:      1047-Croteau
Bill Due:  2026-03-15
Paid:      2026-03-10 ✓

WISE (or BILL.COM for US)
Recipient: FLUX CIO INC.
Method:    Wise-to-Wise

PAYMENT HISTORY
Last Paid: 2026-02-28 — $13,983.13
Aging:     34 days [yellow badge]
```

**Days aging color coding:**
- Green (<30 days)
- Yellow (30-60 days)
- Red (>60 days)

**Caching:** Store fetched details in a `Map<string, BillDetails>` at the BillsList level. Pass down to BillRow. Don't re-fetch on collapse/expand.

## Files to Modify

| File | Change |
|------|--------|
| `backend/src/routes/bills.ts` | Add trxDate/dueDate to list response; add `GET /:id/details` endpoint |
| `backend/src/services/fpqbo.ts` | Add `getBillPayments()` method |
| `frontend/src/lib/api.ts` | Add trxDate/dueDate to Bill; add BillDetails type + API method |
| `frontend/src/components/BillsList.tsx` | Lazy-load details on expand; render enriched panel |

## What This Does NOT Do

- No new database tables or migrations
- No changes to the bills list table columns (dates only show in expanded panel)
- No changes to payment flow or controls
- No fpqbo changes for US BillPayment lookup (Bill.com bills use a different flow — we just show what we have)
