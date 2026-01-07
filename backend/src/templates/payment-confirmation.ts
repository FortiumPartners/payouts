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
      <img src="https://www.fortiumpartners.com/hubfs/raw_assets/public/FortiumPartners_2022/images/5f43cb31a09dd4e4d62b0a20_logo.svg" alt="Fortium Partners" style="height: 40px; margin-bottom: 15px;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Payment Confirmation</h1>
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
