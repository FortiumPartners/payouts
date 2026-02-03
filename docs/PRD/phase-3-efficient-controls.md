# PRD: Phase 3 - Efficient Controls Checking

> Fortium Payouts - Pre-computed Control Validation with Caching
> Version: 1.0
> Created: 2026-01-06
> Status: Draft

---

## 1. Product Summary

### 1.1 Problem Statement

Finance Operations users execute daily payment runs through Fortium Payouts, processing 30-100 bills per session. Currently, control checks (invoice paid, vendor exists, proving period elapsed, etc.) are evaluated on-demand when users expand individual bill rows or attempt payment. This creates significant friction:

1. **Latency**: Each bill requires 3-8 seconds to evaluate all controls due to multiple external API calls (PartnerConnect, fpqbo/QBO, Bill.com, Wise)
2. **Poor batch workflow**: Users must click through each bill individually to see which are ready to pay
3. **Wasted API calls**: The same QBO invoice may be queried multiple times if a user collapses and re-expands a row
4. **No proactive visibility**: Dashboard summary shows 0 "ready to pay" until controls are manually checked

### 1.2 Solution Overview

Implement a background control checking system that pre-computes control status for all displayed bills when the page loads:

**Background Processing**
- Initiate control checks for all bills on page load
- Process controls in background while UI remains responsive
- Show real-time progress indicator ("Checking 15/50 bills...")
- Cache results with configurable TTL (default: 5 minutes)

**Optimized Queries**
- Batch QBO queries: Fetch multiple invoice statuses in single API call
- Batch Bill.com queries: Retrieve multiple bills/vendors per request
- Parallel execution: Independent controls run concurrently (QBO, Bill.com, Wise)
- Deduplication: Same vendor or invoice queried only once across all bills

**Control Status Cache**
- Store computed control results in PostgreSQL with timestamps
- Invalidate cache entries on relevant data changes
- Visual indicator when showing cached vs. fresh data
- Manual refresh option for individual bills or entire list

### 1.3 Value Proposition

| Metric | Current State | Target State |
|--------|--------------|--------------|
| Time to view control status (50 bills) | 2-4 minutes (manual) | < 3 seconds (automatic) |
| API calls per page load | 0 (deferred) | ~10 batched calls |
| User clicks to identify ready bills | 50+ clicks | 0 clicks |
| Dashboard accuracy | Always "0 ready" | Real-time accurate counts |

---

## 2. User Analysis

### 2.1 User Personas

#### Finance Operations Specialist (Primary User)
- **Name**: Sarah Chen
- **Role**: Finance Operations Specialist at Fortium Partners
- **Responsibilities**: Execute daily payment runs for US and Canada partners/subcontractors
- **Goals**: Process payments efficiently with minimal errors, complete daily payment cycle within 30 minutes
- **Pain Points**:
  - "I have to click on every single bill to see if it's ready - it takes forever"
  - "Sometimes I click Pay and then wait 5 seconds only to find out something failed"
  - "I can't tell at a glance which bills are blocked and why"
- **Technical Comfort**: Moderate - comfortable with web apps, prefers clear visual feedback
- **Usage Pattern**: Daily (morning), processes 30-100 bills per session

#### Finance Manager (Secondary User)
- **Name**: Michael Torres
- **Role**: Finance Manager
- **Responsibilities**: Oversee payment operations, ensure compliance, handle exceptions
- **Goals**: Quick visibility into payment pipeline status, identify and resolve blocked payments
- **Pain Points**:
  - "I need to know the daily payment total before 10am but the dashboard doesn't show accurate numbers"
  - "When something is blocked, I need to understand why immediately"
- **Technical Comfort**: Moderate-High
- **Usage Pattern**: Daily check-ins, ad-hoc investigation of blocked payments

### 2.2 User Pain Points (Current State)

| Pain Point | Impact | Frequency |
|-----------|--------|-----------|
| Manual control checking | High - wastes 15-20 min/day | Daily |
| Slow feedback on payment readiness | High - blocks workflow | Every session |
| Inaccurate dashboard totals | Medium - poor planning visibility | Daily |
| Repeated clicking for refresh | Medium - frustration | Multiple times/session |
| No batch "check all" option | High - forces sequential workflow | Every session |

### 2.3 User Journey (Target State)

1. **Login & Load**: User logs in, navigates to bills list
2. **Automatic Check**: System shows loading indicator "Checking controls for 47 bills..."
3. **Progressive Update**: Bills update in real-time as controls complete (ready bills bubble up)
4. **Dashboard Accurate**: Summary shows "12 ready to pay ($45,230)" immediately
5. **Quick Action**: User selects all ready bills, clicks "Pay Selected"
6. **Stale Indicator**: After 5 minutes, cache indicator shows "Last checked 5m ago - Refresh?"
7. **Targeted Refresh**: User refreshes specific bill after resolving an issue

---

## 3. Goals and Non-Goals

### 3.1 Goals

| ID | Goal | Success Criteria | Priority |
|----|------|-----------------|----------|
| G1 | Automatic control checking on page load | Controls checked for all displayed bills within 30s of load | P0 |
| G2 | Accurate dashboard metrics | "Ready to pay" count accurate within 10s of page load | P0 |
| G3 | Responsive UI during checks | UI remains interactive while controls load in background | P0 |
| G4 | Reduce API calls via batching | Batch QBO invoice queries (10+ per call), Bill.com bills | P1 |
| G5 | Cache control results | Results cached for 5 minutes, invalidated appropriately | P1 |
| G6 | Visual progress feedback | Show checking progress to user ("15/50 checked") | P1 |
| G7 | Stale data indicator | Clear visual when showing cached data older than TTL | P2 |
| G8 | Manual refresh controls | Refresh single bill or all bills on demand | P2 |

### 3.2 Non-Goals (Out of Scope)

| Non-Goal | Rationale |
|----------|-----------|
| Real-time push updates | WebSocket infrastructure not yet needed; polling sufficient for MVP |
| Historical control audit log | Control results stored only for caching, not audit; payment records capture final state |
| Cross-session cache sharing | Each user session checks independently; no shared cache to avoid stale data |
| Automatic retry on failure | Failed controls show error; user can manually retry |
| Pre-fetch on schedule | Background jobs premature; on-demand checking is sufficient |
| Control result persistence beyond TTL | Cache is ephemeral; source of truth is external systems |

### 3.3 Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| Page load to full control status | N/A (manual) | < 30 seconds (50 bills) | Frontend timing instrumentation |
| API calls per page load | ~50 (if all checked) | < 15 (batched) | Backend request logging |
| User clicks to identify ready bills | 50+ | 0 | User research / analytics |
| Time to complete daily payment run | 30-45 minutes | 15-20 minutes | User feedback |
| Dashboard "ready to pay" accuracy | 0% (always shows 0) | 100% after load | Automated testing |

---

## 4. Functional Requirements

### 4.1 Background Control Processing

#### FR-4.1.1: Automatic Control Check on Page Load
- **Trigger**: When `/api/bills` endpoint returns bills list
- **Behavior**: System automatically initiates control checks for all returned bills
- **Implementation**: New `/api/bills/check-controls` endpoint or WebSocket-based progress
- **Acceptance**: Controls begin checking within 1 second of page load

#### FR-4.1.2: Progressive Results Streaming
- **Trigger**: As each bill's controls complete
- **Behavior**: UI updates immediately with result (no wait for all bills)
- **Implementation**: Server-Sent Events (SSE) or polling with partial results
- **Acceptance**: User sees first results within 3 seconds of check start

#### FR-4.1.3: Progress Indicator
- **Trigger**: Control checking in progress
- **Behavior**: Display progress bar/counter: "Checking controls: 15/47 bills..."
- **States**: Not started, In progress (X/Y), Complete, Error (with retry)
- **Acceptance**: Progress updates at least every 2 seconds

#### FR-4.1.4: Error Handling
- **Trigger**: Control check fails for specific bill
- **Behavior**: Mark bill as "error" state, show failure reason, allow retry
- **Implementation**: Partial failure handling - other bills continue checking
- **Acceptance**: Single bill failure does not block other bills

### 4.2 Optimized Query Batching

#### FR-4.2.1: QBO Invoice Batch Query
- **Current**: One API call per invoice via fpqbo
- **Target**: Batch up to 50 invoices per API call
- **Implementation**: New fpqbo endpoint `GET /api/invoices/batch?docNumbers=10044,10045,...`
- **Dependency**: Requires fpqbo service enhancement
- **Acceptance**: Invoice checks for 50 bills complete in < 2 API calls

#### FR-4.2.2: QBO Bill Batch Query
- **Current**: One API call per QBO bill
- **Target**: Batch up to 50 bills per API call
- **Implementation**: New fpqbo endpoint `GET /api/bills/batch?ids=123,124,...`
- **Dependency**: Requires fpqbo service enhancement
- **Acceptance**: QBO bill checks for 50 bills complete in < 2 API calls

#### FR-4.2.3: Bill.com Batch Query
- **Current**: Individual `List/Bill.json` and `List/Vendor.json` calls
- **Target**: Single list query with multiple invoice number filters
- **Implementation**: Bill.com v2 API supports `IN` operator for filters
- **Acceptance**: Bill.com checks for 50 bills complete in < 3 API calls

#### FR-4.2.4: Parallel Control Execution
- **Trigger**: Control check initiated for a bill
- **Behavior**: Independent control groups execute in parallel:
  - Group A: QBO controls (invoice exists, paid, not voided, bill exists)
  - Group B: Payment system controls (Bill.com OR Wise)
  - Group C: General controls (proving period, not already paid, amount valid)
- **Acceptance**: Total check time reduced by 40%+ vs sequential

#### FR-4.2.5: Request Deduplication
- **Trigger**: Multiple bills reference same vendor or invoice
- **Behavior**: Query external system once, share result across bills
- **Example**: 5 bills from same vendor = 1 vendor lookup, not 5
- **Acceptance**: Duplicate queries eliminated

### 4.3 Control Status Cache

#### FR-4.3.1: Cache Storage
- **Location**: PostgreSQL table `control_cache`
- **Schema**:
  ```sql
  CREATE TABLE control_cache (
    id TEXT PRIMARY KEY,           -- bill_uid
    tenant_code TEXT NOT NULL,     -- 'US' or 'CA'
    controls JSONB NOT NULL,       -- Control results array
    all_passed BOOLEAN NOT NULL,
    ready_to_pay BOOLEAN NOT NULL,
    checked_at TIMESTAMP NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    CONSTRAINT control_cache_expires_idx
      ON control_cache (expires_at)
  );
  ```
- **Acceptance**: Cache entries created for each checked bill

#### FR-4.3.2: Cache TTL Configuration
- **Default**: 5 minutes
- **Configuration**: Via `ControlConfig` table, key `control_cache_ttl_seconds`
- **Range**: 60 seconds minimum, 3600 seconds maximum
- **Acceptance**: Cache expires after configured TTL

#### FR-4.3.3: Cache Invalidation
- **Automatic**: Entries deleted when TTL expires
- **Manual**: User clicks "Refresh" on bill or list
- **Event-based**: (Future) Invalidate when payment executed
- **Acceptance**: Stale data never served past TTL

#### FR-4.3.4: Cache Hit/Miss Behavior
- **Cache Hit**: Return cached results immediately (< 50ms)
- **Cache Miss**: Fetch fresh data, cache result, return
- **Cache Stale**: Return cached data, show indicator, background refresh
- **Acceptance**: Cache lookup adds < 50ms to response time

### 4.4 UI/UX Enhancements

#### FR-4.4.1: Stale Data Indicator
- **Trigger**: Displaying cached data older than TTL
- **Display**: Yellow indicator: "Data from 7 minutes ago - Refresh"
- **Interaction**: Click to refresh
- **Acceptance**: Indicator visible when cache > TTL

#### FR-4.4.2: Loading States per Bill
- **States**:
  - `unchecked`: Gray status, "Click to check" text
  - `checking`: Spinner, "Checking..." text
  - `ready`: Green "Ready" badge
  - `issues`: Yellow "X issues" badge
  - `error`: Red "Check failed - Retry" link
- **Acceptance**: Each state visually distinct

#### FR-4.4.3: Refresh Controls
- **Single Bill**: Refresh icon button on bill row
- **All Bills**: "Refresh All" button in header
- **Keyboard**: Ctrl/Cmd+R refreshes all (no page reload)
- **Acceptance**: Both refresh options functional

#### FR-4.4.4: Dashboard Summary Accuracy
- **Current**: Summary shows 0 ready until manual checks
- **Target**: Summary updates as controls complete
- **Display**: "Ready to Pay: 12 ($45,230) | Pending: 35 | Checking: 3"
- **Acceptance**: Summary counts match actual bill states

### 4.5 API Endpoints

#### FR-4.5.1: Batch Control Check Endpoint
- **Endpoint**: `POST /api/bills/check-controls`
- **Request**: `{ billIds: string[] }`
- **Response**: SSE stream or polling endpoint
- **Auth**: Requires authenticated session
- **Acceptance**: Processes up to 100 bills per request

#### FR-4.5.2: Control Status Endpoint
- **Endpoint**: `GET /api/bills/:id/controls`
- **Response**: Cached or fresh control results
- **Headers**: `X-Cache-Hit: true/false`, `X-Cache-Age: 120` (seconds)
- **Acceptance**: Returns cached data when available

#### FR-4.5.3: Cache Refresh Endpoint
- **Endpoint**: `POST /api/bills/:id/controls/refresh`
- **Behavior**: Invalidates cache, fetches fresh data
- **Response**: Fresh control results
- **Acceptance**: Always returns fresh data

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Requirement | Specification |
|-------------|--------------|
| Initial page load (empty cache) | < 3 seconds for UI, controls load async |
| Full control check (50 bills) | < 30 seconds |
| Full control check (100 bills) | < 60 seconds |
| Cache lookup latency | < 50ms |
| API response time (cached) | < 200ms |
| API response time (fresh) | < 5 seconds per bill |

### 5.2 Scalability

| Requirement | Specification |
|-------------|--------------|
| Concurrent users | Support 10 concurrent users without degradation |
| Bills per page | Handle up to 200 bills per page load |
| Cache size | Support 10,000 cached entries |
| External API rate limits | Stay within fpqbo (100/min), Bill.com (100/min), Wise (100/min) |

### 5.3 Reliability

| Requirement | Specification |
|-------------|--------------|
| Partial failure handling | Single bill failure does not affect others |
| External API timeout | 10 second timeout per external call |
| Retry strategy | 1 automatic retry with exponential backoff |
| Cache availability | Degrade gracefully if cache unavailable (fetch fresh) |

### 5.4 Security

| Requirement | Specification |
|-------------|--------------|
| Authentication | All endpoints require authenticated session |
| Authorization | Users can only view their tenant's bills |
| Cache isolation | Cache entries not shared between tenants |
| API key protection | External API keys remain server-side only |

### 5.5 Observability

| Requirement | Specification |
|-------------|--------------|
| Logging | Log batch sizes, durations, cache hit rates |
| Metrics | Track control check duration, API latency, error rates |
| Alerting | Alert on > 10% control check failure rate |

---

## 6. Acceptance Criteria

### 6.1 Core Functionality

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-1 | Auto-check on load | User loads bills page with 50 bills | Page loads | Control checking begins automatically within 1s |
| AC-2 | Progress visibility | Control checking in progress | User views page | Progress indicator shows "Checking X/50 bills..." |
| AC-3 | Progressive update | Controls complete for bill #5 | Bill #5 controls done | Bill #5 row updates immediately to show status |
| AC-4 | Dashboard accuracy | All controls checked | Checking complete | Summary shows accurate ready/pending counts |
| AC-5 | Cache hit | Bill checked 2 minutes ago | User expands bill row | Controls shown immediately from cache |
| AC-6 | Cache miss | Bill not in cache | User expands bill row | Controls fetched fresh, then cached |
| AC-7 | Stale indicator | Cache is 6 minutes old | User views bill | Yellow "6m ago - Refresh" indicator shown |
| AC-8 | Manual refresh | User clicks refresh on bill | Refresh clicked | Fresh controls fetched, cache updated |
| AC-9 | Batch efficiency | 50 US bills with unique invoices | Controls checked | fpqbo called < 5 times total (batched) |
| AC-10 | Parallel execution | Bill requires QBO + Bill.com checks | Controls checked | QBO and Bill.com checks run in parallel |

### 6.2 Error Handling

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-11 | Single bill error | fpqbo returns 500 for one invoice | Controls checked | That bill shows error, others continue |
| AC-12 | Batch partial failure | 3 of 50 invoices not found | Batch checked | 47 succeed, 3 show "invoice not found" |
| AC-13 | External API timeout | Bill.com takes > 10s | Control check | Timeout error shown, retry available |
| AC-14 | Cache unavailable | Database connection lost | Controls requested | Fresh data fetched (graceful degradation) |

### 6.3 Performance

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-15 | UI responsiveness | Controls checking for 100 bills | User scrolls list | Scrolling remains smooth (< 16ms frames) |
| AC-16 | Fast cache lookup | 50 bills in cache | Page loads | All control statuses shown in < 500ms |
| AC-17 | Reasonable check time | 50 bills, empty cache | Controls checked | All complete within 30 seconds |
| AC-18 | API efficiency | 50 US bills checked | Check complete | Total external API calls < 15 |

---

## 7. Dependencies and Risks

### 7.1 Technical Dependencies

| Dependency | Type | Status | Mitigation |
|-----------|------|--------|------------|
| fpqbo batch endpoints | External service | Required enhancement | Prioritize fpqbo work first; can proceed with single queries initially |
| Bill.com IN filter support | External API | Available in v2 | Already supported, low risk |
| PostgreSQL JSONB | Database | Already in use | No change needed |
| Server-Sent Events | Frontend | Standard support | Fallback to polling if SSE issues |

### 7.2 Integration Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| fpqbo batch endpoint delayed | Medium | High | Implement single-query fallback; batching is optimization, not blocker |
| External API rate limits | Medium | Medium | Implement rate limiting in batch logic; spread requests over time |
| Bill.com session expiry during batch | Low | Medium | Session refresh logic already handles; batch requests share session |
| Wise API doesn't support batching | High | Low | Wise recipients checked via local DB mapping; only contact verification hits API |

### 7.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Cache inconsistency with source | Medium | Medium | Short TTL (5min); manual refresh available |
| Database storage growth | Low | Low | Cache cleanup job; max 10K entries; TTL-based expiry |
| User confusion with stale data | Medium | Medium | Clear stale indicator; always-visible "last checked" timestamp |

### 7.4 Implementation Phases

**Phase 3.1: Foundation (Week 1)**
- Add `control_cache` table to Prisma schema
- Implement cache read/write service layer
- Add cache TTL configuration

**Phase 3.2: Background Checking (Week 2)**
- Implement `/api/bills/check-controls` batch endpoint
- Add parallel control execution
- Implement progress streaming (SSE or polling)

**Phase 3.3: Query Optimization (Week 3)**
- Implement fpqbo batch queries (or stub if service not ready)
- Implement Bill.com batch queries
- Add request deduplication

**Phase 3.4: UI Integration (Week 4)**
- Add frontend background check initiation
- Implement progress indicator
- Add stale data indicator and refresh controls
- Update dashboard summary to use cached status

---

## 8. Open Questions

| # | Question | Owner | Due Date | Decision |
|---|----------|-------|----------|----------|
| 1 | Should cache be tenant-isolated or shared? | Product | TBD | Tenant-isolated for security |
| 2 | What's the optimal batch size for fpqbo? | Backend | TBD | Start with 50, tune based on response times |
| 3 | SSE vs polling for progress updates? | Frontend | TBD | Prefer SSE; polling as fallback |
| 4 | Should we pre-check controls for recently viewed bills? | Product | TBD | Defer to Phase 4+ |
| 5 | Cache invalidation on payment execution? | Backend | TBD | Yes - invalidate paid bill immediately |

---

## Appendix A: Current Control Checks

| Control | Source | Current Implementation | Batching Opportunity |
|---------|--------|----------------------|---------------------|
| billApprovedInPC | PartnerConnect | Already batched (bills list) | N/A |
| payeeExistsInPC | PartnerConnect | From bills list | N/A |
| invoiceExistsInQbo | fpqbo | Individual GET | Batch by docNumber |
| invoicePaid | fpqbo | From invoice lookup | Batch with exists |
| invoiceNotVoided | fpqbo | From invoice lookup | Batch with exists |
| billExistsInQbo | fpqbo | Individual GET | Batch by ID |
| vendorExistsInQbo | fpqbo | Inferred from bill | N/A |
| vendorExistsInBillCom | Bill.com | Individual List/Vendor | Batch with bill |
| billExistsInBillCom | Bill.com | Individual List/Bill | Batch by invoiceNumber |
| billApprovedInBillCom | Bill.com | From bill lookup | Batch with exists |
| recipientMappedInSystem | Database | Prisma findUnique | Batch with findMany |
| recipientExistsInWise | Wise | Individual listRecipients | Pre-fetch all recipients |
| wisePaymentReady | Config | Local check | N/A |
| notAlreadyPaid | Database | Prisma findFirst | Batch with findMany |
| provingPeriod | Config | Local calculation | N/A |
| amountValid | Bill data | Local check | N/A |

---

## Appendix B: API Sequence Diagram

```
User            Frontend           Backend           fpqbo          Bill.com
  |                |                  |                |               |
  |-- Load page -->|                  |                |               |
  |                |-- GET /bills --->|                |               |
  |                |<-- Bills list ---|                |               |
  |                |                  |                |               |
  |                |-- POST /check----|                |               |
  |                |   controls       |                |               |
  |                |                  |                |               |
  |                |                  |-- Batch GET -->|               |
  |                |                  |   invoices     |               |
  |                |                  |<-- Results ----|               |
  |                |                  |                |               |
  |                |                  |------------ Batch GET -------->|
  |                |                  |             bills              |
  |                |                  |<----------- Results -----------|
  |                |                  |                |               |
  |                |<-- SSE: bill 1 --|                |               |
  |<-- Update UI --|   controls       |                |               |
  |                |                  |                |               |
  |                |<-- SSE: bill 2 --|                |               |
  |<-- Update UI --|   controls       |                |               |
  |                |                  |                |               |
  |                |<-- SSE: complete-|                |               |
  |<-- Summary ----|                  |                |               |
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-06 | Product Management | Initial draft |
