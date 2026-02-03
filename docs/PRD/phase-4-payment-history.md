# PRD: Phase 4 - Payment History & Audit Trail

> Fortium Payouts - Comprehensive Payment History with Audit Capabilities
> Version: 1.0
> Created: 2026-01-06
> Status: Draft

---

## 1. Product Summary

### 1.1 Problem Statement

Fortium Partners Finance Operations processes daily payments through the Payouts system, but once payments are executed, historical visibility is severely limited. The current system lacks the ability to answer critical business and compliance questions:

1. **No Payment History**: "What did we pay last week?" - There's no searchable history of completed payments
2. **Missing Audit Trail**: "Who approved this payment?" - No record of which user initiated payments
3. **Lost Context**: "What was the control status when this was paid?" - Control check results are ephemeral and not persisted with payment records
4. **Failure Opacity**: "What payments failed and why?" - Failed payment details are lost after the session ends
5. **No Reporting**: "How much did we pay via Wise vs Bill.com this month?" - No aggregate metrics or export capability
6. **Compliance Gap**: Auditors require complete payment trail for SOX/SOC2 compliance; current system cannot provide it

### 1.2 Solution Overview

Implement a comprehensive payment history system with full audit capabilities:

**Payment History View**
- Searchable, filterable list of all historical payments
- Filter by: date range, payee, company, amount range, status, payment processor (Bill.com/Wise)
- Sort by any column (date, amount, payee, status)
- Export to CSV for reporting and reconciliation

**Audit Trail Details**
- Full control check results captured at moment of payment
- User email who initiated the payment
- Complete timestamp trail for all state changes
- Bill.com/Wise reference IDs and response status
- Original bill details snapshot (amount, payee, project, invoice)

**Dashboard Metrics**
- Payments by day/week/month with trend charts
- Success/failure rates with drill-down
- Average processing time per payment
- Payment volume breakdown by processor (Bill.com vs Wise)
- Total payment amounts by period

### 1.3 Value Proposition

| Metric | Current State | Target State |
|--------|--------------|--------------|
| Time to answer "What was paid last week?" | Cannot answer | < 10 seconds |
| Audit trail completeness | 0% (no trail) | 100% (full trail) |
| Payment failure visibility | Session-only | Permanent history |
| Compliance audit response time | Hours (manual) | Minutes (searchable) |
| Monthly reporting capability | Manual calculation | Instant export |
| Control status at payment time | Not captured | Full snapshot |

---

## 2. User Analysis

### 2.1 User Personas

#### Finance Operations Specialist (Primary User)
- **Name**: Sarah Chen
- **Role**: Finance Operations Specialist at Fortium Partners
- **Responsibilities**: Execute daily payment runs, investigate payment issues, prepare reconciliation reports
- **Goals**:
  - Quickly find specific payments for reconciliation
  - Investigate failed payments and understand root causes
  - Generate weekly payment reports for management
- **Pain Points**:
  - "When a vendor calls asking about a payment, I have to check Bill.com and Wise separately"
  - "I can't see what controls passed when I paid something last week"
  - "If my payment failed, once I close the browser, I lose all the details"
  - "Monthly reporting takes hours because I have to manually compile from multiple sources"
- **Technical Comfort**: Moderate - comfortable with web applications and Excel exports
- **Usage Pattern**: Daily payment processing, weekly reporting, ad-hoc payment lookups

#### Finance Manager (Secondary User)
- **Name**: Michael Torres
- **Role**: Finance Manager
- **Responsibilities**: Oversee payment operations, ensure compliance, handle audit requests
- **Goals**:
  - Quick visibility into payment trends and volumes
  - Answer audit questions with complete documentation
  - Identify patterns in payment failures
  - Monitor processor performance (Bill.com vs Wise)
- **Pain Points**:
  - "Auditors ask for payment approval history and I can't provide it"
  - "I don't know if failures are increasing or if certain vendors have recurring issues"
  - "I can't tell our CFO what we paid last month without significant manual work"
- **Technical Comfort**: Moderate-High
- **Usage Pattern**: Daily overview, weekly metrics review, monthly reporting, quarterly audits

#### External Auditor (Compliance User)
- **Name**: Audit Team
- **Role**: External SOX/SOC2 auditors
- **Responsibilities**: Verify payment controls and approval processes
- **Goals**:
  - Verify segregation of duties (who approved, who paid)
  - Confirm control checks were performed before payment
  - Trace payments from initiation to completion
  - Export evidence for audit workpapers
- **Pain Points**:
  - "We need to see that controls were checked before each payment"
  - "The audit trail must be immutable and timestamped"
  - "We need to export payment history for our workpapers"
- **Technical Comfort**: Variable
- **Usage Pattern**: Quarterly audits with intensive week-long reviews

### 2.2 User Pain Points (Current State)

| Pain Point | Impact | Frequency | Affected Users |
|-----------|--------|-----------|----------------|
| No searchable payment history | High - cannot reconcile | Daily | Finance Ops, Manager |
| No audit trail | Critical - compliance risk | Quarterly | Auditors, Manager |
| Lost failure details | High - cannot diagnose | Weekly | Finance Ops |
| Manual reporting | High - hours wasted | Weekly/Monthly | Finance Ops, Manager |
| No metrics visibility | Medium - no insights | Ongoing | Manager |
| No initiator tracking | Critical - no accountability | Every payment | Auditors |

### 2.3 User Journey (Target State)

**Payment Lookup Workflow:**
1. **Navigate**: User goes to "Payment History" from main navigation
2. **Search**: Enter payee name "Acme" in search box
3. **Filter**: Set date range to "Last 30 days", status to "All"
4. **Review Results**: See list of Acme payments with amounts, dates, status
5. **View Details**: Click payment row to see full audit trail
6. **Verify**: See control snapshot, initiator email, processor response
7. **Export**: Generate CSV for reconciliation or audit evidence

**Dashboard Review Workflow:**
1. **View Dashboard**: Land on dashboard showing key metrics
2. **Review Trends**: See payments by day chart for current week
3. **Check Health**: View success/failure rate (98.5% success)
4. **Drill Down**: Click on failure percentage to see failed payments
5. **Investigate**: Review failure reasons, identify patterns
6. **Take Action**: Export failure report for vendor follow-up

---

## 3. Goals and Non-Goals

### 3.1 Goals

| ID | Goal | Success Criteria | Priority |
|----|------|-----------------|----------|
| G1 | Searchable payment history | All payments searchable within 24 hours of execution | P0 |
| G2 | Full audit trail per payment | Every payment includes initiator, timestamp, control snapshot | P0 |
| G3 | Filter by date, payee, status, processor | All four filter types functional and combinable | P0 |
| G4 | Sort by any column | All displayed columns sortable asc/desc | P0 |
| G5 | Export to CSV | Export filtered results to downloadable CSV | P1 |
| G6 | Control snapshot preservation | Control check results at payment time immutably stored | P0 |
| G7 | Processor response capture | Bill.com/Wise API responses stored for debugging | P1 |
| G8 | Status change history | Track all state transitions with timestamps | P1 |
| G9 | Dashboard metrics | Payment counts, amounts, success rates by period | P1 |
| G10 | Failure analysis view | Aggregate view of failed payments with reasons | P2 |

### 3.2 Non-Goals (Out of Scope)

| Non-Goal | Rationale |
|----------|-----------|
| Real-time streaming updates | Payments are batch operations; polling is sufficient |
| Payment modification/reversal from history | Corrections happen in source systems (Bill.com/Wise) |
| Multi-tenant cross-organization view | Each organization sees only their own payments |
| Automated compliance reporting | Manual export covers immediate need; automation is Phase 5+ |
| Payment scheduling from history | History is read-only; new payments flow through bills list |
| API access to history | Internal use only; external integrations out of scope |
| Long-term archival (>2 years) | Standard retention sufficient; archival is infrastructure concern |

### 3.3 Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| Payment lookup time | N/A (cannot) | < 10 seconds | User timing, feedback |
| Audit trail completeness | 0% | 100% | Automated validation |
| Export generation time | N/A (manual) | < 30 seconds | System timing |
| Audit response time | 4+ hours | < 30 minutes | Auditor feedback |
| Failed payment investigation time | 30+ minutes | < 5 minutes | User feedback |
| Monthly report generation | 2+ hours (manual) | < 5 minutes | User feedback |
| Compliance audit findings | Unknown risk | 0 findings | Audit results |

---

## 4. Functional Requirements

### 4.1 Payment History View

#### FR-4.1.1: Payment History Page
- **Location**: New "Payment History" section in main navigation
- **Default View**: Last 30 days of payments, sorted by date descending
- **Pagination**: 50 payments per page with infinite scroll or pagination controls
- **Loading State**: Skeleton loader while fetching
- **Acceptance**: History page accessible from navigation, displays payments

#### FR-4.1.2: Search Functionality
- **Search Fields**: Payee name, payment reference, bill ID
- **Behavior**: Case-insensitive partial match
- **Debounce**: 300ms debounce on keystroke
- **Clear**: "X" button to clear search and reset
- **Acceptance**: Search returns matching payments within 2 seconds

#### FR-4.1.3: Date Range Filter
- **Options**:
  - Presets: Today, Last 7 days, Last 30 days, Last 90 days, This month, Last month
  - Custom: Date picker for start and end dates
- **Default**: Last 30 days
- **Validation**: End date must be >= start date; max range 1 year
- **Acceptance**: Date filter correctly limits results to selected range

#### FR-4.1.4: Status Filter
- **Options**: All, Paid, Failed, Processing
- **Default**: All
- **Multi-select**: Allow selecting multiple statuses
- **Acceptance**: Status filter shows only payments matching selected statuses

#### FR-4.1.5: Processor Filter
- **Options**: All, Bill.com, Wise
- **Default**: All
- **Display**: Show processor icon next to option
- **Acceptance**: Processor filter limits results to selected payment processor

#### FR-4.1.6: Amount Range Filter
- **Inputs**: Min amount, Max amount (optional)
- **Validation**: Min <= Max; non-negative values
- **Default**: No filter (all amounts)
- **Acceptance**: Amount filter correctly constrains results

#### FR-4.1.7: Payee/Company Filter
- **Type**: Dropdown with search/autocomplete
- **Source**: Distinct payee names from payment history
- **Multi-select**: Allow selecting multiple payees
- **Acceptance**: Filter limits results to selected payees

#### FR-4.1.8: Sort Functionality
- **Sortable Columns**: Date, Payee, Amount, Status, Processor
- **Default Sort**: Date descending (newest first)
- **Indicators**: Visual arrow showing sort direction
- **Click Behavior**: Click column header to toggle sort
- **Acceptance**: All listed columns sortable with visual indicator

#### FR-4.1.9: Payment List Display
- **Columns**:
  - Date/Time (formatted: "Jan 6, 2026 2:34 PM")
  - Payee Name
  - Amount (formatted with currency)
  - Status (with color-coded badge)
  - Processor (Bill.com or Wise icon)
  - Reference ID (clickable for external lookup)
- **Row Interaction**: Click row to expand/view details
- **Acceptance**: All columns display correctly with proper formatting

#### FR-4.1.10: Empty State
- **Condition**: No payments match filters
- **Display**: Illustration with "No payments found" message
- **Suggestion**: "Try adjusting your filters" with clear filters button
- **Acceptance**: Friendly empty state shown when no results

### 4.2 Payment Audit Details

#### FR-4.2.1: Detail View Access
- **Trigger**: Click payment row or "View Details" button
- **Display**: Modal or slide-out panel
- **Sections**: Summary, Control Snapshot, Status History, Processor Details, Bill Snapshot
- **Acceptance**: Detail view opens with all sections populated

#### FR-4.2.2: Payment Summary Section
- **Fields**:
  - Payment ID (internal reference)
  - Payee Name
  - Amount
  - Status (with badge)
  - Payment Processor
  - External Reference ID (Bill.com payment ID or Wise transfer ID)
  - Initiated By (user email)
  - Initiated At (timestamp)
  - Completed At (timestamp, if applicable)
- **Acceptance**: Summary shows all payment metadata

#### FR-4.2.3: Control Snapshot Section
- **Title**: "Control Check Results at Time of Payment"
- **Display**: List of all controls with pass/fail status at payment time
- **Controls Shown**:
  - Invoice paid in QBO (Pass/Fail)
  - Invoice not voided (Pass/Fail)
  - Payee exists in processor (Pass/Fail)
  - Proving period elapsed (Pass/Fail with hours shown)
  - Amount valid (Pass/Fail)
  - Bill approved in PartnerConnect (Pass/Fail)
- **Timestamp**: "Checked at: Jan 6, 2026 2:33:45 PM"
- **Immutability Note**: "This snapshot reflects control status at payment initiation"
- **Acceptance**: Control snapshot accurately reflects state at payment time

#### FR-4.2.4: Status History Section
- **Title**: "Status Timeline"
- **Display**: Vertical timeline of status changes
- **Each Entry**:
  - Status (created, processing, paid, failed)
  - Timestamp
  - Actor (user email or "System")
  - Notes (if any, e.g., failure reason)
- **Order**: Chronological (oldest to newest)
- **Acceptance**: Complete status history visible

#### FR-4.2.5: Processor Response Section
- **Title**: "Payment Processor Details"
- **Display**:
  - Processor name and type
  - External reference ID (clickable link to external system if available)
  - Response status code
  - Response timestamp
  - Raw response (collapsible, JSON formatted)
- **Security**: Sensitive fields (API keys, tokens) redacted
- **Acceptance**: Processor response details available for debugging

#### FR-4.2.6: Original Bill Snapshot Section
- **Title**: "Original Bill Details"
- **Display**:
  - PartnerConnect Bill ID
  - Client/Company name
  - Project name
  - QBO Invoice number
  - Original amount
  - Payee vendor ID
- **Note**: "Snapshot of bill data at payment time"
- **Acceptance**: Bill details captured at payment time displayed

### 4.3 Dashboard Metrics

#### FR-4.3.1: Dashboard Overview Section
- **Location**: Top of Payment History page or dedicated Dashboard tab
- **Layout**: Grid of metric cards
- **Refresh**: Auto-refresh every 5 minutes; manual refresh button
- **Acceptance**: Dashboard displays with current metrics

#### FR-4.3.2: Payments by Period Card
- **Metric**: Total payment count for selected period
- **Breakdown**: By day (chart) or by week/month (summary)
- **Display**: Number + trend indicator (up/down from previous period)
- **Drill-down**: Click to filter history to that period
- **Acceptance**: Count accurate and clickable

#### FR-4.3.3: Total Amount by Period Card
- **Metric**: Sum of all payment amounts for selected period
- **Format**: Currency with appropriate grouping ($125,450.00)
- **Breakdown**: By day chart showing payment volumes
- **Trend**: Comparison to previous period
- **Acceptance**: Amount accurate with proper formatting

#### FR-4.3.4: Success Rate Card
- **Metric**: (Successful payments / Total payments) * 100
- **Display**: Percentage with visual indicator (green >95%, yellow 90-95%, red <90%)
- **Trend**: Comparison to previous period
- **Drill-down**: Click to filter to failed payments
- **Acceptance**: Percentage accurate; drill-down works

#### FR-4.3.5: Processor Breakdown Card
- **Metric**: Payment count and amount by processor
- **Display**: Pie chart or horizontal bar showing Bill.com vs Wise split
- **Interaction**: Hover for exact numbers
- **Drill-down**: Click segment to filter by processor
- **Acceptance**: Accurate breakdown by processor

#### FR-4.3.6: Average Processing Time Card
- **Metric**: Average time from payment initiation to completion
- **Calculation**: Mean of (completedAt - initiatedAt) for successful payments
- **Display**: Duration in human-readable format (e.g., "2m 34s")
- **Breakdown**: By processor if significantly different
- **Acceptance**: Processing time accurately calculated

#### FR-4.3.7: Period Selector
- **Options**: Today, This Week, This Month, Last Month, Custom Range
- **Behavior**: Changes all dashboard metrics to selected period
- **Default**: This Month
- **Acceptance**: Period selection updates all metrics

### 4.4 Export Functionality

#### FR-4.4.1: Export to CSV Button
- **Location**: Above payment history list, near filters
- **Label**: "Export CSV"
- **Icon**: Download icon
- **Enabled**: Always (exports current filtered view)
- **Acceptance**: Button visible and functional

#### FR-4.4.2: Export Scope
- **Scope**: All payments matching current filters (not just current page)
- **Limit**: Maximum 10,000 records per export
- **Warning**: If >10,000 results, show warning and suggest narrowing filters
- **Acceptance**: Export respects filters

#### FR-4.4.3: CSV Format
- **Columns**:
  - Payment Date
  - Payment Time
  - Payee Name
  - Company Name
  - Project Name
  - Amount
  - Currency
  - Status
  - Processor
  - External Reference
  - Initiated By
  - Failure Reason (if failed)
- **Encoding**: UTF-8 with BOM for Excel compatibility
- **Filename**: `payouts-history-{YYYY-MM-DD}.csv`
- **Acceptance**: CSV opens correctly in Excel with all columns

#### FR-4.4.4: Export Progress
- **Trigger**: User clicks Export
- **Progress**: Show "Generating export..." with spinner
- **Completion**: Auto-download when ready
- **Error**: Show error message if export fails
- **Acceptance**: Export completes within 30 seconds for typical exports

### 4.5 API Endpoints

#### FR-4.5.1: List Payment History Endpoint
- **Endpoint**: `GET /api/payments/history`
- **Query Parameters**:
  - `search` (string): Search term for payee/reference
  - `dateFrom` (ISO date): Start date filter
  - `dateTo` (ISO date): End date filter
  - `status` (string[]): Status filter (paid, failed, processing)
  - `processor` (string): Processor filter (bill_com, wise)
  - `payee` (string[]): Payee name filter
  - `amountMin` (number): Minimum amount
  - `amountMax` (number): Maximum amount
  - `sortBy` (string): Sort column
  - `sortDir` (asc|desc): Sort direction
  - `page` (number): Page number
  - `limit` (number): Records per page (max 100)
- **Response**: Paginated list of payment records with metadata
- **Auth**: Requires authenticated session
- **Acceptance**: Endpoint returns filtered, sorted, paginated results

#### FR-4.5.2: Get Payment Detail Endpoint
- **Endpoint**: `GET /api/payments/:id`
- **Response**: Full payment record including:
  - Payment metadata
  - Control snapshot
  - Status history
  - Processor response
  - Bill snapshot
- **Auth**: Requires authenticated session
- **Not Found**: 404 if payment not found
- **Acceptance**: Returns complete payment audit trail

#### FR-4.5.3: Get Dashboard Metrics Endpoint
- **Endpoint**: `GET /api/payments/metrics`
- **Query Parameters**:
  - `period` (string): today, week, month, custom
  - `dateFrom` (ISO date): Custom start
  - `dateTo` (ISO date): Custom end
- **Response**:
  - `totalCount`: Number of payments
  - `totalAmount`: Sum of payment amounts
  - `successRate`: Percentage successful
  - `averageProcessingTime`: Average time in seconds
  - `byProcessor`: Breakdown by processor
  - `byDay`: Array of daily counts/amounts
- **Auth**: Requires authenticated session
- **Acceptance**: Metrics calculated correctly for period

#### FR-4.5.4: Export Payments Endpoint
- **Endpoint**: `GET /api/payments/export`
- **Query Parameters**: Same as list endpoint (excluding pagination)
- **Response**: CSV file download
- **Content-Type**: `text/csv; charset=utf-8`
- **Content-Disposition**: `attachment; filename="payouts-history-{date}.csv"`
- **Limit**: Maximum 10,000 records
- **Auth**: Requires authenticated session
- **Acceptance**: Returns valid CSV file

---

## 5. Technical Requirements

### 5.1 Data Model Changes

#### TR-5.1.1: Extend PaymentRecord Model

```prisma
model PaymentRecord {
  // Existing fields
  id             String    @id @default(cuid())
  tenantId       String
  tenant         Tenant    @relation(fields: [tenantId], references: [id])
  pcBillId       String    // PartnerConnect bill ID
  qboInvoiceId   String    // QuickBooks invoice ID
  payeeVendorId  String    // Bill.com or Wise vendor ID
  payeeName      String    // Vendor/payee name for display
  amount         Decimal   @db.Decimal(12, 2)
  status         String    // pending_controls, ready, processing, paid, failed
  controlResults Json      // { invoicePaid: true, invoiceNotVoided: true, ... }
  failureReason  String?   // Reason if status is 'failed'
  paidAt         DateTime?
  paymentRef     String?   // External payment reference from Bill.com/Wise
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  // NEW: Audit trail fields
  initiatedBy       String?      // User email who initiated payment
  initiatedAt       DateTime?    // Timestamp when payment was initiated
  completedAt       DateTime?    // Timestamp when payment completed/failed
  controlSnapshot   Json?        // Full control results at payment time
  processorRequest  Json?        // Outbound request to Bill.com/Wise (redacted)
  processorResponse Json?        // Response from Bill.com/Wise (redacted)
  processorCode     String?      // HTTP status code or error code
  billSnapshot      Json?        // Original bill data at payment time

  // NEW: Status history relation
  statusHistory     PaymentStatusHistory[]

  @@index([tenantId])
  @@index([status])
  @@index([pcBillId])
  @@index([initiatedAt])     // NEW: For date filtering
  @@index([payeeName])       // NEW: For payee filtering
  @@map("payment_records")
}
```

#### TR-5.1.2: New PaymentStatusHistory Model

```prisma
model PaymentStatusHistory {
  id              String    @id @default(cuid())
  paymentRecordId String
  paymentRecord   PaymentRecord @relation(fields: [paymentRecordId], references: [id], onDelete: Cascade)
  status          String    // Status value
  changedAt       DateTime  @default(now())
  changedBy       String?   // User email or "System"
  notes           String?   // Optional notes (e.g., failure reason)

  @@index([paymentRecordId])
  @@index([changedAt])
  @@map("payment_status_history")
}
```

#### TR-5.1.3: Data Capture Points

| Field | Capture Point | Source |
|-------|--------------|--------|
| initiatedBy | Payment initiation | Session user email |
| initiatedAt | Payment initiation | Server timestamp |
| completedAt | Payment API response | Server timestamp |
| controlSnapshot | Payment initiation | Current control results |
| processorRequest | Before API call | Outbound payload (redacted) |
| processorResponse | After API call | Response body (redacted) |
| processorCode | After API call | HTTP status/error code |
| billSnapshot | Payment initiation | Bill data from PartnerConnect |

### 5.2 Performance Requirements

| Requirement | Specification |
|-------------|--------------|
| History page load (30 days, 1000 records) | < 2 seconds |
| Search query response | < 1 second |
| Filter application | < 500ms |
| Detail view load | < 500ms |
| CSV export (1000 records) | < 10 seconds |
| CSV export (10000 records) | < 60 seconds |
| Dashboard metrics calculation | < 2 seconds |

### 5.3 Database Indexes

```sql
-- Composite index for common query pattern
CREATE INDEX payment_records_history_idx
ON payment_records (tenant_id, initiated_at DESC, status);

-- Full-text search on payee name
CREATE INDEX payment_records_payee_search_idx
ON payment_records USING gin(to_tsvector('english', payee_name));

-- Status history lookup
CREATE INDEX payment_status_history_lookup_idx
ON payment_status_history (payment_record_id, changed_at);
```

### 5.4 Data Retention

| Requirement | Specification |
|-------------|--------------|
| Payment record retention | 2 years minimum |
| Status history retention | Same as payment record |
| Processor response retention | 90 days (sensitive data) |
| Soft delete | Records never hard deleted; marked as archived |

---

## 6. Non-Functional Requirements

### 6.1 Security

| Requirement | Specification |
|-------------|--------------|
| Authentication | All endpoints require authenticated session |
| Authorization | Users can only view their tenant's payments |
| Audit immutability | Status history entries are append-only; no updates |
| Sensitive data redaction | API keys, tokens redacted from stored responses |
| Export logging | All exports logged with user, timestamp, filter params |

### 6.2 Reliability

| Requirement | Specification |
|-------------|--------------|
| Data capture | All audit fields captured atomically with payment |
| Failure handling | If audit capture fails, payment still proceeds (logged) |
| Export resilience | Large exports chunked; resumable if interrupted |
| Cache | Dashboard metrics cached for 1 minute |

### 6.3 Accessibility

| Requirement | Specification |
|-------------|--------------|
| Keyboard navigation | Full history workflow accessible via keyboard |
| Screen reader | ARIA labels for status badges, icons |
| Focus management | Focus returns appropriately after modal close |
| Color contrast | Status colors meet WCAG AA contrast requirements |

### 6.4 Browser Support

| Requirement | Specification |
|-------------|--------------|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |

---

## 7. Acceptance Criteria

### 7.1 Payment History

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-1 | View payment history | User logged in | Navigate to Payment History | See paginated list of payments |
| AC-2 | Search by payee | 100 payments exist | Search "Acme" | Only Acme payments shown |
| AC-3 | Filter by date range | Payments across 60 days | Set "Last 7 days" | Only last 7 days shown |
| AC-4 | Filter by status | 80 paid, 20 failed | Select "Failed" | Only 20 failed payments shown |
| AC-5 | Filter by processor | 60 Bill.com, 40 Wise | Select "Wise" | Only 40 Wise payments shown |
| AC-6 | Combine filters | Mixed payments | Filter: Last 30 days + Failed + Wise | Correctly intersected results |
| AC-7 | Sort by amount | Mixed amounts | Click Amount header | Sorted by amount |
| AC-8 | Pagination | 500 payments match | Scroll/paginate | All 500 accessible |

### 7.2 Audit Details

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-9 | View audit details | Payment exists | Click payment row | Detail modal opens |
| AC-10 | See initiator | Payment initiated by sarah@fortiumpartners.com | View details | "Initiated By: sarah@fortiumpartners.com" shown |
| AC-11 | See control snapshot | Payment with 5 controls checked | View details | All 5 control results shown with pass/fail |
| AC-12 | See status history | Payment with 3 status changes | View details | Timeline shows all 3 changes |
| AC-13 | See processor response | Bill.com payment | View details | Bill.com response visible |
| AC-14 | See bill snapshot | Payment for Project Alpha | View details | Original bill details shown |

### 7.3 Dashboard Metrics

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-15 | View payment count | 47 payments this month | View dashboard | "47 payments" shown |
| AC-16 | View total amount | $125,000 paid this month | View dashboard | "$125,000.00" shown |
| AC-17 | View success rate | 95 paid, 5 failed | View dashboard | "95.0%" success rate |
| AC-18 | View processor split | 60% Bill.com, 40% Wise | View dashboard | Chart shows accurate split |
| AC-19 | Drill down to failures | 5 failures shown | Click failure metric | History filtered to failed |
| AC-20 | Change period | Viewing this month | Select "Last Month" | All metrics update |

### 7.4 Export

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-21 | Export to CSV | 100 payments visible | Click "Export CSV" | CSV downloads with 100 rows |
| AC-22 | Export respects filters | Filter shows 25 payments | Click "Export CSV" | CSV has only 25 rows |
| AC-23 | CSV opens in Excel | Export generated | Open in Excel | All columns render correctly |
| AC-24 | Large export warning | 15,000 payments match | Click "Export CSV" | Warning shown; suggest filters |

### 7.5 Edge Cases

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-25 | No payment history | New tenant, no payments | View history | Empty state with message |
| AC-26 | Very long payee name | Payee name 100+ chars | View list | Name truncated with tooltip |
| AC-27 | Missing control snapshot | Legacy payment without snapshot | View details | "Not available" message |
| AC-28 | Failed payment details | Payment failed with reason | View details | Failure reason displayed |

---

## 8. Dependencies and Risks

### 8.1 Technical Dependencies

| Dependency | Type | Status | Mitigation |
|-----------|------|--------|------------|
| Prisma schema migration | Database | Required | Additive migration; no breaking changes |
| Existing PaymentRecord | Data model | Already in use | Extend with new fields; preserve existing |
| Session user context | Authentication | Already implemented | Use existing session for initiatedBy |
| Bill.com/Wise response | External API | Already captured partially | Enhance capture, add redaction |

### 8.2 Implementation Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Large data volume slows queries | Medium | High | Proper indexing; pagination; query optimization |
| Processor response contains secrets | High | High | Implement response redaction before storage |
| Historical payments lack audit data | High (for existing) | Low | Accept gaps in pre-implementation payments |
| Export timeout for large datasets | Medium | Medium | Chunked export; async job if needed |
| Migration alters existing data | Low | High | Additive migration only; no alterations |

### 8.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Storage growth from audit data | Medium | Medium | JSON fields compact; monitor growth; archival policy |
| Export abuse (DoS) | Low | Medium | Rate limiting on export endpoint |
| Compliance interpretation | Medium | Medium | Document audit trail completeness; get auditor feedback early |

### 8.4 Implementation Phases

**Phase 4.1: Data Model & Capture (Week 1)**
- Extend PaymentRecord schema with audit fields
- Add PaymentStatusHistory model
- Implement audit data capture in payment flow
- Migrate existing payment processing to capture audit data

**Phase 4.2: History API & UI (Week 2)**
- Implement GET /api/payments/history endpoint
- Build payment history list UI with filters
- Implement search and sort functionality
- Add pagination

**Phase 4.3: Detail View & Status History (Week 2-3)**
- Implement GET /api/payments/:id endpoint
- Build detail modal with all sections
- Add status history timeline
- Implement control snapshot display

**Phase 4.4: Dashboard & Metrics (Week 3)**
- Implement GET /api/payments/metrics endpoint
- Build dashboard metrics cards
- Add period selector
- Implement drill-down interactions

**Phase 4.5: Export & Polish (Week 4)**
- Implement GET /api/payments/export endpoint
- Build export button and progress indicator
- Add large export warning
- Handle edge cases and error states
- Accessibility audit and fixes

---

## 9. Open Questions

| # | Question | Owner | Due Date | Decision |
|---|----------|-------|----------|----------|
| 1 | How long to retain processor responses (contain PII)? | Compliance | TBD | 90 days proposed |
| 2 | Should we capture IP address of initiator? | Security | TBD | TBD - may be compliance requirement |
| 3 | Maximum export size before requiring async job? | Backend | TBD | 10,000 proposed |
| 4 | Should dashboard be separate page or section of history? | Product | TBD | Section of history page proposed |
| 5 | Backfill audit data for existing payments? | Product | TBD | No - accept gaps for pre-implementation |
| 6 | Include control snapshot in CSV export? | Product | TBD | No - too complex; available in detail view |

---

## Appendix A: Control Snapshot Schema

```typescript
interface ControlSnapshot {
  checkedAt: string;           // ISO timestamp
  controls: {
    invoicePaid: {
      status: 'pass' | 'fail' | 'pending';
      message?: string;
      invoiceNumber?: string;
      paidDate?: string;
    };
    invoiceNotVoided: {
      status: 'pass' | 'fail' | 'pending';
      message?: string;
    };
    payeeExists: {
      status: 'pass' | 'fail' | 'pending';
      message?: string;
      processorVendorId?: string;
    };
    provingPeriodElapsed: {
      status: 'pass' | 'fail' | 'pending';
      message?: string;
      hoursRequired: number;
      hoursElapsed: number;
    };
    amountValid: {
      status: 'pass' | 'fail' | 'pending';
      message?: string;
      billAmount: number;
      payAmount: number;
    };
    billApprovedInPC: {
      status: 'pass' | 'fail' | 'pending';
      message?: string;
    };
  };
  allPassed: boolean;
}
```

---

## Appendix B: Bill Snapshot Schema

```typescript
interface BillSnapshot {
  capturedAt: string;          // ISO timestamp
  pcBillId: string;            // PartnerConnect bill ID
  clientName: string;          // Company name
  projectName: string;         // Project name
  payeeName: string;           // Vendor/payee name
  payeeVendorId: string;       // QBO or processor vendor ID
  qboInvoiceNumber: string;    // QuickBooks invoice number
  qboInvoiceId: string;        // QuickBooks invoice ID
  amount: number;              // Original bill amount
  currency: string;            // Currency code (USD, CAD)
  description?: string;        // Bill description if available
}
```

---

## Appendix C: Status History States

| Status | Description | Changed By |
|--------|-------------|------------|
| created | Payment record created | System |
| processing | Payment submitted to processor | System |
| paid | Payment confirmed by processor | System |
| failed | Payment failed at processor | System |

---

## Appendix D: UI Mockup Specifications

### D.1 Payment History List

```
+------------------------------------------------------------------+
| Payment History                                    [Export CSV]    |
+------------------------------------------------------------------+
| Search: [________________]  Date: [Last 30 days v]                |
| Status: [All v]  Processor: [All v]  Amount: [$___] to [$___]    |
+------------------------------------------------------------------+
| Date           | Payee          | Amount     | Status  | Via      |
|----------------|----------------|------------|---------|----------|
| Jan 6, 2:34 PM | Acme Corp      | $12,500.00 | [Paid]  | Bill.com |
| Jan 6, 1:15 PM | Beta Inc       | $8,750.00  | [Paid]  | Wise     |
| Jan 5, 4:22 PM | Gamma LLC      | $5,200.00  | [FAIL]  | Bill.com |
| Jan 5, 3:01 PM | Delta Partners | $15,000.00 | [Paid]  | Wise     |
+------------------------------------------------------------------+
| Showing 1-50 of 234 payments                      [< 1 2 3 4 5 >] |
+------------------------------------------------------------------+
```

### D.2 Payment Detail Modal

```
+--------------------------------------------------+
|  Payment Details                            [X]  |
+--------------------------------------------------+
| SUMMARY                                          |
| Payment ID: pay_cljh72...                        |
| Amount: $12,500.00 USD                           |
| Status: [Paid]                                   |
| Processor: Bill.com                              |
| Reference: BC-12345678                           |
| Initiated By: sarah@fortiumpartners.com          |
| Initiated: Jan 6, 2026 2:33:45 PM                |
| Completed: Jan 6, 2026 2:34:12 PM                |
+--------------------------------------------------+
| CONTROL SNAPSHOT (at payment time)               |
| Checked: Jan 6, 2026 2:33:44 PM                  |
| [v] Invoice paid in QBO - Paid Dec 30, 2025      |
| [v] Invoice not voided                           |
| [v] Payee exists in Bill.com - Vendor #V-12345   |
| [v] Proving period elapsed - 168h (required 24h) |
| [v] Amount valid - $12,500 <= $12,500            |
| [v] Bill approved in PartnerConnect              |
+--------------------------------------------------+
| STATUS TIMELINE                                  |
| o Jan 6, 2:33:45 PM - Created (System)           |
| o Jan 6, 2:33:46 PM - Processing (System)        |
| o Jan 6, 2:34:12 PM - Paid (System)              |
+--------------------------------------------------+
| ORIGINAL BILL                                    |
| Client: Acme Corporation                         |
| Project: Q1 Consulting                           |
| QBO Invoice: INV-10234                           |
+--------------------------------------------------+
```

### D.3 Dashboard Metrics

```
+------------------------------------------------------------------+
| Dashboard                        Period: [This Month v] [Refresh] |
+------------------------------------------------------------------+
| +---------------+ +---------------+ +---------------+ +-----------+
| |   47          | |  $125,450     | |    95.0%     | |  2m 34s   |
| |   Payments    | |  Total Paid   | |  Success Rate | | Avg Time  |
| |   +12% vs LM  | |  +$15K vs LM  | |  -2% vs LM   | |           |
| +---------------+ +---------------+ +---------------+ +-----------+
|                                                                   |
| +--------------------------------+  +----------------------------+
| | Payments by Day                |  | By Processor               |
| | [Bar chart: daily counts]      |  | [Pie: 60% BC, 40% Wise]   |
| |                                |  |                            |
| +--------------------------------+  +----------------------------+
+------------------------------------------------------------------+
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-06 | Product Management | Initial draft |
