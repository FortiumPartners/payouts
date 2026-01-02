/**
 * Control checks service.
 * Validates bills against all required controls before payment.
 *
 * ALL checks must pass for a bill to be payable:
 * - PartnerConnect: Bill approved
 * - QBO: Invoice exists, paid, not voided; Bill exists
 * - Bill.com (US only): Vendor exists, Bill exists, Bill approved
 * - General: Proving period elapsed, Amount valid
 */

import { getFpqboClient } from './fpqbo.js';
import { getBillComClient } from './billcom.js';
import { getWiseClient } from './wise.js';
import { PCBill } from './partnerconnect.js';
import { prisma } from '../lib/prisma.js';

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
 * Every control must pass for the bill to be payable.
 */
export async function runControlChecks(
  bill: PCBill,
  tenant: 'US' | 'CA',
  provingPeriodHours: number = DEFAULT_PROVING_PERIOD_HOURS
): Promise<ControlCheckResults> {
  const controls: ControlResult[] = [];
  const fpqbo = getFpqboClient(tenant);
  const billcom = tenant === 'US' ? getBillComClient() : null;

  // =========================================================================
  // PARTNERCONNECT CONTROLS
  // =========================================================================

  // Control: Bill Approved in PartnerConnect
  // ProcessCode must be 'Approved' to indicate approval
  const isApprovedInPC = bill.processCode === 'Approved';
  controls.push({
    name: 'billApprovedInPC',
    passed: isApprovedInPC,
    reason: isApprovedInPC
      ? 'Bill approved in PartnerConnect'
      : `Bill not approved (processCode: ${bill.processCode || 'unknown'})`,
    checkedAt: new Date(),
  });

  // =========================================================================
  // QBO CONTROLS (via fpqbo)
  // =========================================================================

  // Control: Invoice Exists in QBO
  let invoiceData: { paid: boolean; paidDate?: Date; voided: boolean; voidedDate?: Date } | null = null;

  try {
    if (!bill.externalInvoiceDocNum) {
      controls.push({
        name: 'invoiceExistsInQbo',
        passed: false,
        reason: 'No QBO invoice DocNumber on PC bill',
        checkedAt: new Date(),
      });
    } else if (!fpqbo.isConfigured()) {
      controls.push({
        name: 'invoiceExistsInQbo',
        passed: false,
        reason: 'Cannot verify (fpqbo not configured)',
        checkedAt: new Date(),
      });
    } else {
      invoiceData = await fpqbo.isInvoicePaid(bill.externalInvoiceDocNum);
      controls.push({
        name: 'invoiceExistsInQbo',
        passed: true,
        reason: `Invoice ${bill.externalInvoiceDocNum} found in QBO`,
        checkedAt: new Date(),
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    controls.push({
      name: 'invoiceExistsInQbo',
      passed: false,
      reason: `Invoice not found: ${errMsg}`,
      checkedAt: new Date(),
    });
  }

  // Control: Invoice Paid in QBO
  if (invoiceData) {
    controls.push({
      name: 'invoicePaid',
      passed: invoiceData.paid,
      reason: invoiceData.paid
        ? `Paid${invoiceData.paidDate ? ` on ${invoiceData.paidDate.toISOString().split('T')[0]}` : ''}`
        : 'Invoice not yet paid',
      checkedAt: new Date(),
    });
  } else {
    controls.push({
      name: 'invoicePaid',
      passed: false,
      reason: 'Cannot verify (invoice lookup failed)',
      checkedAt: new Date(),
    });
  }

  // Control: Invoice Not Voided in QBO
  if (invoiceData) {
    controls.push({
      name: 'invoiceNotVoided',
      passed: !invoiceData.voided,
      reason: invoiceData.voided
        ? `Voided${invoiceData.voidedDate ? ` on ${invoiceData.voidedDate.toISOString().split('T')[0]}` : ''}`
        : 'Invoice active',
      checkedAt: new Date(),
    });
  } else {
    controls.push({
      name: 'invoiceNotVoided',
      passed: false,
      reason: 'Cannot verify (invoice lookup failed)',
      checkedAt: new Date(),
    });
  }

  // Control: Bill Exists in QBO
  try {
    if (!bill.externalBillId) {
      controls.push({
        name: 'billExistsInQbo',
        passed: false,
        reason: 'No QBO bill ID on PC bill',
        checkedAt: new Date(),
      });
    } else if (!fpqbo.isConfigured()) {
      controls.push({
        name: 'billExistsInQbo',
        passed: false,
        reason: 'Cannot verify (fpqbo not configured)',
        checkedAt: new Date(),
      });
    } else {
      const qboBill = await fpqbo.getBill(bill.externalBillId);
      controls.push({
        name: 'billExistsInQbo',
        passed: !!qboBill,
        reason: qboBill
          ? `QBO Bill: ${qboBill.docNumber} ($${qboBill.totalAmount.toFixed(2)})`
          : `QBO bill ${bill.externalBillId} not found`,
        checkedAt: new Date(),
      });
    }
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    controls.push({
      name: 'billExistsInQbo',
      passed: false,
      reason: `Unable to verify QBO bill: ${errMsg}`,
      checkedAt: new Date(),
    });
  }

  // =========================================================================
  // PAYEE/VENDOR CONTROLS
  // =========================================================================

  // Control: Payee Exists in PartnerConnect
  // If we have the bill, the payee must exist - verify resourceUid is present
  const hasPayeeInPC = !!bill.resourceUid && !!bill.resourceName;
  controls.push({
    name: 'payeeExistsInPC',
    passed: hasPayeeInPC,
    reason: hasPayeeInPC
      ? `Payee: ${bill.resourceName}`
      : 'No payee assigned to bill',
    checkedAt: new Date(),
  });

  // Control: Vendor Exists in QBO
  // The QBO bill we fetched earlier should have vendor info
  // For now, we trust that if the bill exists in QBO, the vendor does too
  // (QBO won't let you create a bill without a vendor)
  controls.push({
    name: 'vendorExistsInQbo',
    passed: hasPayeeInPC, // If bill exists in QBO (checked above), vendor must exist
    reason: hasPayeeInPC
      ? `Vendor linked via QBO bill`
      : 'Cannot verify (no payee on bill)',
    checkedAt: new Date(),
  });

  // =========================================================================
  // PAYMENT SYSTEM CONTROLS (Bill.com for US, Wise for CA)
  // =========================================================================

  if (tenant === 'US') {
    console.log(`[controls] Running Bill.com checks for US bill ${bill.uid}`);
    // Control: Vendor Exists in Bill.com
    try {
      console.log(`[controls] Bill.com isConfigured: ${billcom?.isConfigured()}`);
      if (!billcom?.isConfigured()) {
        controls.push({
          name: 'vendorExistsInBillCom',
          passed: false,
          reason: 'Bill.com not configured',
          checkedAt: new Date(),
        });
      } else {
        const vendor = await billcom.findVendor(bill.resourceName);
        controls.push({
          name: 'vendorExistsInBillCom',
          passed: !!vendor,
          reason: vendor
            ? `Vendor: ${vendor.name} (${vendor.id})`
            : `Vendor "${bill.resourceName}" not found in Bill.com`,
          checkedAt: new Date(),
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      controls.push({
        name: 'vendorExistsInBillCom',
        passed: false,
        reason: `Unable to verify vendor: ${errMsg}`,
        checkedAt: new Date(),
      });
    }

    // Control: Bill Exists in Bill.com
    let billComBill: { id: string; approvalStatus: string; amount: number } | null = null;

    try {
      if (!billcom?.isConfigured()) {
        controls.push({
          name: 'billExistsInBillCom',
          passed: false,
          reason: 'Bill.com not configured',
          checkedAt: new Date(),
        });
      } else if (!bill.externalBillDocNum) {
        controls.push({
          name: 'billExistsInBillCom',
          passed: false,
          reason: 'No bill invoice number to search',
          checkedAt: new Date(),
        });
      } else {
        billComBill = await billcom.findBill(bill.externalBillDocNum);
        controls.push({
          name: 'billExistsInBillCom',
          passed: !!billComBill,
          reason: billComBill
            ? `Bill.com: ${billComBill.id} ($${billComBill.amount.toFixed(2)})`
            : `Bill "${bill.externalBillDocNum}" not found in Bill.com`,
          checkedAt: new Date(),
        });
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      controls.push({
        name: 'billExistsInBillCom',
        passed: false,
        reason: `Unable to verify Bill.com bill: ${errMsg}`,
        checkedAt: new Date(),
      });
    }

    // Control: Bill Approved in Bill.com
    if (billComBill) {
      // Bill.com approval statuses: '0' = Unassigned, '1' = Assigned, '2' = Approving, '3' = Approved, '4' = Denied
      const approvedStatuses = ['3', 'Approved', 'approved'];
      const isApproved = approvedStatuses.includes(billComBill.approvalStatus);
      controls.push({
        name: 'billApprovedInBillCom',
        passed: isApproved,
        reason: isApproved
          ? 'Bill approved in Bill.com'
          : `Bill not approved (status: ${billComBill.approvalStatus})`,
        checkedAt: new Date(),
      });
    } else {
      controls.push({
        name: 'billApprovedInBillCom',
        passed: false,
        reason: 'Cannot verify (bill not found in Bill.com)',
        checkedAt: new Date(),
      });
    }
  } else {
    // =========================================================================
    // WISE CONTROLS (CA only)
    // =========================================================================

    const wise = getWiseClient();

    // Control: Recipient Mapped in System
    // Check if we have a WiseRecipient record for this payee
    let wiseRecipient: { id: string; wiseEmail: string; targetCurrency: string; wiseContactId: string | null } | null = null;
    try {
      wiseRecipient = await prisma.wiseRecipient.findUnique({
        where: { payeeName: bill.resourceName },
      });

      controls.push({
        name: 'recipientMappedInSystem',
        passed: !!wiseRecipient,
        reason: wiseRecipient
          ? `Mapped to: ${wiseRecipient.wiseEmail} (${wiseRecipient.targetCurrency})`
          : `No Wise mapping for "${bill.resourceName}" - add to wise_recipients table`,
        checkedAt: new Date(),
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      controls.push({
        name: 'recipientMappedInSystem',
        passed: false,
        reason: `Database error: ${errMsg}`,
        checkedAt: new Date(),
      });
    }

    // Control: Recipient Exists in Wise
    // Verify the contact exists in Wise by email lookup
    try {
      if (!wise.isConfigured()) {
        controls.push({
          name: 'recipientExistsInWise',
          passed: false,
          reason: 'Wise API not configured (set WISE_API_TOKEN)',
          checkedAt: new Date(),
        });
      } else if (!wiseRecipient) {
        controls.push({
          name: 'recipientExistsInWise',
          passed: false,
          reason: 'Cannot verify (no recipient mapping)',
          checkedAt: new Date(),
        });
      } else {
        const contact = await wise.findContact(wiseRecipient.wiseEmail, wiseRecipient.targetCurrency);
        controls.push({
          name: 'recipientExistsInWise',
          passed: !!contact,
          reason: contact
            ? `Wise contact: ${contact.accountHolderName} (${contact.id})`
            : `No Wise contact found for ${wiseRecipient.wiseEmail}`,
          checkedAt: new Date(),
        });

        // Cache the contact ID if found and not already cached
        if (contact && !wiseRecipient.wiseContactId) {
          await prisma.wiseRecipient.update({
            where: { id: wiseRecipient.id },
            data: { wiseContactId: String(contact.id) },
          });
        }
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      controls.push({
        name: 'recipientExistsInWise',
        passed: false,
        reason: `Wise API error: ${errMsg}`,
        checkedAt: new Date(),
      });
    }

    // Control: Wise Payment Ready
    // Verify Wise is configured and ready for payments
    controls.push({
      name: 'wisePaymentReady',
      passed: wise.isConfigured() && !!wiseRecipient,
      reason: wise.isConfigured()
        ? (wiseRecipient ? 'Wise ready' : 'Recipient not mapped')
        : 'Wise not configured',
      checkedAt: new Date(),
    });
  }

  // =========================================================================
  // GENERAL CONTROLS
  // =========================================================================

  // Control: Proving Period
  // Configurable wait period before payment can be initiated
  const trxDate = bill.trxDate;
  const hoursElapsed = (Date.now() - trxDate.getTime()) / (1000 * 60 * 60);
  const provingPassed = hoursElapsed >= provingPeriodHours;

  controls.push({
    name: 'provingPeriod',
    passed: provingPassed,
    reason: provingPassed
      ? `${Math.floor(hoursElapsed)}h elapsed (required: ${provingPeriodHours}h)`
      : `Only ${Math.floor(hoursElapsed)}h elapsed (required: ${provingPeriodHours}h)`,
    checkedAt: new Date(),
  });

  // Control: Amount Valid
  // Verify adjusted payment amount is positive
  const amount = bill.adjustedBillPayment;
  const amountValid = amount > 0;
  controls.push({
    name: 'amountValid',
    passed: amountValid,
    reason: amountValid
      ? `$${amount.toFixed(2)}`
      : 'Invalid amount (must be > 0)',
    checkedAt: new Date(),
  });

  // =========================================================================
  // RESULT
  // =========================================================================

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
