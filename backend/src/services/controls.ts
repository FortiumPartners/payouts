/**
 * Control checks service.
 * Validates bills against all required controls before payment.
 */

import { getFpqboClient } from './fpqbo.js';
import { PCBill } from './partnerconnect.js';

export interface ControlResult {
  name: string;
  passed: boolean;
  reason?: string;
  checkedAt: Date;
}

export interface ControlCheckResults {
  billId: string;
  allPassed: boolean;
  controls: ControlResult[];
  readyToPay: boolean;
}

// Default proving period in hours
const DEFAULT_PROVING_PERIOD_HOURS = 24;

/**
 * Run all control checks for a bill.
 */
export async function runControlChecks(
  bill: PCBill,
  tenant: 'US' | 'CA',
  provingPeriodHours: number = DEFAULT_PROVING_PERIOD_HOURS
): Promise<ControlCheckResults> {
  const controls: ControlResult[] = [];
  const fpqbo = getFpqboClient(tenant);

  // Control 1: Invoice Paid
  try {
    if (!fpqbo.isConfigured()) {
      controls.push({
        name: 'invoicePaid',
        passed: false,
        reason: 'fpqbo API not configured',
        checkedAt: new Date(),
      });
    } else {
      const invoiceStatus = await fpqbo.isInvoicePaid(bill.invoiceUid);
      controls.push({
        name: 'invoicePaid',
        passed: invoiceStatus.paid,
        reason: invoiceStatus.paid
          ? `Paid on ${invoiceStatus.paidDate?.toISOString().split('T')[0]}`
          : 'Invoice not yet paid',
        checkedAt: new Date(),
      });
    }
  } catch (err) {
    controls.push({
      name: 'invoicePaid',
      passed: false,
      reason: `Failed to check: ${err}`,
      checkedAt: new Date(),
    });
  }

  // Control 2: Invoice Not Voided
  try {
    if (!fpqbo.isConfigured()) {
      controls.push({
        name: 'invoiceNotVoided',
        passed: false,
        reason: 'fpqbo API not configured',
        checkedAt: new Date(),
      });
    } else {
      const invoiceStatus = await fpqbo.isInvoicePaid(bill.invoiceUid);
      controls.push({
        name: 'invoiceNotVoided',
        passed: !invoiceStatus.voided,
        reason: invoiceStatus.voided
          ? `Invoice voided on ${invoiceStatus.voidedDate?.toISOString().split('T')[0]}`
          : 'Invoice not voided',
        checkedAt: new Date(),
      });
    }
  } catch (err) {
    controls.push({
      name: 'invoiceNotVoided',
      passed: false,
      reason: `Failed to check: ${err}`,
      checkedAt: new Date(),
    });
  }

  // Control 3: Payee Exists
  // TODO: Implement Bill.com/Wise vendor lookup
  const hasPayee = !!bill.payeeVendorId;
  controls.push({
    name: 'payeeExists',
    passed: hasPayee,
    reason: hasPayee
      ? `Vendor ID: ${bill.payeeVendorId}`
      : 'No vendor ID on bill',
    checkedAt: new Date(),
  });

  // Control 4: Proving Period
  // Check if enough time has passed since invoice was paid
  const invoicePaidControl = controls.find(c => c.name === 'invoicePaid');
  if (invoicePaidControl?.passed) {
    // For now, use approvedAt as proxy for when we learned it was paid
    // In production, would use actual payment confirmation timestamp
    const paidAt = bill.approvedAt || new Date();
    const hoursElapsed = (Date.now() - paidAt.getTime()) / (1000 * 60 * 60);
    const provingPassed = hoursElapsed >= provingPeriodHours;

    controls.push({
      name: 'provingPeriod',
      passed: provingPassed,
      reason: provingPassed
        ? `${Math.floor(hoursElapsed)} hours elapsed (required: ${provingPeriodHours})`
        : `Only ${Math.floor(hoursElapsed)} hours elapsed (required: ${provingPeriodHours})`,
      checkedAt: new Date(),
    });
  } else {
    controls.push({
      name: 'provingPeriod',
      passed: false,
      reason: 'Invoice not yet paid - proving period not started',
      checkedAt: new Date(),
    });
  }

  // Control 5: Amount Valid
  try {
    if (!fpqbo.isConfigured()) {
      controls.push({
        name: 'amountValid',
        passed: false,
        reason: 'fpqbo API not configured',
        checkedAt: new Date(),
      });
    } else {
      // TODO: Get QBO bill ID mapping
      // For now, just validate amount is positive
      const valid = bill.amount > 0;
      controls.push({
        name: 'amountValid',
        passed: valid,
        reason: valid
          ? `Amount: $${bill.amount.toFixed(2)}`
          : 'Invalid amount',
        checkedAt: new Date(),
      });
    }
  } catch (err) {
    controls.push({
      name: 'amountValid',
      passed: false,
      reason: `Failed to check: ${err}`,
      checkedAt: new Date(),
    });
  }

  const allPassed = controls.every(c => c.passed);

  return {
    billId: bill.uid,
    allPassed,
    controls,
    readyToPay: allPassed,
  };
}

/**
 * Get control check status summary for display.
 */
export function getControlSummary(results: ControlCheckResults): {
  passed: number;
  failed: number;
  total: number;
  icons: string;
} {
  const passed = results.controls.filter(c => c.passed).length;
  const failed = results.controls.length - passed;
  const icons = results.controls.map(c => c.passed ? '✅' : '❌').join('');

  return {
    passed,
    failed,
    total: results.controls.length,
    icons,
  };
}
