# PRD: Phase 1 - Payment Email Confirmations

> Fortium Payouts - Branded Email Notifications for Wise Payments
> Version: 1.1
> Created: 2026-01-06
> Status: Refined

---

## 1. Problem Statement

### 1.1 Current State

When Fortium Partners processes payments to Canadian partners and subcontractors through Wise, the payment flow creates a communication gap:

1. **User initiates payment** in Fortium Payouts UI
2. **Wise processes transfer** and sends its own generic notification to the recipient
3. **Recipient receives Wise notification** with no Fortium branding or context

This creates several problems:

| Issue | Impact | Frequency |
|-------|--------|-----------|
| No Fortium branding | Recipients don't connect payment to Fortium relationship | Every CA payment |
| Limited context | Wise notification lacks invoice/project details | Every CA payment |
| No Fortium contact info | Questions about payments go to Wise support | ~10% of payments |
| Uncertainty window | Recipients unsure if payment was initiated until Wise processes | Every CA payment |
| No audit trail | Fortium has no record of payment communication sent | Every CA payment |

### 1.3 Solution Approach

Payees will receive **two emails** for each payment:
1. **Fortium email** (via Postmark) - Sent immediately when payment is initiated, with Fortium branding, invoice details, and contact info
2. **Wise email** - Sent by Wise when funds are delivered to the recipient's account

This dual-notification approach provides immediate confirmation from Fortium while preserving Wise's delivery notification.

### 1.4 User Impact

**Payees (Partners/Subcontractors):**
- Receive generic Wise notification without Fortium context
- Cannot easily correlate payment to specific invoice
- No Fortium contact information for payment questions
- May not realize payment is in progress until Wise email arrives (can be delayed)

**Finance Operations (Fortium Staff):**
- Cannot confirm payees were notified of payment initiation
- No audit trail of payment communications
- Handle questions that could be answered by better notifications

### 1.5 Business Impact

- Professional image: Generic Wise emails don't reflect Fortium's brand
- Support burden: Payment questions directed to wrong channels
- Relationship friction: Partners feel disconnected from payment process

---

## 2. Goals and Non-Goals

### 2.1 Goals

| ID | Goal | Success Criteria | Priority |
|----|------|------------------|----------|
| G1 | Send branded payment confirmation to payees | Email sent within 60 seconds of Wise transfer funding | P0 |
| G2 | Include all relevant payment details | Amount, currency, expected delivery, invoice reference in every email | P0 |
| G3 | Provide Fortium contact information | Finance team contact in every email for payment questions | P0 |
| G4 | Track email delivery status | Delivery status stored in PaymentRecord for audit | P0 |
| G5 | Professional email templates | HTML template with Fortium branding and responsive design | P1 |
| G6 | Delivery failure alerting | Log warnings for delivery failures; alertable in observability stack | P1 |
| G7 | Email delivery retry | Automatic retry for transient failures | P2 |

### 2.2 Non-Goals (Out of Scope)

| Non-Goal | Rationale |
|----------|-----------|
| Bill.com payment emails | Bill.com has its own robust notification system |
| Internal staff notifications | Phase 2 scope - internal alerts for payment events |
| Email template self-service | Finance team doesn't need to edit templates frequently |
| Recipient email preferences | All payees receive notifications; no opt-out needed |
| Payment receipt attachments | Keep emails simple; receipts available in Wise |
| Multi-language support | All CA payees operate in English |
| Email scheduling | Emails sent immediately upon payment funding |
| Marketing/promotional content | Transactional emails only |

---

## 3. User Stories

### 3.1 Primary User: Partner/Subcontractor (Payee)

**US-1: Immediate Payment Confirmation**
> As a Fortium partner receiving payment,
> I want to receive an email when my payment is initiated,
> So that I know funds are on the way without waiting for Wise's notification.

**Acceptance Criteria:**
- Email arrives within 60 seconds of payment funding
- Email clearly identifies sender as Fortium Partners
- Email subject includes payment amount and "Payment Initiated"

**US-2: Payment Details in Email**
> As a Fortium partner receiving payment,
> I want to see the payment amount, currency, and invoice reference,
> So that I can match the payment to my records.

**Acceptance Criteria:**
- Payment amount displayed prominently (e.g., "CAD $5,000.00")
- Invoice/reference number included
- Expected delivery timeframe shown (from Wise quote)

**US-3: Fortium Contact Information**
> As a Fortium partner with a question about payment,
> I want Fortium contact information in the email,
> So that I can reach the right team if I have questions.

**Acceptance Criteria:**
- Finance team email address included
- Clear instruction: "Questions about this payment? Contact us at..."

### 3.2 Secondary User: Finance Operations Staff

**US-4: Email Delivery Audit**
> As a Finance Operations staff member,
> I want to see if the payment confirmation email was delivered,
> So that I can verify the payee was notified.

**Acceptance Criteria:**
- Email delivery status visible in payment record
- Timestamp of email send attempt stored
- Delivery failures clearly indicated

**US-5: Delivery Failure Awareness**
> As a Finance Operations staff member,
> I want to be alerted when payment emails fail to deliver,
> So that I can follow up with the payee directly.

**Acceptance Criteria:**
- Delivery failures logged with warning level
- Failed emails identifiable in system logs
- Payee name and email visible in failure logs

---

## 4. Functional Requirements

### 4.1 Email Trigger

**FR-4.1.1: Trigger on Successful Wise Funding**
- **Trigger**: After `wise.fundTransfer()` returns successfully
- **Condition**: Transfer status indicates successful funding (not cancelled/failed)
- **Timing**: Email sent immediately after funding confirmation
- **Location**: Within `POST /api/payments/pay/:billId` handler

**FR-4.1.2: Required Data for Email**
| Data Point | Source | Required |
|------------|--------|----------|
| Payee email | PartnerConnect API (`bill.email` or resource endpoint) | Yes |
| Payee name | `bill.resourceName` | Yes |
| Payment amount (CAD) | `bill.adjustedBillPayment` | Yes |
| Target amount | `quote.targetAmount` | Yes (if different currency) |
| Target currency | `WiseRecipient.targetCurrency` | Yes |
| Exchange rate | `quote.rate` | Yes (if currency conversion) |
| Invoice reference | `bill.externalInvoiceDocNum` or `bill.uid` | Yes |
| Expected delivery | `quote.paymentOptions[0].estimatedDelivery` | Yes |
| Transfer ID | `transfer.id` | Yes |

**FR-4.1.3: Skip Email Conditions**
- No valid payee email available from PartnerConnect API
- Email address format is invalid
- Transfer funding failed

### 4.2 Email Service Integration

**FR-4.2.1: Postmark Integration**
- **Service**: Postmark (existing Fortium account)
- **Authentication**: API token via environment variable `POSTMARK_API_TOKEN`
- **Sender**: Configurable via `POSTMARK_FROM_EMAIL` (default: `accounting@fortiumpartners.com`)
- **Sender Name**: "Fortium Partners"

**FR-4.2.2: Email Service Client**
Create new service: `backend/src/services/email.ts`
```typescript
interface SendPaymentEmailParams {
  to: string;
  payeeName: string;
  amountCAD: number;
  targetAmount?: number;
  targetCurrency: string;
  exchangeRate?: number;
  invoiceReference: string;
  expectedDelivery: string;
  transferId: number;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
}
```

**FR-4.2.3: Configuration**
| Env Variable | Description | Required |
|--------------|-------------|----------|
| `POSTMARK_API_TOKEN` | Postmark server API token | Yes |
| `POSTMARK_FROM_EMAIL` | Sender email address | No (default provided) |
| `FORTIUM_FINANCE_EMAIL` | Finance team contact email | No (default provided) |

### 4.3 Email Content

**FR-4.3.1: Email Subject Line**
Format: `Payment Initiated: {currency} ${amount} - Invoice {reference}`
Example: `Payment Initiated: CAD $5,000.00 - Invoice INV-2026-0042`

**FR-4.3.2: Email Body Content**
| Section | Content |
|---------|---------|
| Header | Fortium Partners logo, "Payment Confirmation" title |
| Greeting | "Hi {payeeName}," |
| Main message | "Your payment has been initiated and is being processed." |
| Payment details | Amount, currency, exchange rate (if applicable), invoice reference |
| Timing | Expected delivery date/timeframe |
| Reference | Wise transfer ID for tracking |
| Contact | Finance team email for questions |
| Footer | Fortium Partners address, unsubscribe note (transactional - no actual unsubscribe) |

**FR-4.3.3: Currency Display Rules**
- **Same currency (CAD to CAD)**: Show single amount
  - "Amount: CAD $5,000.00"
- **Currency conversion**: Show both amounts with rate
  - "Amount: CAD $5,000.00 (USD $3,750.00 at rate 0.7500)"

### 4.4 Delivery Tracking

**FR-4.4.1: PaymentRecord Email Fields**
Add to `PaymentRecord` model:
```prisma
emailSentAt       DateTime?  // Timestamp of successful send
emailMessageId    String?    // Postmark message ID
emailStatus       String?    // 'sent', 'delivered', 'failed', 'bounced'
emailError        String?    // Error message if failed
```

**FR-4.4.2: Update Payment Record on Send**
- On successful send: Set `emailSentAt`, `emailMessageId`, `emailStatus = 'sent'`
- On send failure: Set `emailStatus = 'failed'`, `emailError = error message`

**FR-4.4.3: Postmark Webhooks (Future Enhancement)**
- Track delivery, bounce, and spam complaint events
- Update `emailStatus` based on webhook events
- Out of scope for Phase 1 initial release

### 4.5 Error Handling

**FR-4.5.1: Email Failure Does Not Block Payment**
- Payment is already complete when email is sent
- Email failure should log error but not affect payment success response
- Payment record still created with email failure status

**FR-4.5.2: Retry Logic**
- Single retry with 2-second delay on transient failures (network timeout, 5xx)
- No retry on permanent failures (invalid email, 4xx errors)
- Log all attempts

**FR-4.5.3: Logging Requirements**
| Event | Log Level | Included Data |
|-------|-----------|---------------|
| Email sent | INFO | transferId, recipient email, messageId |
| Email failed | WARN | transferId, recipient email, error message |
| Retry attempt | INFO | transferId, attempt number |
| Invalid email skipped | INFO | transferId, reason |

---

## 5. Technical Requirements

### 5.1 Dependencies

| Dependency | Version | Purpose |
|------------|---------|---------|
| `postmark` | ^4.0.0 | Postmark Node.js SDK |
| (existing) | - | Fastify, Prisma, Zod |

### 5.2 Database Migration

**Migration: Add email tracking fields to PaymentRecord**
```sql
ALTER TABLE payment_records
ADD COLUMN email_sent_at TIMESTAMP,
ADD COLUMN email_message_id VARCHAR(255),
ADD COLUMN email_status VARCHAR(50),
ADD COLUMN email_error TEXT;
```

### 5.3 New Files

| File | Purpose |
|------|---------|
| `backend/src/services/email.ts` | Email service client (Postmark integration) |
| `backend/src/templates/payment-confirmation.ts` | HTML email template |
| `backend/src/lib/email-templates.ts` | Template rendering utilities |

### 5.4 Modified Files

| File | Changes |
|------|---------|
| `backend/src/routes/payments.ts` | Add email send after Wise funding success |
| `backend/prisma/schema.prisma` | Add email fields to PaymentRecord |
| `backend/src/lib/config.ts` | Add Postmark config variables |

### 5.5 Configuration

Add to `backend/src/lib/config.ts`:
```typescript
// Email (Postmark)
POSTMARK_API_TOKEN: process.env.POSTMARK_API_TOKEN || '',
POSTMARK_FROM_EMAIL: process.env.POSTMARK_FROM_EMAIL || 'accounting@fortiumpartners.com',
FORTIUM_FINANCE_EMAIL: process.env.FORTIUM_FINANCE_EMAIL || 'accounting@fortiumpartners.com',
```

### 5.6 Performance Requirements

| Metric | Target |
|--------|--------|
| Email send latency | < 2 seconds (Postmark API call) |
| Total payment latency increase | < 3 seconds |
| Email service availability | 99.9% (Postmark SLA) |

### 5.7 Security Requirements

| Requirement | Implementation |
|-------------|----------------|
| API token security | Token in environment variable, never in code |
| No sensitive data in logs | Log email address, not full payment details |
| Email content security | No sensitive financial data beyond payment amount |

---

## 6. Email Template Specification

### 6.1 HTML Template Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <!-- Header with logo -->
  <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #0066cc;">
    <img src="[FORTIUM_LOGO_URL]" alt="Fortium Partners" style="max-width: 200px;">
    <h1 style="color: #0066cc; margin: 10px 0;">Payment Confirmation</h1>
  </div>

  <!-- Main content -->
  <div style="padding: 30px 0;">
    <p>Hi {{payeeName}},</p>

    <p>Great news! Your payment has been initiated and is being processed through Wise.</p>

    <!-- Payment details box -->
    <div style="background: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h2 style="margin-top: 0; color: #333;">Payment Details</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666;">Amount:</td>
          <td style="padding: 8px 0; font-weight: bold; text-align: right;">{{amountDisplay}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Invoice Reference:</td>
          <td style="padding: 8px 0; text-align: right;">{{invoiceReference}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Expected Delivery:</td>
          <td style="padding: 8px 0; text-align: right;">{{expectedDelivery}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;">Reference ID:</td>
          <td style="padding: 8px 0; text-align: right; font-size: 12px;">{{transferId}}</td>
        </tr>
      </table>
    </div>

    <p>You'll receive another notification from Wise when the funds arrive in your account.</p>

    <p style="color: #666; font-size: 14px;">
      Questions about this payment? Contact our finance team at
      <a href="mailto:{{financeEmail}}" style="color: #0066cc;">{{financeEmail}}</a>
    </p>
  </div>

  <!-- Footer -->
  <div style="border-top: 1px solid #ddd; padding-top: 20px; text-align: center; color: #999; font-size: 12px;">
    <p>Fortium Partners<br>
    123 Business Street, Suite 100<br>
    City, Province A1B 2C3</p>
    <p>This is a transactional email regarding your payment.</p>
  </div>
</body>
</html>
```

### 6.2 Plain Text Version

```text
PAYMENT CONFIRMATION
Fortium Partners

Hi {{payeeName}},

Great news! Your payment has been initiated and is being processed through Wise.

PAYMENT DETAILS
---------------
Amount: {{amountDisplay}}
Invoice Reference: {{invoiceReference}}
Expected Delivery: {{expectedDelivery}}
Reference ID: {{transferId}}

You'll receive another notification from Wise when the funds arrive in your account.

Questions about this payment? Contact our finance team at {{financeEmail}}

---
Fortium Partners
123 Business Street, Suite 100
City, Province A1B 2C3

This is a transactional email regarding your payment.
```

### 6.3 Template Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `{{payeeName}}` | Recipient's display name | "John Smith" |
| `{{amountDisplay}}` | Formatted amount with currency | "CAD $5,000.00" or "CAD $5,000.00 (USD $3,750.00)" |
| `{{invoiceReference}}` | Invoice number or bill ID | "INV-2026-0042" |
| `{{expectedDelivery}}` | Human-readable delivery estimate | "Within 1-2 business days" |
| `{{transferId}}` | Wise transfer ID | "123456789" |
| `{{financeEmail}}` | Finance team contact email | "finance@fortiumpartners.com" |

### 6.4 Amount Display Logic

```typescript
function formatAmountDisplay(
  amountCAD: number,
  targetAmount: number | undefined,
  targetCurrency: string,
  exchangeRate: number | undefined
): string {
  const cadFormatted = `CAD $${amountCAD.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;

  if (targetCurrency === 'CAD' || !targetAmount || !exchangeRate) {
    return cadFormatted;
  }

  const targetFormatted = `${targetCurrency} $${targetAmount.toLocaleString('en-CA', { minimumFractionDigits: 2 })}`;
  return `${cadFormatted} (${targetFormatted} at rate ${exchangeRate.toFixed(4)})`;
}
```

### 6.5 Delivery Estimate Formatting

```typescript
function formatDeliveryEstimate(estimatedDelivery: string): string {
  const deliveryDate = new Date(estimatedDelivery);
  const now = new Date();
  const diffDays = Math.ceil((deliveryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) {
    return 'Today or next business day';
  } else if (diffDays === 1) {
    return 'Within 1 business day';
  } else if (diffDays <= 3) {
    return `Within ${diffDays} business days`;
  } else {
    return deliveryDate.toLocaleDateString('en-CA', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    });
  }
}
```

---

## 7. Success Metrics

### 7.1 Primary Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email delivery rate | > 99% | Postmark delivery stats |
| Email send latency | < 60 seconds post-funding | Timestamp comparison: `emailSentAt` - `paidAt` |
| Bounce rate | < 2% | Postmark bounce tracking |

### 7.2 Operational Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email send success rate | > 99.5% | `emailStatus = 'sent'` / total CA payments |
| Mean time to email | < 5 seconds | Average `emailSentAt` - `paidAt` |
| Email retry rate | < 1% | Retry log count / total emails |
| Support tickets about CA payments | 50% reduction | Support ticket tracking (baseline needed) |

### 7.3 Quality Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Email open rate | > 60% | Postmark tracking (Phase 2) |
| Spam complaint rate | < 0.01% | Postmark complaint tracking |
| Payee satisfaction | Positive feedback | Qualitative feedback from partners |

---

## 8. Dependencies and Risks

### 8.1 External Dependencies

| Dependency | Type | Risk Level | Mitigation |
|------------|------|------------|------------|
| Postmark API | Service | Low | Established service, 99.99% uptime SLA |
| Postmark account | Access | Low | Existing Fortium account |
| Wise quote data | Data | Low | Already available in payment flow |
| Valid payee emails | Data | Medium | Validate WiseRecipient.wiseEmail on entry |

### 8.2 Internal Dependencies

| Dependency | Type | Status | Impact |
|------------|------|--------|--------|
| WiseRecipient.wiseEmail populated | Data | Partially complete | Some recipients may lack email |
| PaymentRecord model | Schema | Exists | Need migration for email fields |
| Wise payment flow | Code | Complete | Integration point exists |

### 8.3 Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Invalid/missing payee emails | Medium | Medium | Log warning, skip email, don't block payment |
| Postmark rate limiting | Low | Low | Current volume well under limits (100/sec) |
| Email marked as spam | Low | Medium | Use verified domain, proper headers, transactional message stream |
| Email template rendering errors | Low | Low | Fallback to plain text, comprehensive testing |
| Duplicate emails on retry | Low | Medium | Check emailSentAt before retry attempt |

### 8.4 Data Quality Concerns

**Payee email from PartnerConnect API:**
- Email availability depends on PartnerConnect data quality
- Some payee records may lack email addresses
- Email validation needed before send

**Mitigation:**
- Check for valid email format before sending
- Log skipped emails for review
- Consider adding email to WiseRecipient as fallback (future enhancement)

---

## 9. Implementation Plan

### 9.1 Phase 1.1: Infrastructure (Day 1)

1. Add Postmark dependency to package.json
2. Create config variables for Postmark
3. Create database migration for email fields
4. Create email service client skeleton

### 9.2 Phase 1.2: Email Service (Day 1-2)

1. Implement Postmark client integration
2. Create email template (HTML + plain text)
3. Implement template rendering with variables
4. Add unit tests for email service

### 9.3 Phase 1.3: Payment Integration (Day 2)

1. Add email send call after Wise funding success
2. Update PaymentRecord with email status
3. Add error handling (non-blocking)
4. Add logging for email events

### 9.4 Phase 1.4: Testing & Deployment (Day 3)

1. Test email flow in Postmark sandbox
2. Test with real Wise payments (staging)
3. Verify email rendering across clients
4. Deploy to production
5. Monitor first batch of emails

### 9.5 Rollout Strategy

1. **Sandbox Testing**: Test with Postmark sandbox, mock payments
2. **Internal Testing**: Send test emails to Fortium team
3. **Limited Production**: Enable for 10% of CA payments
4. **Full Production**: Enable for all CA payments after 24-hour validation

---

## 10. Open Questions

| # | Question | Owner | Decision |
|---|----------|-------|----------|
| 1 | Postmark message stream to use? | Eng | Use "outbound" transactional stream |
| 2 | Fortium logo URL for email? | Marketing | TBD - need hosted logo URL |
| 3 | ~~Finance team reply-to email?~~ | Finance | ✅ accounting@fortiumpartners.com |
| 4 | Should email include project name? | Product | Not in Phase 1 (data not readily available) |
| 5 | Footer address - which office? | Legal | TBD - need official business address |
| 6 | ~~Sender email address?~~ | Product | ✅ accounting@fortiumpartners.com |
| 7 | ~~Payee email source?~~ | Eng | ✅ PartnerConnect API |
| 8 | ~~Single or dual emails with Wise?~~ | Product | ✅ Both - Fortium + Wise notifications |

---

## 11. Acceptance Criteria Summary

### 11.1 Must Have (P0)

- [ ] Email sent within 60 seconds of successful Wise transfer funding
- [ ] Email includes: payee name, amount (with currency conversion if applicable), invoice reference, expected delivery
- [ ] Email includes Fortium contact information
- [ ] Email delivery status stored in PaymentRecord
- [ ] Email failure does not block payment completion
- [ ] Delivery failures logged at WARN level

### 11.2 Should Have (P1)

- [ ] Professional HTML template with Fortium branding
- [ ] Plain text fallback version
- [ ] Automatic single retry on transient failures
- [ ] Skip invalid/placeholder emails gracefully

### 11.3 Nice to Have (P2)

- [ ] Postmark webhooks for delivery tracking (future)
- [ ] Email open tracking (future)
- [ ] Template customization by tenant (future)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-06 | Product Management | Initial draft |
| 1.1 | 2026-01-06 | Product Management | Refined: dual-email approach, sender=accounting@, email source=PartnerConnect API |
