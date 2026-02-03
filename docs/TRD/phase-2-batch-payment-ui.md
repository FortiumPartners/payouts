# TRD: Phase 2 - Batch Payment UI

> Technical Requirements Document
> PRD Reference: `docs/PRD/phase-2-batch-payment-ui.md`
> Version: 1.1
> Created: 2026-01-11
> Updated: 2026-01-11
> Status: Ready for Implementation

---

## Execution Environment

| Setting | Value |
|---------|-------|
| Branch | `feature/phase-2-batch-payment-ui` |
| Working Directory | `/Users/burke/projects/payouts` |
| Workflow Command | `/implement-trd` |
| Required Skills | `frontend-developer`, `code-reviewer`, Chrome DevTools MCP |

### Linear Issue Lifecycle

- Move [LINEAR-ID] to "In Progress" when starting implementation
- Move [LINEAR-ID] to "Review" when code complete and PR created
- Move [LINEAR-ID] to "Done" when PR merged

---

## Executive Summary

Redesign the bills list interface to support batch payment operations through company grouping and multi-select capabilities. Users can select multiple ready bills and process them in a single batch, reducing a 50-bill payment run from 30-45 minutes to under 8 minutes.

**Key Technical Decisions:**
- Server-Sent Events (SSE) for real-time batch progress streaming
- Sequential payment processing with 500ms delay to avoid rate limiting
- Company grouping by `clientName` field from PartnerConnect
- Pre-selection of all "readyToPay" bills on page load
- Batch abort capability with partial completion handling
- Type-to-confirm for batches exceeding $10,000 total (note: batch threshold is intentionally higher than $1,000 single-payment threshold to reduce friction for routine bulk operations)

**Builds On:**
- Existing lazy parallel control fetch system (`useBillControls.ts`)
- Current `BillsList.tsx` grouped view architecture
- Single-payment flow (`PaymentConfirmationModal.tsx`)

---

## Master Task List

### Phase 2.1: Selection Infrastructure (Sprint 1)

| ID | Task | Status | Estimate | Dependencies | Priority |
|----|------|--------|----------|--------------|----------|
| T1 | Create `SelectionProvider` context and `useSelectionContext` hook | [ ] Pending | 2h | None | P0 |
| T2 | Add checkbox component to `BillRow` | [ ] Pending | 30m | T1 | P0 |
| T3 | Implement global selection controls (Select All Ready / Deselect All) | [ ] Pending | 45m | T1, T2 | P0 |
| T4 | Create selection summary toolbar with running total | [ ] Pending | 1h | T1 | P0 |
| T5 | Pre-select ready bills on page load | [ ] Pending | 30m | T1 | P0 |
| T6 | Persist selection across view mode changes | [ ] Pending | 30m | T1 | P1 |

### Phase 2.2: Company Grouping Enhancement (Sprint 1)

| ID | Task | Status | Estimate | Dependencies | Priority |
|----|------|--------|----------|--------------|----------|
| T7 | Refactor `GroupedView` from payee to company grouping | [ ] Pending | 1h | None | P0 |
| T8 | Add company header checkbox with indeterminate state | [ ] Pending | 45m | T7, T1 | P0 |
| T9 | Implement expand/collapse state (session only, not persisted across page refresh) | [ ] Pending | 30m | T7 | P1 |
| T10 | Add company-level stats (bill count, ready count, total) | [ ] Pending | 30m | T7 | P0 |
| T11 | Update view toggle label ("By Payee" -> "By Company") | [ ] Pending | 15m | T7 | P0 |

### Phase 2.3: Batch Payment Backend (Sprint 2)

| ID | Task | Status | Estimate | Dependencies | Priority |
|----|------|--------|----------|--------------|----------|
| T12 | Create BatchPayment model in Prisma schema | [ ] Pending | 30m | None | P0 |
| T12a | **VERIFY**: Confirm `batch_payments` table exists via SQL check | [ ] Pending | 5m | T12 | P0 |
| T12b | Extract `processSinglePayment()` helper from `/pay/:billId` | [ ] Pending | 45m | None | P0 |
| T13 | Implement `POST /api/payments/batch` endpoint | [ ] Pending | 2h | T12a, T12b | P0 |
| T13a | Implement `GET /api/payments/batch/:batchId/stream` SSE endpoint for reconnection | [ ] Pending | 1h | T13 | P0 |
| T14 | Add SSE streaming for progress events | [ ] Pending | 1.5h | T13 | P0 |
| T15 | Implement sequential payment processor with delays | [ ] Pending | 1h | T13 | P0 |
| T16 | Add batch abort handling | [ ] Pending | 45m | T15 | P0 |
| T17 | Implement `GET /api/payments/batch/:batchId/status` polling fallback | [ ] Pending | 45m | T13 | P0 |
| T18 | Add idempotency key support to prevent duplicate batches | [ ] Pending | 30m | T13 | P0 |

**GATE**: Do NOT proceed to T13 until T12a confirms migration is applied. Run:
```sql
SELECT table_name FROM information_schema.tables WHERE table_name = 'batch_payments';
```

### Phase 2.4: Batch Payment Frontend (Sprint 2)

| ID | Task | Status | Estimate | Dependencies | Priority |
|----|------|--------|----------|--------------|----------|
| T19 | Create batch confirmation modal component | [ ] Pending | 1.5h | T4 | P0 |
| T20 | Add tenant breakdown (US/CA totals) in confirmation | [ ] Pending | 30m | T19 | P0 |
| T21 | Implement large amount warning ($10,000+) with type-to-confirm | [ ] Pending | 30m | T19 | P0 |
| T22 | Create batch progress modal with SSE integration | [ ] Pending | 2h | T14 | P0 |
| T23 | Implement "Stop After Current" abort button | [ ] Pending | 30m | T22, T16 | P0 |
| T24 | Create batch results summary modal | [ ] Pending | 1.5h | T22 | P0 |
| T25 | Add failed payments list with individual retry | [ ] Pending | 1h | T24 | P1 |
| T26 | Implement "Retry Failed" batch action | [ ] Pending | 45m | T25, T13 | P1 |

### Phase 2.5: Polish and Accessibility (Sprint 3)

| ID | Task | Status | Estimate | Dependencies | Priority |
|----|------|--------|----------|--------------|----------|
| T27 | Add keyboard navigation (Tab, Space, Enter) | [ ] Pending | 1h | T2, T19, T22 | P2 |
| T28 | Implement ARIA labels for screen readers | [ ] Pending | 45m | T27 | P2 |
| T29 | Add focus management for modals | [ ] Pending | 30m | T28 | P2 |
| T30 | Handle network interruption gracefully | [ ] Pending | 1h | T22 | P1 |
| T31 | Add estimated completion time display | [ ] Pending | 30m | T22 | P2 |
| T32 | Write unit tests for selection hook | [ ] Pending | 1h | T1 | P1 |
| T33 | Write integration tests for batch endpoint | [ ] Pending | 1.5h | T13 | P1 |
| T34 | Manual E2E testing and bug fixes | [ ] Pending | 2h | All | P0 |
| T35 | Add React Error Boundary for batch modal components | [ ] Pending | 45m | T19, T22, T24 | P1 |
| T36 | Visual testing via Chrome DevTools MCP for modal states | [ ] Pending | 1h | T19, T22, T24 | P1 |
| T37 | Snapshot tests for BatchConfirmationModal, BatchProgressModal, BatchResultsModal | [ ] Pending | 1h | T36 | P1 |
| T38 | Interaction tests for selection toggle, company checkbox indeterminate state | [ ] Pending | 45m | T8 | P1 |

**Total Estimate:** ~34 hours (4.25 developer days)

---

## Test Data and Environment

### Test Bill IDs (PartnerConnect Sandbox)

| Bill ID | Payee | Amount | Tenant | Expected Control Result |
|---------|-------|--------|--------|-------------------------|
| `TEST-BILL-001` | Test Vendor A | $1,000.00 | US | Pass (readyToPay=true) |
| `TEST-BILL-002` | Test Vendor B | $2,500.00 | US | Pass (readyToPay=true) |
| `TEST-BILL-003` | Test Vendor C | $500.00 | CA | Pass (readyToPay=true) |
| `TEST-BILL-004` | Test Vendor D | $15,000.00 | US | Pass - triggers type-to-confirm |
| `TEST-BILL-005` | Failed Controls | $1,000.00 | US | Fail (missing W-9) |

### Test User

- **Email**: `test-batch@fortiumpartners.com`
- **Role**: Payment Approver
- **Used for**: Batch tracking, audit logs

### Payment Gateway Test Modes

| Gateway | Mode | Documentation |
|---------|------|---------------|
| Bill.com | Sandbox | Uses test vendor IDs, no real payments |
| Wise | Sandbox | Uses test profile, sandbox API base URL |

### Cleanup/Rollback Strategy

1. **Test payments**: All sandbox payments auto-expire after 24 hours
2. **BatchPayment records**: Delete test batches with `userEmail LIKE '%test%'` after testing
3. **Rollback SQL**:
```sql
-- Clean up test batch payments
DELETE FROM batch_payments
WHERE user_email LIKE '%test%'
  AND created_at > NOW() - INTERVAL '7 days';
```

---

## System Architecture

### Component Diagram

```
+------------------------------------------------------------------+
|                    Batch Payment UI Architecture                   |
+------------------------------------------------------------------+
|                                                                    |
|  ┌──────────────────────────────────────────────────────────────┐ |
|  │                      App.tsx (Dashboard)                      │ |
|  │  ┌─────────────────────────────────────────────────────────┐ │ |
|  │  │  SelectionProvider (useSelection hook)                  │ │ |
|  │  │  - selectedBillIds: Set<string>                         │ │ |
|  │  │  - selectedTotal: number                                │ │ |
|  │  │  - toggleSelection, selectAllReady, deselectAll         │ │ |
|  │  └─────────────────────────────────────────────────────────┘ │ |
|  │                              │                                │ |
|  │  ┌───────────────────────────┼───────────────────────────┐   │ |
|  │  │                           ▼                           │   │ |
|  │  │  ┌─────────────────────────────────────────────────┐  │   │ |
|  │  │  │           SelectionToolbar                      │  │   │ |
|  │  │  │  [Select All Ready] [Deselect All]              │  │   │ |
|  │  │  │  "47 bills selected | $127,450.00"              │  │   │ |
|  │  │  │                            [Pay Selected (47)]  │  │   │ |
|  │  │  └─────────────────────────────────────────────────┘  │   │ |
|  │  │                           │                           │   │ |
|  │  │  ┌─────────────────────────────────────────────────┐  │   │ |
|  │  │  │           BillsList (Enhanced)                  │  │   │ |
|  │  │  │  ┌───────────────────────────────────────────┐  │  │   │ |
|  │  │  │  │ CompanyGroupRow (new)                     │  │  │   │ |
|  │  │  │  │ [x] Acme Corp       8 bills | $45,230.00  │  │  │   │ |
|  │  │  │  │   ├─ [x] BillRow (checkboxes added)       │  │  │   │ |
|  │  │  │  │   ├─ [x] BillRow                          │  │  │   │ |
|  │  │  │  │   └─ [ ] BillRow (disabled - not ready)   │  │  │   │ |
|  │  │  │  └───────────────────────────────────────────┘  │  │   │ |
|  │  │  └─────────────────────────────────────────────────┘  │   │ |
|  │  └───────────────────────────────────────────────────────┘   │ |
|  └──────────────────────────────────────────────────────────────┘ |
|                                                                    |
|  ┌────────────────────────────────────────────────────────────┐   |
|  │  Modals (Conditional Rendering)                            │   |
|  │  ┌─────────────────────────────────────────────────────┐   │   |
|  │  │ BatchConfirmationModal                              │   │   |
|  │  │ - Summary: X bills, $Y total                        │   │   |
|  │  │ - Tenant breakdown (US via Bill.com, CA via Wise)   │   │   |
|  │  │ - Type-to-confirm for >$10,000                      │   │   |
|  │  └─────────────────────────────────────────────────────┘   │   |
|  │  ┌─────────────────────────────────────────────────────┐   │   |
|  │  │ BatchProgressModal                                  │   │   |
|  │  │ - Progress bar: Processing 15/47...                 │   │   |
|  │  │ - Current bill display                              │   │   |
|  │  │ - Succeeded/Failed counters                         │   │   |
|  │  │ - [Stop After Current] button                       │   │   |
|  │  └─────────────────────────────────────────────────────┘   │   |
|  │  ┌─────────────────────────────────────────────────────┐   │   |
|  │  │ BatchResultsModal                                   │   │   |
|  │  │ - Success count and amount                          │   │   |
|  │  │ - Failed list with error reasons                    │   │   |
|  │  │ - [Retry Failed] [Done] buttons                     │   │   |
|  │  └─────────────────────────────────────────────────────┘   │   |
|  └────────────────────────────────────────────────────────────┘   |
+------------------------------------------------------------------+
```

### Backend SSE Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    Batch Payment SSE Flow                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /api/payments/batch                                            │
│  Request: { billIds: ["b1", "b2", ...], processDate?: "2026-01-11" } │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 1. Create BatchPayment record                                │    │
│  │    - batchId: cuid()                                         │    │
│  │    - status: 'processing'                                    │    │
│  │    - billIds: JSON array                                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 2. Return SSE stream with Content-Type: text/event-stream   │    │
│  │    Connection remains open during processing                 │    │
│  └─────────────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 3. Process bills sequentially                                │    │
│  │    FOR EACH bill IN billIds:                                 │    │
│  │      │                                                       │    │
│  │      ├─ EMIT: { event: "progress", data: { billId, status: "processing" } }
│  │      │                                                       │    │
│  │      ├─ Check if abortRequested flag is set                  │    │
│  │      │  └─ If yes: break loop                                │    │
│  │      │                                                       │    │
│  │      ├─ Call existing payBill logic (Wise or Bill.com)       │    │
│  │      │                                                       │    │
│  │      ├─ ON SUCCESS:                                          │    │
│  │      │  └─ EMIT: { event: "success", data: { billId, paymentId, amount } }
│  │      │                                                       │    │
│  │      ├─ ON FAILURE:                                          │    │
│  │      │  └─ EMIT: { event: "failure", data: { billId, error, message } }
│  │      │                                                       │    │
│  │      └─ Wait 500ms (rate limit protection)                   │    │
│  │                                                              │    │
│  │    END FOR                                                   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ 4. Complete batch                                            │    │
│  │    EMIT: { event: "complete", data: {                        │    │
│  │      summary: { succeeded: 45, failed: 2, skipped: 0 },      │    │
│  │      totalAmount: 127450.00                                  │    │
│  │    }}                                                        │    │
│  │    Update BatchPayment.status = 'completed'                  │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Page Load** -> `useBills()` fetches bills -> `useBillControls()` checks controls in parallel
2. **Auto-select** -> `useSelection()` pre-selects all `readyToPay === true` bills
3. **User Action** -> Toggle individual checkboxes or use global/company controls
4. **Pay Selected** -> Open `BatchConfirmationModal` with summary
5. **Confirm** -> `POST /api/payments/batch` returns SSE stream
6. **Processing** -> `BatchProgressModal` receives events, updates UI in real-time
7. **Complete** -> Show `BatchResultsModal` with success/failure breakdown
8. **Close** -> Refresh bills list, clear selection

---

## Detailed Technical Specifications

### T1: Create SelectionProvider Context and useSelectionContext Hook

**Files:**
- `frontend/src/contexts/SelectionContext.tsx` - Context provider
- `frontend/src/hooks/useSelection.ts` - Core hook logic

```typescript
/**
 * SelectionContext - React Context for bill selection state.
 * Wrap BillsList in SelectionProvider to share selection state across components.
 *
 * Usage:
 * <SelectionProvider bills={bills}>
 *   <BillsList />
 *   <SelectionToolbar />
 * </SelectionProvider>
 *
 * Access via: const { selectedIds, toggleSelection } = useSelectionContext();
 */

import { createContext, useContext, ReactNode } from 'react';
import { useSelection, UseSelectionResult } from '../hooks/useSelection';
import { Bill } from '../lib/api';

const SelectionContext = createContext<UseSelectionResult | null>(null);

interface SelectionProviderProps {
  children: ReactNode;
  bills: Bill[];
}

export function SelectionProvider({ children, bills }: SelectionProviderProps) {
  const selection = useSelection(bills);
  return (
    <SelectionContext.Provider value={selection}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelectionContext(): UseSelectionResult {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelectionContext must be used within a SelectionProvider');
  }
  return context;
}
```

**Core Hook: `frontend/src/hooks/useSelection.ts`**

```typescript
/**
 * Hook for managing multi-select state across bills.
 * Provides selection controls, running totals, and persistence across view modes.
 */

import { useState, useCallback, useMemo, useEffect } from 'react';
import { Bill } from '../lib/api';

interface SelectionState {
  selectedIds: Set<string>;
  selectedTotal: number;
  selectedCount: number;
  usBills: { count: number; total: number };
  caBills: { count: number; total: number };
}

export interface UseSelectionResult {
  selectedIds: Set<string>;
  selectedTotal: number;
  selectedCount: number;
  usBills: { count: number; total: number };
  caBills: { count: number; total: number };
  isSelected: (billId: string) => boolean;
  toggleSelection: (billId: string) => void;
  selectBills: (billIds: string[]) => void;
  deselectBills: (billIds: string[]) => void;
  selectAllReady: () => void;
  deselectAll: () => void;
  getSelectedBills: () => Bill[];
}

export function useSelection(bills: Bill[]): UseSelectionResult {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Auto-select all ready bills on initial load
  useEffect(() => {
    const readyBillIds = bills
      .filter(b => b.readyToPay)
      .map(b => b.uid);
    
    if (readyBillIds.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(readyBillIds));
    }
  }, [bills]); // Only run when bills change, not selectedIds

  // Memoized calculations
  const selectionState = useMemo<SelectionState>(() => {
    const selectedBills = bills.filter(b => selectedIds.has(b.uid));
    const usBills = selectedBills.filter(b => b.tenantCode === 'US');
    const caBills = selectedBills.filter(b => b.tenantCode === 'CA');

    return {
      selectedIds,
      selectedTotal: selectedBills.reduce((sum, b) => sum + b.amount, 0),
      selectedCount: selectedBills.length,
      usBills: {
        count: usBills.length,
        total: usBills.reduce((sum, b) => sum + b.amount, 0),
      },
      caBills: {
        count: caBills.length,
        total: caBills.reduce((sum, b) => sum + b.amount, 0),
      },
    };
  }, [bills, selectedIds]);

  const isSelected = useCallback((billId: string) => {
    return selectedIds.has(billId);
  }, [selectedIds]);

  const toggleSelection = useCallback((billId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(billId)) {
        next.delete(billId);
      } else {
        next.add(billId);
      }
      return next;
    });
  }, []);

  const selectBills = useCallback((billIds: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      billIds.forEach(id => next.add(id));
      return next;
    });
  }, []);

  const deselectBills = useCallback((billIds: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      billIds.forEach(id => next.delete(id));
      return next;
    });
  }, []);

  const selectAllReady = useCallback(() => {
    const readyBillIds = bills
      .filter(b => b.readyToPay)
      .map(b => b.uid);
    setSelectedIds(new Set(readyBillIds));
  }, [bills]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const getSelectedBills = useCallback(() => {
    return bills.filter(b => selectedIds.has(b.uid));
  }, [bills, selectedIds]);

  return {
    ...selectionState,
    isSelected,
    toggleSelection,
    selectBills,
    deselectBills,
    selectAllReady,
    deselectAll,
    getSelectedBills,
  };
}
```

---

### T7: Company Group Interface

**File:** `frontend/src/components/BillsList.tsx` (modification)

Update the `PayeeGroup` interface and rename to `CompanyGroup`:

```typescript
interface CompanyGroup {
  clientName: string;        // Group by clientName instead of payeeName
  bills: Bill[];
  totalAmount: number;
  readyCount: number;
  readyAmount: number;       // New: total amount of ready bills
  issueCount: number;
  expanded: boolean;         // Track expansion state
}

// Group bills by clientName instead of payeeName
function groupBillsByCompany(bills: Bill[]): CompanyGroup[] {
  const groupMap = new Map<string, Bill[]>();
  
  bills.forEach(bill => {
    const key = bill.clientName || 'Unknown Client';
    const existing = groupMap.get(key) || [];
    groupMap.set(key, [...existing, bill]);
  });

  return Array.from(groupMap.entries())
    .map(([clientName, groupBills]): CompanyGroup => ({
      clientName,
      bills: groupBills,
      totalAmount: groupBills.reduce((sum, b) => sum + b.amount, 0),
      readyCount: groupBills.filter(b => b.readyToPay).length,
      readyAmount: groupBills
        .filter(b => b.readyToPay)
        .reduce((sum, b) => sum + b.amount, 0),
      issueCount: groupBills.filter(b => !b.readyToPay).length,
      expanded: true, // Default expanded
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}
```

---

### T12: BatchPayment Prisma Model

**File:** `backend/prisma/schema.prisma` (addition)

```prisma
// BatchPayment tracks batch payment operations
model BatchPayment {
  id             String    @id @default(cuid())
  userId         String?   // User who initiated (from session)
  userEmail      String?   // User email for audit
  billIds        Json      // Array of bill IDs in batch
  totalBills     Int       // Total bills in batch
  totalAmount    Decimal   @db.Decimal(12, 2)
  processedCount Int       @default(0)
  succeededCount Int       @default(0)
  failedCount    Int       @default(0)
  skippedCount   Int       @default(0)
  status         String    @default("pending") // pending, processing, completed, aborted
  abortRequested Boolean   @default(false)
  results        Json?     // Per-bill results: { billId: { status, paymentId?, error? } }
  startedAt      DateTime?
  completedAt    DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([status])
  @@index([userId])
  @@map("batch_payments")
}
```

**Migration:**
```bash
npx prisma migrate dev --name add_batch_payment_model
```

---

### T13: Batch Payment Endpoint

**File:** `backend/src/routes/payments.ts` (addition)

```typescript
/**
 * POST /api/payments/batch - Process multiple bills in a batch
 * Returns Server-Sent Events stream for real-time progress
 */
fastify.post('/batch', {
  schema: {
    body: z.object({
      billIds: z.array(z.string()).min(1).max(200),
      processDate: z.string().optional(),
      idempotencyKey: z.string().optional(),
    }),
  },
}, async (request, reply) => {
  const { billIds, processDate, idempotencyKey } = request.body as {
    billIds: string[];
    processDate?: string;
    idempotencyKey?: string;
  };

  const user = request.user as { email: string } | undefined;
  const pcClient = getPartnerConnectClient();

  // Check for duplicate batch (idempotency)
  if (idempotencyKey) {
    const existingBatch = await prisma.batchPayment.findFirst({
      where: { 
        userEmail: user?.email,
        billIds: { equals: billIds },
        createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } // Within 5 min
      }
    });
    if (existingBatch && existingBatch.status !== 'completed') {
      return reply.status(409).send({
        error: 'Duplicate batch',
        message: 'A batch with these bills is already being processed',
        batchId: existingBatch.id,
      });
    }
  }

  // Fetch all bills upfront to calculate total
  const bills: PCBill[] = [];
  for (const billId of billIds) {
    try {
      const bill = await pcClient.getBill(billId);
      bills.push(bill);
    } catch (err) {
      // Skip bills that can't be fetched
      fastify.log.warn({ billId, error: String(err) }, 'Failed to fetch bill for batch');
    }
  }

  const totalAmount = bills.reduce((sum, b) => sum + b.adjustedBillPayment, 0);

  // Create batch record
  const batch = await prisma.batchPayment.create({
    data: {
      userEmail: user?.email,
      billIds: billIds,
      totalBills: bills.length,
      totalAmount,
      status: 'processing',
      startedAt: new Date(),
      results: {},
    },
  });

  fastify.log.info({ 
    batchId: batch.id, 
    billCount: bills.length, 
    totalAmount 
  }, 'Starting batch payment');

  // Set up SSE response
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Batch-Id': batch.id,
  });

  // Helper to send SSE event
  const sendEvent = (event: string, data: object) => {
    reply.raw.write(`event: ${event}\n`);
    reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Send initial batch info
  sendEvent('start', { 
    batchId: batch.id, 
    totalBills: bills.length,
    totalAmount,
  });

  // Process bills sequentially
  const results: Record<string, { status: string; paymentId?: string; error?: string }> = {};
  let succeededCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < bills.length; i++) {
    const bill = bills[i];
    
    // Check if abort was requested
    const currentBatch = await prisma.batchPayment.findUnique({
      where: { id: batch.id },
      select: { abortRequested: true },
    });
    
    if (currentBatch?.abortRequested) {
      // Mark remaining as skipped
      for (let j = i; j < bills.length; j++) {
        results[bills[j].uid] = { status: 'skipped' };
        skippedCount++;
      }
      sendEvent('aborted', { processedCount: i, skippedCount: bills.length - i });
      break;
    }

    // Send progress event
    sendEvent('progress', {
      billId: bill.uid,
      index: i + 1,
      total: bills.length,
      payeeName: bill.resourceName,
      amount: bill.adjustedBillPayment,
    });

    try {
      // Reuse existing single payment logic
      const paymentResult = await processSinglePayment(bill, processDate, fastify);
      
      results[bill.uid] = { 
        status: 'success', 
        paymentId: paymentResult.paymentId 
      };
      succeededCount++;

      sendEvent('success', {
        billId: bill.uid,
        paymentId: paymentResult.paymentId,
        amount: bill.adjustedBillPayment,
        index: i + 1,
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      results[bill.uid] = { status: 'failed', error: errorMessage };
      failedCount++;

      sendEvent('failure', {
        billId: bill.uid,
        error: errorMessage,
        amount: bill.adjustedBillPayment,
        index: i + 1,
      });
    }

    // Update batch record with progress
    await prisma.batchPayment.update({
      where: { id: batch.id },
      data: {
        processedCount: i + 1,
        succeededCount,
        failedCount,
        results,
      },
    });

    // Rate limit protection: 500ms delay between payments
    if (i < bills.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  // Complete batch
  await prisma.batchPayment.update({
    where: { id: batch.id },
    data: {
      status: 'completed',
      completedAt: new Date(),
      skippedCount,
      results,
    },
  });

  // Send completion event
  sendEvent('complete', {
    batchId: batch.id,
    summary: {
      total: bills.length,
      succeeded: succeededCount,
      failed: failedCount,
      skipped: skippedCount,
    },
    totalAmount,
    succeededAmount: bills
      .filter(b => results[b.uid]?.status === 'success')
      .reduce((sum, b) => sum + b.adjustedBillPayment, 0),
  });

  reply.raw.end();
});

/**
 * POST /api/payments/batch/:batchId/abort - Request abort of running batch
 */
fastify.post('/batch/:batchId/abort', {
  schema: {
    params: z.object({
      batchId: z.string(),
    }),
  },
}, async (request, reply) => {
  const { batchId } = request.params as { batchId: string };

  const batch = await prisma.batchPayment.findUnique({
    where: { id: batchId },
  });

  if (!batch) {
    return reply.status(404).send({ error: 'Batch not found' });
  }

  if (batch.status !== 'processing') {
    return reply.status(400).send({ 
      error: 'Cannot abort', 
      message: `Batch status is ${batch.status}` 
    });
  }

  await prisma.batchPayment.update({
    where: { id: batchId },
    data: { abortRequested: true },
  });

  return { success: true, message: 'Abort requested - batch will stop after current payment' };
});
```

---

### T19: Batch Confirmation Modal

**File:** `frontend/src/components/BatchConfirmationModal.tsx` (new file)

```typescript
/**
 * Batch payment confirmation modal.
 * Shows summary with tenant breakdown and type-to-confirm for large amounts.
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, DollarSign, Building2, CreditCard, Loader2 } from 'lucide-react';
import { Bill, WiseBalance, api } from '../lib/api';

// Shared constant - extract to frontend/src/lib/constants.ts
// Note: $10K batch threshold is intentionally higher than $1K single-payment threshold
export const BATCH_TYPE_CONFIRM_THRESHOLD = 10000;
export const SINGLE_TYPE_CONFIRM_THRESHOLD = 1000;

const TYPE_CONFIRM_THRESHOLD = BATCH_TYPE_CONFIRM_THRESHOLD;

interface BatchConfirmationModalProps {
  bills: Bill[];
  usBills: { count: number; total: number };
  caBills: { count: number; total: number };
  totalAmount: number;
  onConfirm: (idempotencyKey: string) => void;  // Pass generated UUID
  onCancel: () => void;
}

/**
 * Format amount with currency-aware locale.
 * Uses tenantCode to determine currency (US=USD, CA=CAD).
 */
function formatAmount(amount: number, currency: 'USD' | 'CAD' = 'USD'): string {
  const locale = currency === 'CAD' ? 'en-CA' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

/**
 * Get currency from tenant code.
 */
function getCurrencyForTenant(tenantCode: 'US' | 'CA'): 'USD' | 'CAD' {
  return tenantCode === 'CA' ? 'CAD' : 'USD';
}

export function BatchConfirmationModal({
  bills,
  usBills,
  caBills,
  totalAmount,
  onConfirm,
  onCancel,
}: BatchConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [wiseBalances, setWiseBalances] = useState<WiseBalance[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [showBillList, setShowBillList] = useState(false);

  const requiresTypeConfirm = totalAmount >= TYPE_CONFIRM_THRESHOLD;
  const expectedConfirmText = 'PAY';
  const canConfirm = !requiresTypeConfirm || confirmText === expectedConfirmText;

  // Fetch Wise balance if there are CA bills
  useEffect(() => {
    if (caBills.count > 0) {
      setLoadingBalance(true);
      api.getWiseBalance()
        .then(({ balances }) => setWiseBalances(balances))
        .catch((err) => console.error('Failed to fetch Wise balance:', err))
        .finally(() => setLoadingBalance(false));
    }
  }, [caBills.count]);

  const handleConfirm = () => {
    if (canConfirm) {
      // Generate idempotency key on frontend to prevent duplicate submissions
      const idempotencyKey = crypto.randomUUID();
      onConfirm(idempotencyKey);
    }
  };

  // Check Wise balance sufficiency
  const cadBalance = wiseBalances.find(b => b.currency === 'CAD');
  const cadAvailable = cadBalance ? cadBalance.amount - cadBalance.reserved : 0;
  const insufficientBalance = !loadingBalance && caBills.count > 0 && cadAvailable < caBills.total;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-primary px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2 text-primary-foreground">
            <DollarSign className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Confirm Batch Payment</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-primary-foreground/80 hover:text-primary-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Warning for large amounts */}
          {requiresTypeConfirm && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Large Batch Warning</p>
                <p>This batch exceeds {formatAmount(TYPE_CONFIRM_THRESHOLD)}. Type <strong>PAY</strong> to confirm.</p>
              </div>
            </div>
          )}

          {/* Summary */}
          <div className="text-center py-4 border-b mb-4">
            <p className="text-4xl font-bold text-primary">{formatAmount(totalAmount)}</p>
            <p className="text-muted-foreground mt-1">{bills.length} bills selected</p>
          </div>

          {/* Tenant breakdown */}
          <div className="space-y-3">
            {usBills.count > 0 && (
              <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-blue-900">Bill.com (US)</p>
                    <p className="text-sm text-blue-700">{usBills.count} bills</p>
                  </div>
                </div>
                <p className="font-bold text-blue-900">{formatAmount(usBills.total)}</p>
              </div>
            )}

            {caBills.count > 0 && (
              <div className="flex items-center justify-between p-3 bg-teal-50 border border-teal-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-teal-600" />
                  <div>
                    <p className="font-medium text-teal-900">Wise (CA)</p>
                    <p className="text-sm text-teal-700">{caBills.count} bills</p>
                  </div>
                </div>
                <p className="font-bold text-teal-900">{formatAmount(caBills.total, 'CAD')}</p>
              </div>
            )}
          </div>

          {/* Insufficient balance warning */}
          {insufficientBalance && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Insufficient Wise Balance</p>
                <p>
                  CAD {cadAvailable.toFixed(2)} available, but CAD {caBills.total.toFixed(2)} required.
                  Some payments may fail.
                </p>
              </div>
            </div>
          )}

          {/* Bill list preview (collapsible) */}
          <div className="mt-4">
            <button
              onClick={() => setShowBillList(!showBillList)}
              className="text-sm text-primary hover:underline"
            >
              {showBillList ? 'Hide' : 'Show'} bill details ({bills.length})
            </button>
            {showBillList && (
              <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left">Payee</th>
                      <th className="px-3 py-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bills.map((bill) => (
                      <tr key={bill.uid} className="border-t">
                        <td className="px-3 py-2">{bill.payeeName}</td>
                        <td className="px-3 py-2 text-right">{formatAmount(bill.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Type-to-confirm input for large amounts */}
          {requiresTypeConfirm && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">
                Type <span className="font-mono bg-muted px-1 rounded">PAY</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type PAY"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted/30 flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-md font-medium ${
              canConfirm
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            Pay {bills.length} Bills
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

### T22: Batch Progress Modal

**File:** `frontend/src/components/BatchProgressModal.tsx` (new file)

```typescript
/**
 * Batch payment progress modal with SSE integration.
 * Shows real-time progress as payments are processed.
 */

import { useState, useEffect, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface BatchProgressModalProps {
  batchId: string;
  totalBills: number;
  totalAmount: number;
  onComplete: (results: BatchResults) => void;
  onAbort: () => void;
}

interface BatchResults {
  succeeded: number;
  failed: number;
  skipped: number;
  succeededAmount: number;
  failedBills: Array<{ billId: string; payeeName: string; amount: number; error: string }>;
}

interface CurrentBill {
  billId: string;
  payeeName: string;
  amount: number;
  index: number;
  tenantCode?: 'US' | 'CA';
}

/**
 * Format amount with currency-aware locale.
 * Uses tenantCode to determine currency (US=USD, CA=CAD).
 */
function formatAmount(amount: number, currency: 'USD' | 'CAD' = 'USD'): string {
  const locale = currency === 'CAD' ? 'en-CA' : 'en-US';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function BatchProgressModal({
  batchId,
  totalBills,
  totalAmount,
  onComplete,
  onAbort,
}: BatchProgressModalProps) {
  const [processedCount, setProcessedCount] = useState(0);
  const [succeededCount, setSucceededCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [currentBill, setCurrentBill] = useState<CurrentBill | null>(null);
  const [aborting, setAborting] = useState(false);
  const [failedBills, setFailedBills] = useState<BatchResults['failedBills']>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // Connect to SSE stream
    const eventSource = new EventSource(`/api/payments/batch/${batchId}/stream`);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      const data = JSON.parse(e.data);
      setCurrentBill({
        billId: data.billId,
        payeeName: data.payeeName,
        amount: data.amount,
        index: data.index,
      });
    });

    eventSource.addEventListener('success', (e) => {
      const data = JSON.parse(e.data);
      setProcessedCount(data.index);
      setSucceededCount(prev => prev + 1);
    });

    eventSource.addEventListener('failure', (e) => {
      const data = JSON.parse(e.data);
      setProcessedCount(data.index);
      setFailedCount(prev => prev + 1);
      setFailedBills(prev => [...prev, {
        billId: data.billId,
        payeeName: data.payeeName || 'Unknown',
        amount: data.amount,
        error: data.error,
      }]);
    });

    eventSource.addEventListener('complete', (e) => {
      const data = JSON.parse(e.data);
      eventSource.close();
      onComplete({
        succeeded: data.summary.succeeded,
        failed: data.summary.failed,
        skipped: data.summary.skipped,
        succeededAmount: data.succeededAmount,
        failedBills,
      });
    });

    eventSource.addEventListener('aborted', (e) => {
      const data = JSON.parse(e.data);
      eventSource.close();
      onComplete({
        succeeded: succeededCount,
        failed: failedCount,
        skipped: data.skippedCount,
        succeededAmount: 0, // Will be calculated from results
        failedBills,
      });
    });

    eventSource.onerror = () => {
      // Handle connection error - could implement polling fallback here
      console.error('SSE connection error');
    };

    return () => {
      eventSource.close();
    };
  }, [batchId]);

  const handleAbort = async () => {
    setAborting(true);
    try {
      await fetch(`/api/payments/batch/${batchId}/abort`, { method: 'POST' });
    } catch (err) {
      console.error('Failed to abort batch:', err);
    }
  };

  const progressPercent = totalBills > 0 ? (processedCount / totalBills) * 100 : 0;
  const estimatedTimeRemaining = totalBills > 0 
    ? Math.ceil((totalBills - processedCount) * 3) // ~3 seconds per bill
    : 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-4">
          <h2 className="text-lg font-semibold text-primary-foreground">
            Processing Batch Payment
          </h2>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-sm mb-1">
              <span>Processing {processedCount}/{totalBills} bills...</span>
              <span>{progressPercent.toFixed(0)}%</span>
            </div>
            <div className="h-3 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            {estimatedTimeRemaining > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                ~{estimatedTimeRemaining}s remaining
              </p>
            )}
          </div>

          {/* Current bill */}
          {currentBill && (
            <div className="mb-4 p-3 bg-muted/50 rounded-lg">
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="font-medium">{currentBill.payeeName}</span>
              </div>
              <p className="text-muted-foreground text-sm mt-1">
                {formatAmount(currentBill.amount)}
              </p>
            </div>
          )}

          {/* Counters */}
          <div className="flex gap-4 text-center">
            <div className="flex-1 p-3 bg-green-50 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-green-700">
                <CheckCircle className="h-4 w-4" />
                <span className="font-bold">{succeededCount}</span>
              </div>
              <p className="text-xs text-green-600">Succeeded</p>
            </div>
            <div className="flex-1 p-3 bg-red-50 rounded-lg">
              <div className="flex items-center justify-center gap-1 text-red-700">
                <XCircle className="h-4 w-4" />
                <span className="font-bold">{failedCount}</span>
              </div>
              <p className="text-xs text-red-600">Failed</p>
            </div>
          </div>

          {/* Abort button - disabled on final payment */}
          <div className="mt-6 text-center">
            <button
              onClick={handleAbort}
              disabled={aborting || processedCount >= totalBills - 1}
              className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-md hover:bg-red-50 disabled:opacity-50 transition-all duration-200 ease-in-out"
            >
              {aborting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                  Stopping...
                </>
              ) : processedCount >= totalBills - 1 ? (
                'Finishing...'
              ) : (
                'Stop After Current'
              )}
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              Payments already processed will not be reversed
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

### T24: Batch Results Modal

**File:** `frontend/src/components/BatchResultsModal.tsx` (new file)

```typescript
/**
 * Batch payment results summary modal.
 * Shows success/failure breakdown with retry options.
 */

import { useState } from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface FailedBill {
  billId: string;
  payeeName: string;
  amount: number;
  error: string;
}

interface BatchResultsModalProps {
  succeeded: number;
  failed: number;
  skipped: number;
  succeededAmount: number;
  failedBills: FailedBill[];
  onRetryFailed: (billIds: string[]) => void;
  onClose: () => void;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function BatchResultsModal({
  succeeded,
  failed,
  skipped,
  succeededAmount,
  failedBills,
  onRetryFailed,
  onClose,
}: BatchResultsModalProps) {
  const [showFailed, setShowFailed] = useState(failed > 0);
  const [retryingBillId, setRetryingBillId] = useState<string | null>(null);

  const handleRetryAll = () => {
    onRetryFailed(failedBills.map(b => b.billId));
  };

  const handleRetrySingle = (billId: string) => {
    setRetryingBillId(billId);
    onRetryFailed([billId]);
  };

  const totalProcessed = succeeded + failed;
  const wasAborted = skipped > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className={`px-6 py-4 flex items-center justify-between flex-shrink-0 ${
          failed === 0 ? 'bg-green-600' : wasAborted ? 'bg-yellow-600' : 'bg-primary'
        }`}>
          <h2 className="text-lg font-semibold text-white">
            {wasAborted ? 'Batch Payment Stopped' : 'Batch Payment Complete'}
          </h2>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Success summary */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-3">
              <CheckCircle className="h-8 w-8 text-green-600" />
            </div>
            <p className="text-3xl font-bold text-green-700">{succeeded} bills paid</p>
            <p className="text-xl text-green-600">{formatAmount(succeededAmount)}</p>
          </div>

          {/* Failure summary */}
          {failed > 0 && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <XCircle className="h-5 w-5 text-red-600" />
                <span className="font-medium text-red-800">{failed} bills failed</span>
              </div>
              <button
                onClick={() => setShowFailed(!showFailed)}
                className="text-sm text-red-700 hover:underline"
              >
                {showFailed ? 'Hide' : 'View'} failed payments
              </button>
              
              {showFailed && (
                <div className="mt-3 space-y-2">
                  {failedBills.map((bill) => (
                    <div key={bill.billId} className="p-2 bg-white rounded border border-red-200 text-sm">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium">{bill.payeeName}</p>
                          <p className="text-muted-foreground">{formatAmount(bill.amount)}</p>
                        </div>
                        <button
                          onClick={() => handleRetrySingle(bill.billId)}
                          disabled={retryingBillId === bill.billId}
                          className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50"
                        >
                          <RefreshCw className={`h-3 w-3 inline mr-1 ${retryingBillId === bill.billId ? 'animate-spin' : ''}`} />
                          Retry
                        </button>
                      </div>
                      <p className="text-red-600 text-xs mt-1">{bill.error}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Skipped summary */}
          {skipped > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="text-yellow-800">
                  {skipped} bills were not attempted (batch stopped)
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted/30 flex justify-end gap-3 flex-shrink-0">
          {failed > 0 && (
            <button
              onClick={handleRetryAll}
              className="px-4 py-2 rounded-md border border-primary text-primary hover:bg-primary/10"
            >
              <RefreshCw className="h-4 w-4 inline mr-2" />
              Retry Failed ({failed})
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## API Endpoints Summary

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/payments/batch` | Initiate batch payment with SSE response |
| GET | `/api/payments/batch/:batchId/stream` | SSE reconnection endpoint (T13a) |
| POST | `/api/payments/batch/:batchId/abort` | Request abort of running batch |
| GET | `/api/payments/batch/:batchId/status` | Poll batch status (SSE fallback, T17) |

### Request/Response Schemas

**POST /api/payments/batch**
```typescript
// Request
{
  billIds: string[];           // Required, 1-200 bills
  processDate?: string;        // Optional, YYYY-MM-DD
  idempotencyKey?: string;     // Optional, prevent duplicates
}

// Response: SSE Stream
event: start
data: { batchId, totalBills, totalAmount }

event: progress
data: { billId, index, total, payeeName, amount }

event: success
data: { billId, paymentId, amount, index }

event: failure
data: { billId, error, amount, index }

event: complete
data: { batchId, summary: { succeeded, failed, skipped }, totalAmount, succeededAmount }
```

**GET /api/payments/batch/:batchId/status (T17 - Polling Fallback)**
```typescript
// Response schema
{
  batchId: string;
  status: 'pending' | 'processing' | 'completed' | 'aborted';
  totalBills: number;
  processedCount: number;
  succeededCount: number;
  failedCount: number;
  skippedCount: number;
  currentBillId?: string;      // Currently processing (if status=processing)
  currentBillIndex?: number;   // 1-indexed
  results?: Record<string, {   // Available when completed
    status: 'success' | 'failed' | 'skipped';
    paymentId?: string;
    error?: string;
  }>;
  succeededAmount?: number;    // Available when completed
  completedAt?: string;        // ISO timestamp when completed
}
```

**Frontend Polling Reconnection Logic:**
```typescript
// Polling interval: 2 seconds
const POLL_INTERVAL_MS = 2000;

// When SSE connection fails, switch to polling
eventSource.onerror = () => {
  eventSource.close();
  startPolling(batchId);
};

async function startPolling(batchId: string) {
  const pollInterval = setInterval(async () => {
    const response = await fetch(`/api/payments/batch/${batchId}/status`);
    const data = await response.json();

    // Update UI with polling data
    setProcessedCount(data.processedCount);
    setSucceededCount(data.succeededCount);
    setFailedCount(data.failedCount);

    if (data.status === 'completed' || data.status === 'aborted') {
      clearInterval(pollInterval);
      onComplete(/* convert to BatchResults */);
    }
  }, POLL_INTERVAL_MS);
}
```

**GET /api/payments/batch/:batchId/stream (T13a - SSE Reconnection)**
```typescript
// For reconnecting to an in-progress batch
// Returns same SSE stream format as POST /api/payments/batch
// Immediately emits current state, then continues streaming progress

// Response: SSE Stream (same format as POST)
event: reconnected
data: { batchId, processedCount, totalBills, status }

// Then continues with normal progress/success/failure/complete events
```

---

## Sprint Planning

### Sprint 1: Selection & Grouping (Week 1)

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| Day 1 | T1, T2, T3 | Selection hook, checkbox in rows, global controls |
| Day 2 | T4, T5, T6 | Selection toolbar, pre-select ready, persist across views |
| Day 3 | T7, T8, T9, T10, T11 | Company grouping with header checkboxes |

**Sprint 1 Acceptance Criteria:**
- [ ] Checkboxes appear next to each bill row
- [ ] All ready bills are pre-selected on page load
- [ ] Selection total updates in real-time
- [ ] Company groups show aggregate selection state
- [ ] View toggle shows "By Company" instead of "By Payee"

### Sprint 2: Backend & Core UI (Week 2)

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| Day 1 | T12, T13, T14 | BatchPayment model, endpoint with SSE |
| Day 2 | T15, T16, T17, T18 | Sequential processor, abort, fallback, idempotency |
| Day 3 | T19, T20, T21 | Batch confirmation modal with tenant breakdown |
| Day 4 | T22, T23 | Progress modal with SSE integration, abort button |

**Sprint 2 Acceptance Criteria:**
- [ ] Batch endpoint processes bills sequentially with SSE events
- [ ] 500ms delay between payments to avoid rate limiting
- [ ] Abort stops batch after current payment
- [ ] Confirmation modal shows US/CA breakdown
- [ ] Type-to-confirm required for >$10,000 batches
- [ ] Progress modal updates in real-time

### Sprint 3: Results, Retry & Polish (Week 3)

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| Day 1 | T24, T25 | Results modal with failed list |
| Day 2 | T26, T30 | Retry failed, network error handling |
| Day 3 | T27, T28, T29, T31 | Keyboard nav, ARIA, focus management |
| Day 4 | T32, T33, T34 | Tests and bug fixes |

**Sprint 3 Acceptance Criteria:**
- [ ] Results modal shows success/failure breakdown
- [ ] Individual and batch retry for failed payments
- [ ] Full keyboard navigation support
- [ ] Screen reader accessible
- [ ] Unit tests for selection hook
- [ ] Integration tests for batch endpoint

---

## UI/UX Specifications

### Animation Standards

All interactive elements use consistent Tailwind transition classes:

```css
/* Standard transition for interactive elements */
.interactive-element {
  @apply transition-all duration-200 ease-in-out;
}

/* Progress bar animation */
.progress-bar {
  @apply transition-all duration-300;
}

/* Modal fade in/out */
.modal-backdrop {
  @apply transition-opacity duration-150 ease-out;
}
```

**Tailwind Classes to Apply:**
- Buttons: `transition-all duration-200 ease-in-out`
- Progress bars: `transition-all duration-300`
- Checkboxes: `transition-colors duration-150`
- Modals: `transition-opacity duration-150 ease-out`

### Batch Size Limits and Warnings

| Selection Count | UI Behavior |
|-----------------|-------------|
| 1-150 | Normal operation |
| 151-199 | Yellow warning badge: "Large batch - processing may take several minutes" |
| 200 | Red warning + disabled "Pay Selected" button: "Maximum 200 bills per batch" |

**Implementation:**
```typescript
// In SelectionToolbar component
const showBatchWarning = selectedCount > 150;
const disableBatch = selectedCount > 200;

{showBatchWarning && selectedCount <= 200 && (
  <span className="text-yellow-600 text-sm">Large batch warning</span>
)}
{disableBatch && (
  <span className="text-red-600 text-sm">Maximum 200 bills per batch</span>
)}
```

---

## Environment Configuration

### New Environment Variables

None required - batch payments use existing payment integrations (Bill.com and Wise).

### Rate Limits

| Service | Limit | Mitigation |
|---------|-------|------------|
| Bill.com | 100 req/min | 500ms delay = max 120/min, under limit |
| Wise | 100 req/min | 500ms delay = max 120/min, under limit |
| PartnerConnect | 60 req/min | Pre-fetch bills before batch start |

### Rate Limit Backoff Strategy

On 429 (Too Many Requests) response, implement exponential backoff:

```typescript
// Backend: Exponential backoff for rate-limited requests
async function withBackoff<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 1000
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error.status === 429 && attempt < maxRetries - 1) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw new Error('Max retries exceeded');
}

// Usage in batch processor:
const paymentResult = await withBackoff(
  () => processSinglePayment(bill, processDate, fastify),
  3,  // maxRetries
  1000 // baseDelayMs: 1s, 2s, 4s
);
```

| Attempt | Delay |
|---------|-------|
| 1 | 1 second |
| 2 | 2 seconds |
| 3 | 4 seconds |
| 4+ | Fail with error |

---

## Database Schema Changes

```sql
-- Migration: add_batch_payment_model
CREATE TABLE batch_payments (
  id VARCHAR(30) PRIMARY KEY,
  user_id VARCHAR(30),
  user_email VARCHAR(255),
  bill_ids JSONB NOT NULL,
  total_bills INTEGER NOT NULL,
  total_amount DECIMAL(12, 2) NOT NULL,
  processed_count INTEGER DEFAULT 0,
  succeeded_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',
  abort_requested BOOLEAN DEFAULT FALSE,
  results JSONB,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_batch_payments_status ON batch_payments(status);
CREATE INDEX idx_batch_payments_user_id ON batch_payments(user_id);
```

---

## Acceptance Criteria

### P0 (Must Have)

- [ ] Bills grouped by `clientName` in "By Company" view
- [ ] All ready bills pre-selected on page load
- [ ] Selection total displays count and amount in real-time
- [ ] "Pay Selected" button shows selected count
- [ ] Confirmation modal shows bill count, total, and tenant breakdown
- [ ] Type-to-confirm required for batches > $10,000
- [ ] Payments process sequentially with 500ms delay
- [ ] SSE stream provides real-time progress updates
- [ ] Progress modal shows current bill, progress bar, success/failure counts
- [ ] "Stop After Current" aborts batch cleanly
- [ ] Results modal shows success/failure summary
- [ ] Bills list refreshes after batch completes
- [ ] No duplicate payments (idempotency)

### P1 (Should Have)

- [ ] Company-level checkbox with indeterminate state
- [ ] Selection persists across view mode changes
- [ ] Failed payments list with individual retry
- [ ] "Retry Failed" batch action
- [ ] Network interruption handled gracefully
- [ ] Polling fallback if SSE unavailable
- [ ] Unit tests for selection hook (>80% coverage)
- [ ] Integration tests for batch endpoint

### P2 (Nice to Have)

- [ ] Full keyboard navigation (Tab, Space, Enter)
- [ ] ARIA labels for screen readers
- [ ] Focus management for modals
- [ ] Estimated completion time display
- [ ] Ctrl/Cmd+A selects all ready bills

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Payment API rate limiting | Medium | Medium | 500ms delay between payments; under 100/min limit |
| SSE connection drops mid-batch | Medium | Medium | Polling fallback endpoint; batch continues server-side |
| Duplicate batch submission | Low | High | Idempotency key; disable button during processing |
| Partial failure with unclear state | Medium | High | Comprehensive results tracking; per-bill status in DB |
| Large batch causes browser freeze | Low | Medium | Virtualized bill list for >100 bills (future) |
| User closes tab during batch | Low | Medium | Batch continues server-side; status available on return |

---

## Testing Strategy

> **NO MOCKS POLICY**: All tests use REAL APIs (PartnerConnect sandbox, Bill.com test mode, Wise sandbox). No mocks permitted except for HTTP edge cases (timeout, rate limit, network error simulation).

### Unit Tests

**`frontend/src/hooks/__tests__/useSelection.test.ts`**
- Selection toggle works correctly
- Pre-selection of ready bills on mount
- Running total updates on selection change
- US/CA breakdown calculations
- Select all ready / deselect all functions

### Integration Tests

**`backend/src/routes/__tests__/payments-batch.test.ts`**
- Batch creates BatchPayment record
- SSE events emitted correctly
- Abort stops processing
- Idempotency prevents duplicates
- Error handling for failed payments
- Rate limit delay observed

### E2E Tests (Manual)

1. Select 10 ready bills, verify total
2. Click "Pay Selected", verify confirmation modal
3. Enter "PAY" for large batch, verify enabled
4. Confirm batch, observe progress
5. Click "Stop After Current", verify abort
6. Verify results modal shows correct counts
7. Retry failed payment, verify it processes
8. Close modal, verify list refreshes

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-11 | Engineering | Initial TRD from PRD v1.0 |
| 1.1 | 2026-01-11 | Engineering | Spec audit fixes: Added Execution Environment section, Linear lifecycle tasks, test data section, NO MOCKS policy, VERIFY gate after T12, UI testing tasks (T35-T38), processSinglePayment helper (T12b), T17 polling promoted to P0 with full spec, T1 updated to React Context pattern, T13a SSE reconnection endpoint, currency-aware formatting, abort button edge case, Error Boundary task, idempotency key generation, animation specs, batch size warnings, rate limit backoff |
