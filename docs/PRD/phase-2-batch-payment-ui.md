# PRD: Phase 2 - Batch Payment UI

> Fortium Payouts - Multi-select Bill Payment with Company Grouping
> Version: 1.0
> Created: 2026-01-06
> Status: Draft

---

## 1. Product Summary

### 1.1 Problem Statement

Finance Operations staff at Fortium Partners process daily payment runs for partners and subcontractors through Fortium Payouts. The current interface presents a flat list of bills where each bill must be paid individually via a single "Pay" button. This creates significant operational inefficiencies:

1. **Repetitive Workflow**: When 30-100 bills are ready for payment, users must click through each bill individually, confirm each payment, and wait for completion before proceeding to the next
2. **No Visibility into Payment Totals**: Users cannot see the aggregate amount they're about to pay across selected bills before initiating payments
3. **Difficult Company Analysis**: Bills from the same client company are scattered throughout the list, making it hard to analyze or batch by company
4. **Time Consuming**: A typical daily payment run of 50 ready bills takes 30-45 minutes due to sequential processing
5. **Error Prone**: Manual one-by-one payment increases risk of missing bills or paying incorrect amounts

### 1.2 Solution Overview

Redesign the bills list interface to support batch operations through intelligent grouping and multi-select capabilities:

**Company Grouping**
- Group bills by client company with expandable/collapsible sections
- Display company-level totals (bill count, total amount, ready count)
- Enable quick visibility into payment obligations per client

**Multi-Select Capabilities**
- Add checkbox selection per bill with bulk selection actions
- Pre-select all "Ready" bills by default to streamline common workflow
- Provide "Select All" / "Deselect All" controls at company and global levels
- Display real-time running total of selected amount

**Batch Payment Processing**
- Single "Pay Selected" action to process all checked bills
- Sequential payment processing with visual progress indicator
- Comprehensive results summary with success/failure breakdown
- Retry capability for failed payments without affecting successful ones

### 1.3 Value Proposition

| Metric | Current State | Target State |
|--------|--------------|--------------|
| Time to pay 50 ready bills | 30-45 minutes | 5-8 minutes |
| Clicks to initiate 50 payments | 100+ clicks | 3-4 clicks |
| Pre-payment total visibility | None | Full amount shown |
| Company-level payment grouping | Manual mental tracking | Automatic grouping |
| Failed payment recovery | Start over | Selective retry |

---

## 2. User Analysis

### 2.1 User Personas

#### Finance Operations Specialist (Primary User)
- **Name**: Sarah Chen
- **Role**: Finance Operations Specialist at Fortium Partners
- **Responsibilities**: Execute daily payment runs for US and Canada partners/subcontractors
- **Goals**:
  - Process all approved payments efficiently before end of day
  - Minimize errors and missed payments
  - Track payment status across multiple clients
- **Pain Points**:
  - "I have to click Pay on every single bill - when there are 50 bills ready, it takes forever"
  - "I can't see the total I'm about to pay until I've processed everything"
  - "If a payment fails, I lose track of what I've already paid and what's left"
  - "Bills from the same company are mixed in with everything else - I can't easily batch by client"
- **Technical Comfort**: Moderate - comfortable with web applications, prefers clear visual feedback
- **Usage Pattern**: Daily (typically morning), processes 30-100 bills per session
- **Context**: Works in office environment, may be interrupted during payment runs

#### Finance Manager (Secondary User)
- **Name**: Michael Torres
- **Role**: Finance Manager
- **Responsibilities**: Oversee payment operations, ensure compliance, handle exceptions
- **Goals**:
  - Quick visibility into daily payment pipeline and totals
  - Identify blocked or problematic payments
  - Ensure timely vendor/partner payments
- **Pain Points**:
  - "I need to know total payment amounts by company for cash flow planning"
  - "When Sarah processes payments, I can't see aggregate progress"
  - "Reporting on payments by client is difficult with the flat list"
- **Technical Comfort**: Moderate-High
- **Usage Pattern**: Daily oversight, ad-hoc investigation of specific issues

### 2.2 User Pain Points (Current State)

| Pain Point | Impact | Frequency | User Quote |
|-----------|--------|-----------|------------|
| Sequential payment processing | High - wastes 25-40 min/day | Daily | "Click, confirm, wait, repeat - fifty times" |
| No pre-payment total visibility | High - cash flow uncertainty | Daily | "I have no idea what I'm about to pay out" |
| Flat list without grouping | Medium - mental overhead | Daily | "I'm constantly scanning for related bills" |
| No progress tracking for batch | Medium - anxiety, confusion | Per payment run | "Did I miss one? Did that one go through?" |
| Failed payment recovery difficult | High - rework required | Weekly | "One failure means I have to manually track what worked" |
| No way to skip specific bills | Medium - inflexibility | Weekly | "I want to pay most but hold back a few" |

### 2.3 User Journey (Target State)

**Daily Payment Run Workflow:**

1. **Login & Navigate**: User logs in, lands on dashboard with bills list
2. **Review Grouped View**: Bills displayed grouped by company, all "Ready" bills pre-selected
3. **Quick Scan**: User sees total selected: "47 bills selected | $127,450.00"
4. **Adjust Selection** (if needed): User unchecks specific bills to hold back, or uses company-level controls
5. **Review by Company**: Expand company sections to verify individual bills if needed
6. **Initiate Batch Payment**: Click "Pay Selected" button
7. **Confirm Total**: Modal shows summary: "Pay 47 bills totaling $127,450.00?"
8. **Monitor Progress**: Progress indicator: "Processing 15/47... Acme Corp - Bill #1234 complete"
9. **Review Results**: Summary modal: "45 succeeded, 2 failed - [View Failed] [Done]"
10. **Handle Failures**: Click "View Failed" to see issues, fix if possible, retry failed only

---

## 3. Goals and Non-Goals

### 3.1 Goals

| ID | Goal | Success Criteria | Priority |
|----|------|-----------------|----------|
| G1 | Group bills by client company | Bills grouped with expandable sections showing company totals | P0 |
| G2 | Enable multi-select for batch payment | Checkbox per bill with bulk selection controls | P0 |
| G3 | Pre-select ready bills | All "Ready" bills selected by default on page load | P0 |
| G4 | Display selected total amount | Running total shown and updated as selection changes | P0 |
| G5 | Process batch payments sequentially | "Pay Selected" processes all checked bills in sequence | P0 |
| G6 | Show batch progress indicator | Visual progress during batch processing (X/Y complete) | P0 |
| G7 | Provide results summary | Modal showing successes and failures after batch completes | P0 |
| G8 | Enable retry of failed payments | Option to retry only failed bills without re-paying successful | P1 |
| G9 | Company-level selection controls | "Select All" / "Deselect All" per company group | P1 |
| G10 | Keyboard navigation | Tab through bills, Space to toggle, Enter to pay | P2 |

### 3.2 Non-Goals (Out of Scope)

| Non-Goal | Rationale |
|----------|-----------|
| Parallel payment processing | Payment systems may not handle concurrent requests well; sequential is safer |
| Payment scheduling | Future feature - for now, payments execute immediately |
| Payment amount editing | Amount comes from source bill; editing requires upstream changes |
| Company-level "Pay All" button | User should review individual bills before bulk payment |
| Saved selections | Selection resets on page refresh; not needed for daily workflow |
| Cross-tenant batch payment | US and Canada payments use different processors; keep separate |
| Export selected bills | Reporting is out of scope for Phase 2 |
| Payment prioritization/ordering | Bills process in display order; custom ordering is future enhancement |

### 3.3 Success Metrics

| Metric | Baseline | Target | Measurement Method |
|--------|----------|--------|-------------------|
| Time to complete 50-bill payment run | 30-45 minutes | 5-8 minutes | User feedback, session timing |
| User clicks per payment run | 100+ clicks | 5-10 clicks | Analytics (future) |
| Failed payment recovery time | 15+ minutes (restart) | 2-3 minutes (retry) | User feedback |
| User satisfaction score | N/A (new feature) | > 4.5/5 | Post-release survey |
| Payment errors/missed bills | 2-3 per week | < 1 per week | Support tickets |
| Daily payment run completion rate | 95% | 99% | System metrics |

---

## 4. Functional Requirements

### 4.1 Company Grouping

#### FR-4.1.1: Bills Grouped by Client Company
- **Trigger**: Page loads or view mode switched to "Grouped"
- **Behavior**: Bills displayed in expandable sections, one per client company (clientName field)
- **Sort Order**: Companies sorted alphabetically or by total amount (configurable)
- **Display**: Each company header shows:
  - Company name
  - Bill count (total and ready)
  - Total amount
  - Ready amount
- **Acceptance**: Bills correctly grouped by clientName field

#### FR-4.1.2: Expandable/Collapsible Company Sections
- **Trigger**: User clicks company header or expand/collapse icon
- **Behavior**: Section expands to show individual bills or collapses to header only
- **Default State**: All sections expanded on initial load
- **Memory**: Section state not persisted across page refreshes
- **Animation**: Smooth expand/collapse animation (< 200ms)
- **Acceptance**: Each company section can be independently expanded/collapsed

#### FR-4.1.3: Company Summary Row
- **Display Elements**:
  - Company name (bold)
  - Total bills: "12 bills"
  - Ready count: "8 ready"
  - Total amount: "$45,230.00"
  - Expand/collapse chevron icon
- **Selection State**: Company row shows aggregate selection (all/some/none indicator)
- **Acceptance**: Summary accurately reflects bills within group

### 4.2 Multi-Select Capabilities

#### FR-4.2.1: Checkbox Per Bill
- **Location**: Left side of each bill row
- **State**: Checked (selected) or unchecked
- **Enabled**: Only for bills with `readyToPay === true`
- **Disabled State**: Grayed checkbox with tooltip "Not ready - controls not passed"
- **Interaction**: Click checkbox or row (excluding other interactive elements) toggles selection
- **Acceptance**: Each ready bill has a functional checkbox

#### FR-4.2.2: Pre-Selection of Ready Bills
- **Trigger**: Page load or filter change
- **Behavior**: All bills with `readyToPay === true` are selected by default
- **Rationale**: Most common workflow is paying all ready bills
- **Override**: User can manually deselect individual bills
- **Acceptance**: On page load, all ready bills show checked checkboxes

#### FR-4.2.3: Global Selection Controls
- **Location**: Above bills list, next to "Pay Selected" button
- **Controls**:
  - "Select All Ready" - selects all bills with `readyToPay === true`
  - "Deselect All" - clears all selections
- **Keyboard**: Ctrl/Cmd+A selects all ready, Escape deselects all
- **Acceptance**: Global controls affect all displayed bills

#### FR-4.2.4: Company-Level Selection Controls
- **Location**: On company header row
- **Controls**: Checkbox that toggles all ready bills within that company
- **States**:
  - Checked: All ready bills in company selected
  - Unchecked: No bills in company selected
  - Indeterminate: Some (but not all) ready bills selected
- **Interaction**: Click toggles between "all selected" and "none selected"
- **Acceptance**: Company checkbox affects only bills within that company

#### FR-4.2.5: Selection Total Display
- **Location**: Sticky header or toolbar area, always visible
- **Display**: "X bills selected | $Y,YYY.YY"
- **Update**: Real-time update as selection changes (no delay)
- **Styling**: Prominent display, larger font for amount
- **Breakdown**: Optional tooltip showing count/amount by tenant (US vs CA)
- **Acceptance**: Total updates immediately on selection change

### 4.3 Batch Payment Processing

#### FR-4.3.1: "Pay Selected" Button
- **Location**: Primary action area (header or sticky bar)
- **Enabled State**: At least one bill selected
- **Disabled State**: No bills selected, with tooltip "Select bills to pay"
- **Label**: "Pay Selected (X)" where X is count
- **Styling**: Primary button style, prominent color
- **Acceptance**: Button enabled only when selection exists

#### FR-4.3.2: Batch Confirmation Modal
- **Trigger**: User clicks "Pay Selected"
- **Display**:
  - Title: "Confirm Batch Payment"
  - Summary: "You are about to pay X bills totaling $Y,YYY.YY"
  - Breakdown by tenant: "US: 12 bills ($45,230) via Bill.com | CA: 5 bills ($12,400) via Wise"
  - Large amount warning (if total > $10,000): Yellow alert with "PAY" type-to-confirm
  - Bill list preview (scrollable, collapsed by default)
- **Actions**: "Cancel" and "Confirm Payment"
- **Acceptance**: Modal shows accurate counts and totals

#### FR-4.3.3: Sequential Payment Processing
- **Trigger**: User confirms batch payment
- **Behavior**: Process selected bills one at a time in sequence
- **Order**: Process by company, then by bill amount (largest first)
- **Timing**: 500ms minimum between payments to avoid rate limiting
- **No Parallel**: Explicitly sequential to ensure payment integrity
- **Acceptance**: Bills processed one at a time in defined order

#### FR-4.3.4: Progress Indicator During Batch
- **Display**: Modal overlay during processing (cannot dismiss)
- **Progress Elements**:
  - Overall progress: "Processing 15/47 bills..."
  - Progress bar: Visual percentage complete
  - Current bill: "Paying Acme Corp - Invoice #1234 ($2,500)"
  - Success count: "23 succeeded"
  - Failure count: "2 failed" (red if any failures)
- **Update Frequency**: Real-time update after each payment
- **Acceptance**: Progress updates after each payment completes

#### FR-4.3.5: Abort Batch Option
- **Location**: Progress modal
- **Display**: "Stop After Current" button
- **Behavior**: Complete current payment, then stop batch
- **Result**: Partial completion - some paid, some not attempted
- **Use Case**: User realizes error, needs to stop immediately
- **Acceptance**: Abort stops processing without canceling in-flight payment

### 4.4 Results and Recovery

#### FR-4.4.1: Batch Results Summary Modal
- **Trigger**: All selected payments processed (or batch aborted)
- **Display**:
  - Title: "Batch Payment Complete" or "Batch Payment Stopped"
  - Success summary: "45 bills paid successfully ($127,450)"
  - Failure summary: "2 bills failed ($5,200)"
  - Skipped summary (if aborted): "0 bills not attempted"
- **Actions**:
  - "View Failed" - shows failed bills with reasons
  - "Retry Failed" - re-attempts failed payments only
  - "Done" - closes modal and refreshes list
- **Acceptance**: Summary accurately reflects batch results

#### FR-4.4.2: Failed Payment Details
- **Trigger**: User clicks "View Failed" in results modal
- **Display**: List of failed bills with:
  - Payee name
  - Amount
  - Error reason (from payment API)
  - Timestamp
- **Actions Per Bill**: "Retry" button for individual retry
- **Acceptance**: All failed bills listed with error reasons

#### FR-4.4.3: Retry Failed Payments
- **Trigger**: User clicks "Retry Failed" or individual "Retry" button
- **Behavior**: Re-process failed bills through same batch flow
- **Pre-Check**: Re-validate controls before retry (may have changed)
- **Results**: New results summary for retry batch
- **Acceptance**: Only failed bills included in retry batch

#### FR-4.4.4: Post-Batch List Update
- **Trigger**: User closes results modal
- **Behavior**:
  - Refresh bills list from server
  - Paid bills no longer appear (filtered out by PartnerConnect)
  - Failed bills remain with updated control status
  - Selection cleared
- **Acceptance**: List reflects current state after payments

### 4.5 View Mode Integration

#### FR-4.5.1: List View with Selection
- **Behavior**: Existing flat list view enhanced with checkboxes
- **Grouping**: No grouping in list view
- **Selection**: All selection features work in list view
- **Acceptance**: List view supports full selection functionality

#### FR-4.5.2: Grouped View with Selection
- **Behavior**: Bills grouped by company with selection features
- **Toggle**: "List" / "By Company" view toggle (update existing "By Payee")
- **Persistence**: View mode preference persisted in localStorage
- **Acceptance**: Grouped view shows company sections with selection

#### FR-4.5.3: View Mode Switching
- **Trigger**: User toggles view mode
- **Behavior**: Selection state preserved when switching views
- **Acceptance**: Selections maintained across view mode changes

### 4.6 API Endpoints

#### FR-4.6.1: Batch Payment Endpoint
- **Endpoint**: `POST /api/payments/batch`
- **Request Body**:
  ```json
  {
    "billIds": ["bill-1", "bill-2", "bill-3"],
    "processDate": "2026-01-06"  // Optional, defaults to today
  }
  ```
- **Response**: Server-Sent Events (SSE) stream
- **Events**:
  - `progress`: `{ billId, status: "processing" }`
  - `success`: `{ billId, paymentId, amount, message }`
  - `failure`: `{ billId, error, message }`
  - `complete`: `{ summary: { succeeded, failed, total } }`
- **Auth**: Requires authenticated session
- **Acceptance**: Endpoint processes bills and streams results

#### FR-4.6.2: Fallback Polling Endpoint (if SSE unavailable)
- **Endpoint**: `GET /api/payments/batch/:batchId/status`
- **Response**: Current batch status with per-bill results
- **Polling Interval**: 1 second
- **Acceptance**: Status endpoint returns current batch progress

---

## 5. Non-Functional Requirements

### 5.1 Performance

| Requirement | Specification |
|-------------|--------------|
| Selection toggle latency | < 50ms UI response |
| Total calculation update | < 100ms after selection change |
| Grouped view render (100 bills) | < 500ms initial render |
| Batch initiation response | < 1 second to show progress modal |
| Single payment processing | 2-5 seconds (dependent on external API) |
| Full batch (50 bills) | < 5 minutes total processing |

### 5.2 Scalability

| Requirement | Specification |
|-------------|--------------|
| Bills per batch | Support up to 200 bills in single batch |
| Concurrent batches | One batch per user session (no parallel batches) |
| Company groups | Handle up to 50 unique companies per page |
| Bills per company | No limit on bills within a company group |

### 5.3 Reliability

| Requirement | Specification |
|-------------|--------------|
| Partial failure handling | Complete batch despite individual failures |
| Network interruption | Resume or report status if connection lost |
| Payment idempotency | Retry does not create duplicate payments |
| Session timeout during batch | Batch continues server-side; reconnect shows status |

### 5.4 Security

| Requirement | Specification |
|-------------|--------------|
| Authentication | All batch endpoints require authenticated session |
| Authorization | Users can only pay bills visible to them |
| Large amount confirmation | Require type-to-confirm for batches > $10,000 |
| Audit logging | Log all batch initiations with user, bills, totals |

### 5.5 Accessibility

| Requirement | Specification |
|-------------|--------------|
| Keyboard navigation | Full batch workflow accessible via keyboard |
| Screen reader | ARIA labels for selection state, progress |
| Focus management | Focus returns to appropriate element after modals |
| Color contrast | Selection state distinguishable without color alone |

### 5.6 Browser Support

| Requirement | Specification |
|-------------|--------------|
| Chrome | Latest 2 versions |
| Firefox | Latest 2 versions |
| Safari | Latest 2 versions |
| Edge | Latest 2 versions |
| SSE Support | All targeted browsers support SSE |

---

## 6. Acceptance Criteria

### 6.1 Company Grouping

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-1 | Bills grouped by company | 20 bills from 5 companies | Grouped view loaded | 5 company sections displayed |
| AC-2 | Company totals accurate | Company has 4 bills totaling $10,000 | View company section | Header shows "4 bills | $10,000.00" |
| AC-3 | Expand/collapse works | Company section collapsed | Click expand icon | Bills within company visible |
| AC-4 | All sections expandable | 5 company sections | Expand all | All 5 sections show their bills |

### 6.2 Selection Features

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-5 | Ready bills pre-selected | 30 ready bills, 10 pending | Page loads | 30 checkboxes checked, 10 disabled |
| AC-6 | Toggle single bill | Bill is selected | Click checkbox | Bill becomes unselected |
| AC-7 | Select All Ready | Some ready bills unchecked | Click "Select All Ready" | All ready bills checked |
| AC-8 | Deselect All | 20 bills selected | Click "Deselect All" | All checkboxes unchecked |
| AC-9 | Company select all | 5 ready bills in company, 2 selected | Click company checkbox | All 5 selected |
| AC-10 | Selection total updates | 10 bills selected ($25,000) | Select 1 more ($5,000) | Total shows "11 bills | $30,000.00" |

### 6.3 Batch Payment

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-11 | Confirm modal shows | 15 bills selected | Click "Pay Selected" | Confirmation modal with summary |
| AC-12 | Batch processes sequentially | Confirm 10-bill batch | During processing | Bills process one at a time |
| AC-13 | Progress updates | 10-bill batch processing | After each payment | Progress shows "X/10 complete" |
| AC-14 | Success summary | All 10 payments succeed | Batch completes | "10 bills paid successfully" |
| AC-15 | Partial failure | 8 succeed, 2 fail | Batch completes | "8 succeeded, 2 failed" with details |
| AC-16 | Abort batch | Batch in progress at 5/10 | Click "Stop After Current" | Batch stops at 6, shows partial results |

### 6.4 Recovery

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-17 | View failed details | 2 payments failed | Click "View Failed" | List of 2 bills with error reasons |
| AC-18 | Retry failed only | Results show 2 failed | Click "Retry Failed" | Only 2 failed bills re-processed |
| AC-19 | List refreshes | Batch completed with successes | Close results modal | Paid bills removed from list |
| AC-20 | Individual retry | Viewing failed bill | Click "Retry" on bill | Single bill re-processed |

### 6.5 Edge Cases

| ID | Scenario | Given | When | Then |
|----|----------|-------|------|------|
| AC-21 | No ready bills | All bills have control issues | Page loads | "Pay Selected" disabled, no checkboxes enabled |
| AC-22 | Large batch warning | Select 50 bills totaling $100,000 | Click "Pay Selected" | Type-to-confirm required |
| AC-23 | Empty selection | All bills deselected | View toolbar | "Pay Selected (0)" disabled |
| AC-24 | Mixed tenants | Select US and CA bills | View confirmation | Breakdown shows US and CA totals separately |

---

## 7. Dependencies and Risks

### 7.1 Technical Dependencies

| Dependency | Type | Status | Mitigation |
|-----------|------|--------|------------|
| Phase 3 (Efficient Controls) | Feature | Recommended first | Batch payment works without; pre-checked controls improve UX |
| Server-Sent Events (SSE) | Frontend technology | Browser support good | Polling fallback implemented |
| Payment API rate limits | External | Bill.com: 100/min, Wise: 100/min | Sequential processing with delays |
| PostgreSQL batch operations | Database | Already in use | No changes needed |

### 7.2 Integration Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Payment API rate limiting | Medium | High | 500ms delay between payments; queue if needed |
| SSE connection drops | Medium | Medium | Automatic reconnection; batch continues server-side |
| Bill.com session timeout during long batch | Low | Medium | Session refresh between payments |
| Partial batch failures with unclear state | Medium | High | Comprehensive results tracking; audit log |

### 7.3 Operational Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| User initiates duplicate batch | Low | High | Disable "Pay Selected" during active batch; server-side guard |
| Browser crash during batch | Low | Medium | Batch continues server-side; status endpoint for recovery |
| Incorrect total displayed | Low | High | Server-side validation before processing; client/server total comparison |
| User pays wrong bills | Medium | Medium | Confirmation modal with bill list; type-to-confirm for large amounts |

### 7.4 UX Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Confusion about pre-selection | Medium | Low | Clear messaging: "All ready bills selected" |
| Anxiety during long batch | Medium | Medium | Detailed progress indicator; estimated time |
| Frustration with abort | Low | Medium | Clear messaging about partial completion state |

### 7.5 Sequencing Recommendation

**Recommended Implementation Order:**

1. **Phase 3 (Efficient Controls)** - First
   - Pre-computed controls enable immediate "readyToPay" state on load
   - Without this, users must manually check each bill before batch becomes useful

2. **Phase 2 (Batch Payment UI)** - Second
   - Full value when controls are pre-checked
   - Can be built in parallel with Phase 3 backend work

**Rationale**: While Phase 2 is technically independent, the user experience is significantly degraded without Phase 3. If users must click to check controls before selection, the batch workflow adds friction rather than removing it.

### 7.6 Implementation Phases

**Phase 2.1: Selection Infrastructure (Week 1)**
- Add checkbox component and selection state management
- Implement selection total display
- Add "Select All Ready" / "Deselect All" global controls

**Phase 2.2: Company Grouping (Week 1-2)**
- Create grouped view component (modify existing "By Payee" to "By Company")
- Implement company-level selection controls
- Add expand/collapse functionality

**Phase 2.3: Batch Payment Backend (Week 2)**
- Implement `POST /api/payments/batch` endpoint
- Add SSE streaming for progress
- Implement sequential payment processing with delays

**Phase 2.4: Batch Payment Frontend (Week 3)**
- Create confirmation modal with breakdown
- Implement progress modal with live updates
- Create results summary modal with retry options

**Phase 2.5: Polish and Edge Cases (Week 3-4)**
- Handle large amount warnings
- Implement abort functionality
- Add error recovery and retry flows
- Keyboard accessibility

---

## 8. Open Questions

| # | Question | Owner | Due Date | Decision |
|---|----------|-------|----------|----------|
| 1 | Should pre-selection be on by default or opt-in? | Product | TBD | Default on - matches most common workflow |
| 2 | What's the threshold for type-to-confirm in batch? | Product | TBD | $10,000 total (same as current $1,000 single) |
| 3 | Should we show estimated completion time? | Frontend | TBD | Yes - based on 3s/bill average |
| 4 | Maximum batch size? | Backend | TBD | 200 bills to stay within rate limits |
| 5 | Should selections persist on filter change? | Product | TBD | Clear on filter change to avoid confusion |
| 6 | Group by client company name or ID? | Backend | TBD | Name (display) with ID for grouping accuracy |

---

## Appendix A: UI Mockup Specifications

### A.1 Grouped View Layout

```
+------------------------------------------------------------------+
| Bills                                              [List] [By Company] |
+------------------------------------------------------------------+
| [x] Select All Ready (35)  [  ] Deselect All                      |
| Selected: 35 bills | $127,450.00                  [Pay Selected (35)] |
+------------------------------------------------------------------+
| v [x] Acme Corporation                    8 bills | $45,230.00    |
|   +--------------------------------------------------------------+
|   | [x] | US | Acme Corp | Project Alpha | $12,500 | Ready       |
|   | [x] | US | Acme Corp | Project Beta  |  $8,750 | Ready       |
|   | [ ] | US | Acme Corp | Project Gamma |  $5,000 | 2 issues    |
|   +--------------------------------------------------------------+
|                                                                   |
| > [ ] Beta Industries                     3 bills | $22,100.00    |
|                                                                   |
| v [x] Gamma Partners                      5 bills | $18,400.00    |
|   +--------------------------------------------------------------+
|   | [x] | CA | Gamma Partners | Consulting | $8,200 | Ready      |
|   | [x] | CA | Gamma Partners | Services   | $6,500 | Ready      |
|   +--------------------------------------------------------------+
+------------------------------------------------------------------+
```

### A.2 Progress Modal Layout

```
+------------------------------------------+
|        Processing Batch Payment          |
+------------------------------------------+
|                                          |
|  [===================>      ] 67%        |
|                                          |
|  Processing 15/22 bills...               |
|                                          |
|  Current: Acme Corp - Invoice #1234      |
|           $2,500.00                      |
|                                          |
|  +------------------------------------+  |
|  | Succeeded: 14  |  Failed: 1        |  |
|  +------------------------------------+  |
|                                          |
|        [ Stop After Current ]            |
|                                          |
+------------------------------------------+
```

### A.3 Results Modal Layout

```
+------------------------------------------+
|       Batch Payment Complete             |
+------------------------------------------+
|                                          |
|  [CHECK ICON]  20 bills paid             |
|               $85,750.00                 |
|                                          |
|  [X ICON]      2 bills failed            |
|               $5,200.00                  |
|                                          |
|  +------------------------------------+  |
|  | Acme Corp - #1234 | $2,500         |  |
|  | Error: Bill.com timeout - [Retry]  |  |
|  +------------------------------------+  |
|  | Beta Inc - #5678  | $2,700         |  |
|  | Error: Vendor not found - [Retry]  |  |
|  +------------------------------------+  |
|                                          |
|  [ Retry Failed (2) ]        [ Done ]    |
|                                          |
+------------------------------------------+
```

---

## Appendix B: State Machine

### B.1 Selection State

```
States: empty, partial, all_ready

Transitions:
- empty -> partial: Select one bill
- empty -> all_ready: "Select All Ready"
- partial -> empty: "Deselect All"
- partial -> all_ready: Select remaining ready bills
- all_ready -> partial: Deselect one bill
- all_ready -> empty: "Deselect All"
```

### B.2 Batch Processing State

```
States: idle, confirming, processing, completing, complete, aborted

Transitions:
- idle -> confirming: Click "Pay Selected"
- confirming -> idle: Cancel confirmation
- confirming -> processing: Confirm payment
- processing -> completing: All payments attempted
- processing -> aborted: User aborts
- completing -> complete: Results modal shown
- aborted -> complete: Partial results shown
- complete -> idle: Close results modal
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-06 | Product Management | Initial draft |
