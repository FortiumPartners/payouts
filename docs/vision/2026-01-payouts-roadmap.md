# Fortium Payouts - Feature Roadmap Vision

> Vision document for upcoming Payouts enhancements
> Created: 2026-01-06

## Overview

This document outlines the next phase of Payouts development, focusing on improved user experience, batch operations, and operational visibility.

---

## Phase 1: Payment Email Confirmations

### Problem
When payments are processed through Wise (Canada), payees receive confirmation from Wise but Fortium has no direct communication channel. This creates uncertainty about payment status and lacks professional branding.

### Solution
Send branded email confirmations from Fortium when payments are initiated, providing:
- Payment amount and currency
- Expected delivery timeframe
- Reference/invoice number
- Fortium contact information for questions

### Technical Approach
- Integrate Postmark email service (existing account at `../postmark`)
- Trigger email after successful Wise transfer funding
- Template-based emails with payment details
- Store email delivery status in payment records

### Scope
- Wise payments only (Bill.com has its own notifications)
- Payee notification (not internal alerts - phase 2)

---

## Phase 2: Batch Payment UI

### Problem
Currently, bills are paid one at a time. When multiple bills are ready for the same company or across companies, this is tedious and time-consuming.

### Solution
Redesign the bills list to support batch operations:

**Grouping**
- Group bills by company (client) with expandable sections
- Show company totals and bill counts
- Collapse/expand individual companies

**Selection**
- Checkbox per bill (default: all ready bills selected)
- "Select All" / "Deselect All" per company
- "Select All Ready" global action
- Visual indication of selected total amount

**Batch Payment**
- "Pay Selected" button processes all checked bills
- Sequential processing with progress indicator
- Summary of successes/failures after batch completes
- Option to retry failed payments

### UX Flow
1. Page loads with bills grouped by company
2. All "Ready" bills pre-selected
3. User can uncheck specific bills
4. Click "Pay Selected"
5. Confirmation modal shows total amount and bill count
6. Processing indicator during batch
7. Results summary with next steps

---

## Phase 3: Efficient Controls Checking

### Problem
Controls are currently checked on-demand when viewing bill details or attempting payment. This creates latency and prevents effective batch operations.

### Solution
Pre-compute control status when the bills list loads:

**Background Processing**
- Check controls for all displayed bills on page load
- Cache results with short TTL (5 minutes)
- Show loading states while controls evaluate

**Optimized Queries**
- Batch QBO queries (multiple invoices in one call)
- Batch Bill.com queries (multiple bills in one call)
- Parallel execution of independent controls

**Control Status Cache**
- Store computed control results in database
- Invalidate on relevant data changes
- Show "stale" indicator if cache expired

### Performance Targets
- Initial page load: < 3 seconds for 50 bills
- Control refresh: < 5 seconds for visible bills
- No blocking on user interactions

---

## Phase 4: Payment History & Audit Trail

### Problem
No visibility into historical payments. Cannot answer:
- What was paid last week?
- Who approved this payment?
- What was the control status when paid?
- What payments failed and why?

### Solution
Comprehensive payment history with audit capabilities:

**History View**
- Searchable/filterable payment history
- Filter by: date range, payee, company, amount, status, processor
- Sort by any column
- Export to CSV

**Audit Details**
- Full control check results at time of payment
- User who initiated payment
- Timestamps for all state changes
- Bill.com/Wise reference IDs and status
- Original bill details snapshot

**Dashboard Metrics**
- Payments by day/week/month
- Success/failure rates
- Average processing time
- Payments by processor (Bill.com vs Wise)

### Data Model
Extend `PaymentRecord` with:
- `initiatedBy` - user email
- `controlSnapshot` - full control results JSON
- `processorResponse` - raw API response
- `statusHistory` - array of status changes with timestamps

---

## Implementation Phases

| Phase | Feature | Priority | Complexity | Dependencies |
|-------|---------|----------|------------|--------------|
| 1 | Email Confirmations | High | Low | Postmark setup |
| 2 | Batch Payment UI | High | Medium | Phase 3 |
| 3 | Efficient Controls | High | High | None |
| 4 | Payment History | Medium | Medium | Phase 1 |

### Recommended Order
1. **Phase 3** (Controls) - Foundation for batch operations
2. **Phase 2** (Batch UI) - Depends on efficient controls
3. **Phase 1** (Email) - Independent, can parallel with Phase 2
4. **Phase 4** (History) - Builds on payment record improvements

---

## Success Criteria

### Phase 1
- [ ] Payees receive email within 60 seconds of payment
- [ ] Email includes all required payment details
- [ ] Delivery failures are logged and alertable

### Phase 2
- [ ] Can pay 10+ bills in single batch operation
- [ ] Batch processing completes in < 30 seconds
- [ ] Clear feedback on individual bill success/failure

### Phase 3
- [ ] Page load with controls < 3 seconds (50 bills)
- [ ] No UI blocking during control evaluation
- [ ] Stale cache clearly indicated

### Phase 4
- [ ] All payments searchable within 24 hours
- [ ] Full audit trail for compliance
- [ ] Export functionality for reporting

---

## Open Questions

1. Should email confirmations be opt-in per payee?
2. What's the maximum batch size for payments?
3. Should failed payments auto-retry?
4. How long to retain audit history?
5. Need approval workflow for batches over $X?

---

## Next Steps

1. Review and refine this vision doc
2. Run each phase through `ensemble:create-prd`
3. Create TRDs for approved phases
4. Prioritize based on business needs
