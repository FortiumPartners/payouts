# TRD: Phase 1 - Payment Email Confirmations

> Technical Requirements Document
> PRD Reference: `docs/PRD/phase-1-email-confirmations.md`
> Version: 1.0
> Created: 2026-01-06
> Status: Ready for Implementation

---

## Executive Summary

Implement branded email notifications sent via Postmark when Wise payments are funded. Emails are sent from `accounting@fortiumpartners.com` with payment details sourced from the payment flow and payee email from PartnerConnect API.

**Key Decisions:**
- Dual notification: Fortium email (immediate) + Wise email (on delivery)
- Sender: `accounting@fortiumpartners.com`
- Payee email source: PartnerConnect API (embedded in bill response as `Resource.PrimaryEmail`)
- Content: Standard (amount, date, invoice, expected delivery, contact info)
- Rollout: 100% of CA (Wise) payments from day 1 - no feature flag

**Assets:**
- Fortium Logo: `https://www.fortiumpartners.com/hubfs/raw_assets/public/FortiumPartners_2022/images/5f43cb31a09dd4e4d62b0a20_logo.svg`

---

## Master Task List

| ID | Task | Status | Estimate | Dependencies | Sprint |
|----|------|--------|----------|--------------|--------|
| T1 | Add Postmark dependency and config | ☐ Pending | 15m | None | 1 |
| T2 | Create Prisma migration for email fields | ☐ Pending | 15m | None | 1 |
| T3 | Create email service client | ☐ Pending | 1h | T1 | 1 |
| T4 | Create HTML email template | ☐ Pending | 45m | None | 1 |
| T5 | Update PCBill type to include payee email from Resource | ☐ Pending | 15m | None | 1 |
| T6 | Integrate email send into payment flow | ☐ Pending | 1h | T2, T3, T4, T5 | 2 |
| T7 | Add logging and error handling | ☐ Pending | 30m | T6 | 2 |
| T8 | Write unit tests for email service | ☐ Pending | 45m | T3 | 2 |
| T9 | Manual end-to-end testing | ☐ Pending | 30m | T6, T7 | 2 |
| T10 | Deploy and monitor | ☐ Pending | 30m | T9 | 2 |

**Total Estimate:** ~6 hours

---

## System Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Payment Flow                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  POST /api/payments/pay/:billId                                     │
│         │                                                            │
│         ▼                                                            │
│  ┌───────────────────────────────────────────┐                      │
│  │ PartnerConnect getBill()                  │                      │
│  │ (includes embedded Resource.PrimaryEmail) │                      │
│  └───────────────────────────────────────────┘                      │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────┐                                                │
│  │  Wise Payment   │                                                │
│  │  (quote/fund)   │                                                │
│  └─────────────────┘                                                │
│         │                                                            │
│         ▼                                                            │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    Email Service                            │    │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │    │
│  │  │ Template    │  │ Postmark    │  │ PaymentRecord       │ │    │
│  │  │ Renderer    │─▶│ API Client  │─▶│ (email status)      │ │    │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘ │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

1. Payment initiated → PartnerConnect `getBill()` returns bill data with embedded Resource
2. Extract payee email from `bill.Resource.PrimaryEmail`
3. Wise quote/transfer/fund completes
4. Email service sends confirmation via Postmark
5. PaymentRecord updated with email status

---

## Detailed Technical Specifications

### T1: Add Postmark Dependency and Config

**File:** `backend/package.json`

```json
{
  "dependencies": {
    "postmark": "^4.0.5"
  }
}
```

**File:** `backend/src/lib/config.ts`

Add to envSchema:
```typescript
// Email (Postmark)
POSTMARK_API_TOKEN: z.string().optional(),
POSTMARK_FROM_EMAIL: z.string().default('accounting@fortiumpartners.com'),
POSTMARK_FROM_NAME: z.string().default('Fortium Partners'),
FORTIUM_FINANCE_EMAIL: z.string().default('accounting@fortiumpartners.com'),
```

---

### T2: Prisma Migration for Email Fields

**File:** `backend/prisma/schema.prisma`

Add to PaymentRecord model:
```prisma
model PaymentRecord {
  // ... existing fields ...

  // Email tracking
  emailSentAt     DateTime?  // Timestamp of successful send
  emailMessageId  String?    // Postmark message ID
  emailStatus     String?    // 'sent', 'delivered', 'failed', 'bounced', 'skipped'
  emailError      String?    // Error message if failed
  payeeEmail      String?    // Email address used for notification
}
```

**Migration command:**
```bash
npx prisma migrate dev --name add_email_tracking_fields
```

---

### T3: Create Email Service Client

**File:** `backend/src/services/email.ts`

```typescript
/**
 * Email service using Postmark for transactional emails.
 * Used for payment confirmation notifications.
 */

import { ServerClient } from 'postmark';
import { config } from '../lib/config.js';

// Types
export interface SendPaymentEmailParams {
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

export interface EmailResult {
  success: boolean;
  messageId?: string;
  errorMessage?: string;
}

// Error types
export class EmailError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'EmailError';
  }
}

/**
 * Email service client with Postmark integration.
 */
export class EmailService {
  private client: ServerClient | null = null;
  private fromEmail: string;
  private fromName: string;
  private financeEmail: string;

  constructor() {
    this.fromEmail = config.POSTMARK_FROM_EMAIL || 'accounting@fortiumpartners.com';
    this.fromName = config.POSTMARK_FROM_NAME || 'Fortium Partners';
    this.financeEmail = config.FORTIUM_FINANCE_EMAIL || 'accounting@fortiumpartners.com';

    if (config.POSTMARK_API_TOKEN) {
      this.client = new ServerClient(config.POSTMARK_API_TOKEN);
    }
  }

  /**
   * Check if email service is configured.
   */
  isConfigured(): boolean {
    return !!this.client;
  }

  /**
   * Validate email address format.
   */
  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Format amount display with optional currency conversion.
   */
  private formatAmountDisplay(
    amountCAD: number,
    targetAmount: number | undefined,
    targetCurrency: string,
    exchangeRate: number | undefined
  ): string {
    const cadFormatted = `CAD $${amountCAD.toLocaleString('en-CA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;

    if (targetCurrency === 'CAD' || !targetAmount || !exchangeRate || exchangeRate === 1) {
      return cadFormatted;
    }

    const targetFormatted = `${targetCurrency} $${targetAmount.toLocaleString('en-CA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })}`;
    return `${cadFormatted} (${targetFormatted} at rate ${exchangeRate.toFixed(4)})`;
  }

  /**
   * Format delivery estimate for display.
   */
  private formatDeliveryEstimate(estimatedDelivery: string): string {
    try {
      const deliveryDate = new Date(estimatedDelivery);
      const now = new Date();
      const diffMs = deliveryDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

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
    } catch {
      return 'Within 1-3 business days';
    }
  }

  /**
   * Send payment confirmation email.
   */
  async sendPaymentConfirmation(params: SendPaymentEmailParams): Promise<EmailResult> {
    // Validate email service is configured
    if (!this.client) {
      console.log('[Email] Postmark not configured, skipping email');
      return {
        success: false,
        errorMessage: 'Email service not configured (POSTMARK_API_TOKEN not set)',
      };
    }

    // Validate email address
    if (!this.isValidEmail(params.to)) {
      console.log(`[Email] Invalid email address: ${params.to}`);
      return {
        success: false,
        errorMessage: `Invalid email address: ${params.to}`,
      };
    }

    const amountDisplay = this.formatAmountDisplay(
      params.amountCAD,
      params.targetAmount,
      params.targetCurrency,
      params.exchangeRate
    );
    const deliveryEstimate = this.formatDeliveryEstimate(params.expectedDelivery);

    const subject = `Payment Initiated: ${params.targetCurrency} $${(params.targetAmount || params.amountCAD).toLocaleString('en-CA', { minimumFractionDigits: 2 })} - Invoice ${params.invoiceReference}`;

    // Import template
    const { renderPaymentConfirmationHtml, renderPaymentConfirmationText } = await import('../templates/payment-confirmation.js');

    const htmlBody = renderPaymentConfirmationHtml({
      payeeName: params.payeeName,
      amountDisplay,
      invoiceReference: params.invoiceReference,
      expectedDelivery: deliveryEstimate,
      transferId: String(params.transferId),
      financeEmail: this.financeEmail,
    });

    const textBody = renderPaymentConfirmationText({
      payeeName: params.payeeName,
      amountDisplay,
      invoiceReference: params.invoiceReference,
      expectedDelivery: deliveryEstimate,
      transferId: String(params.transferId),
      financeEmail: this.financeEmail,
    });

    try {
      console.log(`[Email] Sending payment confirmation to ${params.to}`);

      const result = await this.client.sendEmail({
        From: `${this.fromName} <${this.fromEmail}>`,
        To: params.to,
        Subject: subject,
        HtmlBody: htmlBody,
        TextBody: textBody,
        MessageStream: 'outbound', // Transactional stream
      });

      console.log(`[Email] Sent successfully: ${result.MessageID}`);
      return {
        success: true,
        messageId: result.MessageID,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error(`[Email] Failed to send: ${errorMessage}`);

      // Single retry for transient errors
      if (errorMessage.includes('timeout') || errorMessage.includes('ECONNRESET')) {
        console.log('[Email] Retrying after transient error...');
        await new Promise(resolve => setTimeout(resolve, 2000));

        try {
          const retryResult = await this.client.sendEmail({
            From: `${this.fromName} <${this.fromEmail}>`,
            To: params.to,
            Subject: subject,
            HtmlBody: htmlBody,
            TextBody: textBody,
            MessageStream: 'outbound',
          });

          console.log(`[Email] Retry successful: ${retryResult.MessageID}`);
          return {
            success: true,
            messageId: retryResult.MessageID,
          };
        } catch (retryErr) {
          const retryErrorMessage = retryErr instanceof Error ? retryErr.message : String(retryErr);
          console.error(`[Email] Retry failed: ${retryErrorMessage}`);
          return {
            success: false,
            errorMessage: retryErrorMessage,
          };
        }
      }

      return {
        success: false,
        errorMessage,
      };
    }
  }
}

// Singleton instance
let emailService: EmailService | null = null;

export function getEmailService(): EmailService {
  if (!emailService) {
    emailService = new EmailService();
  }
  return emailService;
}
```

---

### T4: Create HTML Email Template

**File:** `backend/src/templates/payment-confirmation.ts`

```typescript
/**
 * Payment confirmation email templates.
 * HTML and plain text versions.
 */

export interface PaymentEmailData {
  payeeName: string;
  amountDisplay: string;
  invoiceReference: string;
  expectedDelivery: string;
  transferId: string;
  financeEmail: string;
}

/**
 * Render HTML email template.
 */
export function renderPaymentConfirmationHtml(data: PaymentEmailData): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Confirmation</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
  <div style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background-color: #0066cc; padding: 30px; text-align: center;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Confirmation</h1>
      <p style="color: #cce0ff; margin: 10px 0 0 0; font-size: 14px;">Fortium Partners</p>
    </div>

    <!-- Main content -->
    <div style="padding: 30px;">
      <p style="margin-top: 0;">Hi ${escapeHtml(data.payeeName)},</p>

      <p>Great news! Your payment has been initiated and is being processed through Wise.</p>

      <!-- Payment details box -->
      <div style="background: #f5f8fa; border-radius: 8px; padding: 20px; margin: 25px 0; border-left: 4px solid #0066cc;">
        <h2 style="margin-top: 0; color: #333; font-size: 18px;">Payment Details</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e5e5;">Amount:</td>
            <td style="padding: 10px 0; font-weight: bold; text-align: right; border-bottom: 1px solid #e5e5e5;">${escapeHtml(data.amountDisplay)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e5e5;">Invoice Reference:</td>
            <td style="padding: 10px 0; text-align: right; border-bottom: 1px solid #e5e5e5;">${escapeHtml(data.invoiceReference)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #666; border-bottom: 1px solid #e5e5e5;">Expected Delivery:</td>
            <td style="padding: 10px 0; text-align: right; border-bottom: 1px solid #e5e5e5;">${escapeHtml(data.expectedDelivery)}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; color: #666;">Reference ID:</td>
            <td style="padding: 10px 0; text-align: right; font-size: 12px; color: #888;">${escapeHtml(data.transferId)}</td>
          </tr>
        </table>
      </div>

      <p>You'll receive another notification from Wise when the funds arrive in your account.</p>

      <p style="color: #666; font-size: 14px; margin-bottom: 0;">
        Questions about this payment? Contact our team at
        <a href="mailto:${escapeHtml(data.financeEmail)}" style="color: #0066cc; text-decoration: none;">${escapeHtml(data.financeEmail)}</a>
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f5f5f5; padding: 20px; text-align: center; border-top: 1px solid #e5e5e5;">
      <p style="margin: 0; color: #999; font-size: 12px;">
        Fortium Partners<br>
        This is a transactional email regarding your payment.
      </p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Render plain text email template.
 */
export function renderPaymentConfirmationText(data: PaymentEmailData): string {
  return `PAYMENT CONFIRMATION
Fortium Partners

Hi ${data.payeeName},

Great news! Your payment has been initiated and is being processed through Wise.

PAYMENT DETAILS
---------------
Amount: ${data.amountDisplay}
Invoice Reference: ${data.invoiceReference}
Expected Delivery: ${data.expectedDelivery}
Reference ID: ${data.transferId}

You'll receive another notification from Wise when the funds arrive in your account.

Questions about this payment? Contact our team at ${data.financeEmail}

---
Fortium Partners
This is a transactional email regarding your payment.
`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
```

---

### T5: Update PCBill Type to Include Payee Email from Resource

**File:** `backend/src/services/partnerconnect.ts`

The single bill response from PartnerConnect (`GET /api/bills/:uid`) includes an embedded `Resource` object with `PrimaryEmail`. No separate API call is needed.

> **API Reference:** See [PartnerConnect API Structure](#partnerconnect-api-reference) section below for verified response format.

```typescript
// Add to PCBill interface
export interface PCBill {
  // ... existing fields ...
  payeeEmail?: string;  // Payee's email address from Resource.PrimaryEmail
}

// Update mapBill() to extract email from embedded Resource
private mapBill(data: any): PCBill {
  return {
    // ... existing field mappings ...
    payeeEmail: data.Resource?.PrimaryEmail || undefined,
  };
}
```

**Note:** The bill list response (`GET /api/bills/explorers`) does NOT include Resource details - only the single bill endpoint does. This is fine because we fetch the bill by UID before payment anyway.

---

### T6: Integrate Email Send into Payment Flow

**File:** `backend/src/routes/payments.ts`

Add email sending after successful Wise transfer funding:

```typescript
// Add import at top
import { getEmailService } from '../services/email.js';

// In POST /api/payments/pay/:billId handler, after Wise funding success:

// After: const fundResult = await wise.fundTransfer(transfer.id);
// Before: Create payment record

// Send payment confirmation email
const emailService = getEmailService();
let emailResult = { success: false, messageId: undefined as string | undefined, errorMessage: 'Not attempted' };

// Get payee email from PartnerConnect (already fetched via getBill)
const payeeEmail = bill.payeeEmail;

if (payeeEmail && emailService.isConfigured()) {
  emailResult = await emailService.sendPaymentConfirmation({
    to: payeeEmail,
    payeeName: bill.resourceName,
    amountCAD: bill.adjustedBillPayment,
    targetAmount: quote.targetAmount,
    targetCurrency: recipient.targetCurrency,
    exchangeRate: quote.rate,
    invoiceReference: bill.externalInvoiceDocNum || bill.uid,
    expectedDelivery: quote.paymentOptions?.[0]?.estimatedDelivery || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    transferId: transfer.id,
  });

  if (!emailResult.success) {
    fastify.log.warn({
      billId,
      payeeEmail,
      error: emailResult.errorMessage,
    }, 'Payment email failed - payment still succeeded');
  }
} else {
  if (!payeeEmail) {
    fastify.log.info({ billId, payeeName: bill.resourceName }, 'No payee email available, skipping notification');
    emailResult.errorMessage = 'No payee email available';
  } else if (!emailService.isConfigured()) {
    fastify.log.info({ billId }, 'Email service not configured, skipping notification');
    emailResult.errorMessage = 'Email service not configured';
  }
}

// Update PaymentRecord creation to include email status
await prisma.paymentRecord.create({
  data: {
    tenantId: tenant!.id,
    pcBillId: billId,
    qboInvoiceId: bill.externalInvoiceDocNum || '',
    payeeVendorId: recipient.wiseContactId || recipient.wiseEmail || 'unknown',
    payeeName: bill.resourceName,
    amount: bill.adjustedBillPayment,
    status: 'paid',
    paidAt: new Date(),
    paymentRef: String(transfer.id),
    controlResults: JSON.parse(JSON.stringify(controlResults)),
    // NEW: Email tracking fields
    payeeEmail: payeeEmail || null,
    emailSentAt: emailResult.success ? new Date() : null,
    emailMessageId: emailResult.messageId || null,
    emailStatus: emailResult.success ? 'sent' : (payeeEmail ? 'failed' : 'skipped'),
    emailError: emailResult.success ? null : emailResult.errorMessage,
  },
});
```

---

### T7: Logging and Error Handling

Logging is already integrated in the email service. Key log points:

| Event | Level | Data |
|-------|-------|------|
| Email sent | INFO | transferId, payeeEmail, messageId |
| Email failed | WARN | transferId, payeeEmail, errorMessage |
| Invalid email skipped | INFO | transferId, reason |
| Service not configured | INFO | transferId |
| Retry attempt | INFO | transferId, attempt |

---

### T8: Unit Tests

**File:** `backend/src/services/__tests__/email.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailService } from '../email.js';

describe('EmailService', () => {
  let service: EmailService;

  beforeEach(() => {
    service = new EmailService();
  });

  describe('isValidEmail', () => {
    it('should validate correct email addresses', () => {
      expect(service.isValidEmail('test@example.com')).toBe(true);
      expect(service.isValidEmail('name.surname@company.co.uk')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(service.isValidEmail('invalid')).toBe(false);
      expect(service.isValidEmail('no@domain')).toBe(false);
      expect(service.isValidEmail('@nodomain.com')).toBe(false);
    });
  });

  describe('sendPaymentConfirmation', () => {
    it('should return error when not configured', async () => {
      const result = await service.sendPaymentConfirmation({
        to: 'test@example.com',
        payeeName: 'Test User',
        amountCAD: 1000,
        targetCurrency: 'CAD',
        invoiceReference: 'INV-001',
        expectedDelivery: new Date().toISOString(),
        transferId: 123456,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('not configured');
    });

    it('should reject invalid email addresses', async () => {
      const result = await service.sendPaymentConfirmation({
        to: 'invalid-email',
        payeeName: 'Test User',
        amountCAD: 1000,
        targetCurrency: 'CAD',
        invoiceReference: 'INV-001',
        expectedDelivery: new Date().toISOString(),
        transferId: 123456,
      });

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain('Invalid email');
    });
  });
});
```

---

## Sprint Planning

### Sprint 1: Foundation (Day 1)

| Task | Est | Description |
|------|-----|-------------|
| T1 | 15m | Add postmark dependency, update config.ts |
| T2 | 15m | Create Prisma migration for email fields |
| T3 | 1h | Create email service client |
| T4 | 45m | Create HTML/text email templates |
| T5 | 15m | Update PCBill type to extract Resource.PrimaryEmail |

**Sprint 1 Total:** ~2h 30m

**Sprint 1 Deliverables:**
- [ ] `npm install postmark` added
- [ ] Config schema updated with email env vars
- [ ] Prisma migration created and applied
- [ ] `backend/src/services/email.ts` created
- [ ] `backend/src/templates/payment-confirmation.ts` created
- [ ] `payeeEmail` field added to PCBill, extracted from Resource.PrimaryEmail

### Sprint 2: Integration & Testing (Day 2)

| Task | Est | Description |
|------|-----|-------------|
| T6 | 1h | Integrate email into payment flow |
| T7 | 30m | Verify logging and error handling |
| T8 | 45m | Write unit tests |
| T9 | 30m | Manual E2E testing |
| T10 | 30m | Deploy and monitor |

**Sprint 2 Total:** ~3h 15m

**Sprint 2 Deliverables:**
- [ ] Email sending integrated in `payments.ts`
- [ ] PaymentRecord includes email tracking
- [ ] Unit tests passing
- [ ] Manual test with real Wise payment
- [ ] Deployed to production

---

## Environment Configuration

### Required Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `POSTMARK_API_TOKEN` | Yes | - | Postmark server API token |
| `POSTMARK_FROM_EMAIL` | No | `accounting@fortiumpartners.com` | Sender email |
| `POSTMARK_FROM_NAME` | No | `Fortium Partners` | Sender display name |
| `FORTIUM_FINANCE_EMAIL` | No | `accounting@fortiumpartners.com` | Finance contact in emails |

### Postmark Setup

1. Log into Postmark at https://postmarkapp.com
2. Use existing Fortium server or create new one
3. Get Server API Token from Settings → API Tokens
4. Verify sender domain `fortiumpartners.com` if not already done
5. Use "outbound" message stream for transactional emails

---

## Database Schema Changes

```sql
-- Migration: add_email_tracking_fields
ALTER TABLE payment_records
ADD COLUMN "payeeEmail" VARCHAR(255),
ADD COLUMN "emailSentAt" TIMESTAMP,
ADD COLUMN "emailMessageId" VARCHAR(255),
ADD COLUMN "emailStatus" VARCHAR(50),
ADD COLUMN "emailError" TEXT;
```

---

## Acceptance Criteria

### P0 (Must Have)

- [ ] Email sent within 60 seconds of successful Wise funding
- [ ] Email includes: payee name, amount, invoice reference, expected delivery
- [ ] Email sent from `accounting@fortiumpartners.com`
- [ ] Email delivery status stored in PaymentRecord
- [ ] Email failure does NOT block payment completion
- [ ] Delivery failures logged at WARN level

### P1 (Should Have)

- [ ] Professional HTML template with Fortium branding
- [ ] Plain text fallback version
- [ ] Automatic single retry on transient failures
- [ ] Skip invalid emails gracefully with logging

### P2 (Nice to Have)

- [ ] Postmark webhooks for delivery tracking (future)

---

## Rollout Strategy

**Approach:** 100% of CA (Wise) payments get email confirmations from day 1. No feature flag.

1. **Development Testing**
   - Test with Postmark sandbox first
   - Mock payment flow for template verification

2. **Staging Testing**
   - Send test emails to Fortium team addresses
   - Verify with real (small) Wise payments

3. **Production Rollout**
   - Deploy and enable for all CA payments immediately
   - Monitor first 5-10 emails closely
   - Check Postmark dashboard for delivery stats

---

## Risks and Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PartnerConnect missing payee email | Medium | Medium | Log warning, skip email, payment still succeeds |
| Postmark rate limiting | Low | Low | Current volume well under limits |
| Email marked as spam | Low | Medium | Use verified domain, transactional stream |
| Email template rendering errors | Low | Low | Fallback to plain text |

---

## PartnerConnect API Reference

> **Verified 2026-01-06** - This section documents the actual API response structure to avoid trial-and-error in future development.

### Bill List vs Single Bill Response

| Endpoint | Email Available? | Use Case |
|----------|-----------------|----------|
| `GET /api/bills/explorers` | ❌ No Resource details | List view, has `ResourceUid` only |
| `GET /api/bills/:uid` | ✅ Yes, in `Resource.PrimaryEmail` | Payment flow (we already call this) |

### Single Bill Response Structure

```json
// GET /api/bills/:uid
{
  "Uid": "5EsYpabBvwg1MR3F0VMUz9",
  "BillNumber": "1039",
  "ResourceName": "Yanic  Croteau ",
  "ResourceUid": "6Wva8OJuytklIyfzAxskd3",
  "Resource": {
    "Uid": "6Wva8OJuytklIyfzAxskd3",
    "TenantCode": "CA",
    "DisplayName": "Yanic  Croteau ",
    "PrimaryEmail": "Yanic@fluxcio.com",     // <-- This is what we need
    "CAExternalUserId": "31",
    "FullName": "Yanic  Croteau ",
    "IsActive": true,
    "DefaultPaymentMethod": "Wise-CAD",
    "WiseRecipientId": 826241330
  },
  "AdjustedBillPayment": 11639.00,
  "ExternalInvoiceDocNum": "1039",
  // ... other fields
}
```

### Key Fields for Email Feature

| Field | Path | Description |
|-------|------|-------------|
| Payee Email | `Resource.PrimaryEmail` | Email address for confirmation |
| Payee Name | `ResourceName` or `Resource.DisplayName` | Display name for greeting |
| Invoice Reference | `ExternalInvoiceDocNum` or `BillNumber` | For email subject/body |
| Amount | `AdjustedBillPayment` | Payment amount in source currency |

### Authentication

- OAuth2 client credentials flow via Auth0
- Domain: `prod-fs-fortiumpartners.us.auth0.com`
- Audience: `https://prod-v3.fortiumpartners.io`
- Token endpoint: `https://prod-fs-fortiumpartners.us.auth0.com/oauth/token`

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-06 | Engineering | Initial TRD from PRD v1.1 |
| 1.1 | 2026-01-06 | Engineering | Updated T5 with verified API structure - email is embedded in bill response as Resource.PrimaryEmail, no separate API call needed. Added API Reference section. |
