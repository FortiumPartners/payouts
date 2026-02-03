# Payment History Feature - Product Requirements Document

**Author:** Burke Autrey
**Date:** 2026-01-23
**Status:** Draft
**Version:** 1.0

---

## 1. Overview

### 1.1 Problem Statement

Fortium Partners needs visibility into historical engagement-related payments across both US (Bill.com) and CA (Wise) payment rails. Currently, verifying whether a contractor was paid for a specific engagement requires logging into multiple systems (PartnerConnect, QuickBooks, Bill.com, Wise).

### 1.2 Solution

A dedicated Payment History page in Fortium Payouts that displays all engagement-related payments with comprehensive filtering capabilities, using PartnerConnect as the data source.

### 1.3 Goals

1. **Audit/Compliance:** Finance can verify payments and reconcile with external systems
2. **Operations:** Quickly check if a contractor/partner was paid for a specific engagement
3. **Reporting:** View payment summaries by time period, payee, or client

### 1.4 Non-Goals (v1)

- Export to CSV/PDF (view only for now)
- Direct Bill.com/Wise API queries (use PartnerConnect as proxy)
- PartnerConnect ↔ QBO sync process (separate concern)
- Editing or modifying payment records

---

## 2. User Stories

### 2.1 Primary Users

- **Finance Team:** Needs to audit and reconcile payments
- **Operations Team:** Needs to verify payment status for contractors

### 2.2 User Stories

| ID | As a... | I want to... | So that... |
|----|---------|--------------|------------|
| US-1 | Finance user | View all historical engagement payments | I can audit and reconcile payments |
| US-2 | Finance user | Filter payments by date range | I can focus on a specific period |
| US-3 | Finance user | Filter payments by payee | I can see all payments to a specific contractor |
| US-4 | Finance user | Filter payments by client | I can see all payments related to a client engagement |
| US-5 | Operations user | Search for a specific payment | I can quickly answer "was X paid?" |
| US-6 | Operations user | See payment details on demand | I can investigate without leaving the app |

---

## 3. Functional Requirements

### 3.1 Payment History Page

**Location:** New menu item "Payment History" in main navigation

**Data Display (Basic View):**
- Payment date
- Payee name
- Amount
- Status (Paid, Pending, etc.)

**Data Display (Expanded/Detail View - Lazy Loaded):**
- Client/Engagement name
- Payment method (Bill.com / Wise / Payouts)
- Reference number
- Invoice number
- Bill number (QBO doc number)
- PartnerConnect bill ID (link to PC if available)

### 3.2 Filters

All filters should work in combination:

| Filter | Type | Description |
|--------|------|-------------|
| Date Range | Date picker | Start and end date for payment date |
| Payee | Multi-select dropdown | Filter by contractor/partner name |
| Client | Multi-select dropdown | Filter by client/engagement |
| Tenant | Single-select | US, CA, or All |
| Payment Method | Multi-select | Bill.com, Wise, Payouts |
| Amount Range | Number inputs | Min and max amount |
| Status | Multi-select | Paid, Pending, Failed |

### 3.3 Data Source

- **Primary Source:** PartnerConnect API
- **Endpoint:** `/api/bills/explorers` (with modifications if needed)
- **Filter Criteria:** Bills with `paidDate` set or `ProcessCode = 'Paid'`
- **Engagement Identification:** Bill exists in PartnerConnect = engagement-related

### 3.4 Data Freshness

- Real-time queries to PartnerConnect on page load
- No local caching (always fresh data)
- Loading states while data fetches

### 3.5 Historical Scope

- Target: All time (all historical payments)
- Fallback: If API limits exist, start with 2025 forward, add prior years incrementally

---

## 4. Technical Requirements

### 4.1 Frontend

**Framework:** React 18 with TypeScript (existing)

**UI Library:** PrimeReact
- Adopt as app-wide standard going forward
- Key components: DataTable, Calendar, MultiSelect, Dropdown
- Use PrimeReact theming (migrate from pure Tailwind)

**Key Components:**
- `PaymentHistoryPage` - Main page component
- `PaymentFilters` - Filter panel using PrimeReact components
- `PaymentTable` - DataTable with expandable rows
- `PaymentDetail` - Expanded row content (lazy loaded)

### 4.2 Backend

**New Endpoint:** `GET /api/payments/history`

**Query Parameters:**
- `startDate`, `endDate` - Date range filter
- `payeeIds` - Comma-separated payee identifiers
- `clientIds` - Comma-separated client identifiers
- `tenant` - US, CA, or all
- `paymentMethod` - bill_com, wise, payouts
- `minAmount`, `maxAmount` - Amount range
- `status` - paid, pending, failed
- `page`, `pageSize` - Pagination

**Response:**
```json
{
  "payments": [
    {
      "id": "string",
      "pcBillId": "string",
      "paidDate": "ISO date",
      "payeeName": "string",
      "payeeId": "string",
      "amount": 0.00,
      "currency": "USD|CAD",
      "status": "paid|pending|failed",
      "clientName": "string",
      "tenantCode": "US|CA"
    }
  ],
  "total": 0,
  "page": 1,
  "pageSize": 50,
  "filters": {
    "payees": [{"id": "string", "name": "string"}],
    "clients": [{"id": "string", "name": "string"}]
  }
}
```

**Detail Endpoint:** `GET /api/payments/history/:id`

Returns full payment details including invoice number, bill number, reference number, etc.

### 4.3 PartnerConnect Integration

Extend existing `PartnerConnectClient` to support:
- Querying paid bills (not just payable bills)
- Filtering by date range
- Pagination for large result sets

---

## 5. UI/UX Requirements

### 5.1 Page Layout

```
+----------------------------------------------------------+
|  Payment History                              [Filters ▼] |
+----------------------------------------------------------+
| Date Range: [Jan 1] - [Jan 31]  Payee: [All ▼]           |
| Client: [All ▼]  Tenant: [All ▼]  Method: [All ▼]        |
| Amount: [$___] - [$___]  Status: [All ▼]    [Clear] [Apply]|
+----------------------------------------------------------+
| Date       | Payee              | Amount    | Status      |
|------------|--------------------|-----------| ------------|
| 2026-01-23 | Robert A. Halford  | $2,406.99 | ✓ Paid      |
|   ↳ [Expanded detail row with lazy-loaded info]          |
| 2026-01-06 | Robert A. Halford  | $7,144.20 | ✓ Paid      |
| 2026-01-02 | Yanic Croteau      | $11,639.00| ✓ Paid      |
+----------------------------------------------------------+
| Showing 1-50 of 247 payments            [< 1 2 3 4 5 >]  |
+----------------------------------------------------------+
```

### 5.2 Interaction Patterns

- **Row Expansion:** Click row to expand/collapse detail view
- **Lazy Loading:** Detail data fetched on expand, not upfront
- **Filter Apply:** Filters apply on button click (not auto-apply)
- **Clear Filters:** Single button to reset all filters
- **Pagination:** Server-side pagination with page size selector

### 5.3 Loading States

- Skeleton loading for table while fetching
- Spinner in expanded row while loading details
- Disabled filters during load

### 5.4 Error Handling

- Show partial data if available (e.g., local Payouts records)
- Clear error message if PartnerConnect unavailable
- Retry button for failed requests

---

## 6. Migration: PrimeReact Adoption

### 6.1 Scope

- Add PrimeReact to frontend dependencies
- Use PrimeReact for Payment History page (new)
- Gradually migrate existing pages (bills list, etc.) in future iterations

### 6.2 Theming

- Use PrimeReact Tailwind preset for consistency
- Or adopt a PrimeReact theme that matches current look

### 6.3 Components to Use

| Component | Use Case |
|-----------|----------|
| DataTable | Payment history table with sorting, pagination, expansion |
| Calendar | Date range picker |
| MultiSelect | Payee, client, method, status filters |
| Dropdown | Tenant filter |
| InputNumber | Amount range inputs |
| Button | Apply, Clear, Retry actions |
| Skeleton | Loading states |
| Message | Error display |

---

## 7. Success Metrics

| Metric | Target |
|--------|--------|
| Time to verify a payment | < 30 seconds |
| Page load time | < 2 seconds |
| Filter response time | < 1 second |
| User satisfaction | Finance team can answer payment questions without other systems |

---

## 8. Future Considerations (Post-v1)

- CSV/PDF export functionality
- Direct Bill.com/Wise API integration for real-time payment status
- PartnerConnect ↔ QBO sync process
- Payment analytics dashboard
- Saved filter presets

---

## 9. Open Questions

1. ~~How far back does PartnerConnect retain paid bill data?~~ → Start with all available, paginate
2. ~~What's the best PrimeReact theme to match current styling?~~ → Evaluate during implementation
3. Should we show payments made outside Payouts differently? → Yes, show payment method column

---

## 10. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Product Owner | | | |
| Tech Lead | | | |
| Finance Stakeholder | | | |
