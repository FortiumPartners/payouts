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
