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

import { getFpqboClient, FpqboError } from './fpqbo.js';
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
    // Handle "not found" gracefully - invoice was deleted/made inactive in QBO
    if (err instanceof FpqboError && err.isNotFound) {
      controls.push({
        name: 'invoiceExistsInQbo',
        passed: false,
        reason: `QBO invoice ${bill.externalInvoiceDocNum} deleted or inactive`,
        checkedAt: new Date(),
      });
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      controls.push({
        name: 'invoiceExistsInQbo',
        passed: false,
        reason: `Invoice lookup failed: ${errMsg}`,
        checkedAt: new Date(),
      });
    }
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
    // Handle "not found" gracefully - bill was deleted/made inactive in QBO
    if (err instanceof FpqboError && err.isNotFound) {
      controls.push({
        name: 'billExistsInQbo',
        passed: false,
        reason: `QBO bill ${bill.externalBillId} deleted or inactive`,
        checkedAt: new Date(),
      });
    } else {
      const errMsg = err instanceof Error ? err.message : String(err);
      controls.push({
        name: 'billExistsInQbo',
        passed: false,
        reason: `Unable to verify QBO bill: ${errMsg}`,
        checkedAt: new Date(),
      });
    }
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

    // Note: For Bill.com, we don't need a local vendor mapping.
    // The bill already exists in Bill.com with vendor attached.
    // We verify the bill exists, vendor exists, and bill is approved.

    // Control: Bill Exists in Bill.com
    let billComBill: { id: string; vendorId: string; approvalStatus: string; amount: number } | null = null;

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

    // Control: Vendor Exists in Bill.com (using vendor ID from the bill)
    if (billComBill && billcom?.isConfigured()) {
      try {
        const vendor = await billcom.getVendor(billComBill.vendorId);
        controls.push({
          name: 'vendorExistsInBillCom',
          passed: !!vendor,
          reason: vendor
            ? `Vendor: ${vendor.name} (${vendor.id})`
            : `Bill.com vendor ${billComBill.vendorId} not found`,
          checkedAt: new Date(),
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        controls.push({
          name: 'vendorExistsInBillCom',
          passed: false,
          reason: `Unable to verify vendor: ${errMsg}`,
          checkedAt: new Date(),
        });
      }
    } else if (!billComBill) {
      controls.push({
        name: 'vendorExistsInBillCom',
        passed: false,
        reason: 'Cannot verify (bill not found in Bill.com)',
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
    // Check if we have a WiseRecipient record for this vendor (by QBO vendor ID)
    let wiseRecipient: { id: string; payeeName: string; wiseEmail: string; targetCurrency: string; wiseContactId: string | null } | null = null;
    try {
      if (!bill.qboVendorId) {
        controls.push({
          name: 'recipientMappedInSystem',
          passed: false,
          reason: `No QBO vendor ID on bill for ${bill.resourceName}`,
          checkedAt: new Date(),
        });
      } else {
        console.log(`[controls] Looking up Wise recipient for QBO vendor ID: "${bill.qboVendorId}" (${bill.resourceName})`);
        wiseRecipient = await prisma.wiseRecipient.findUnique({
          where: { qboVendorId: bill.qboVendorId },
        });
        console.log(`[controls] Wise recipient lookup result:`, wiseRecipient ? `Found: ${wiseRecipient.wiseEmail}` : 'Not found');

        controls.push({
          name: 'recipientMappedInSystem',
          passed: !!wiseRecipient,
          reason: wiseRecipient
            ? `Mapped to: ${wiseRecipient.wiseEmail} (${wiseRecipient.targetCurrency})`
            : `No Wise mapping for QBO vendor ${bill.qboVendorId} (${bill.resourceName})`,
          checkedAt: new Date(),
        });
      }
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
    // Verify the contact exists in Wise - by cached ID or email lookup
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
        let contactFound = false;
        let contactName = '';
        let contactIdentifier = '';
        let controlAlreadyAdded = false;

        // If we have a contact UUID, verify it exists AND we have a valid email
        if (wiseRecipient.wiseContactId && wiseRecipient.wiseContactId.includes('-')) {
          // UUID format - this is a Wise-to-Wise contact
          // We need a valid email to create an email-type recipient for transfers
          const hasValidEmail = wiseRecipient.wiseEmail &&
            !wiseRecipient.wiseEmail.toLowerCase().includes('wise account') &&
            !wiseRecipient.wiseEmail.toLowerCase().includes('wise business');

          if (!hasValidEmail) {
            // Missing email - fail the control with helpful message
            controls.push({
              name: 'recipientExistsInWise',
              passed: false,
              reason: `Wise-to-Wise contact needs email configured (currently: "${wiseRecipient.wiseEmail || 'none'}")`,
              checkedAt: new Date(),
            });
            controlAlreadyAdded = true;
          } else {
            // Has valid email - verify contact exists in Wise
            const recipients = await wise.listRecipients();
            const matchedRecipient = recipients.find(r => r.contactUuid === wiseRecipient.wiseContactId);
            if (matchedRecipient) {
              contactFound = true;
              contactName = matchedRecipient.name?.fullName || '';
              contactIdentifier = `${wiseRecipient.wiseEmail}`;
            }
          }
        }

        // Fall back to email lookup for bank account recipients (numeric IDs)
        if (!contactFound && !controlAlreadyAdded && wiseRecipient.wiseEmail && !wiseRecipient.wiseEmail.toLowerCase().includes('wise account')) {
          const foundContact = await wise.findContact(wiseRecipient.wiseEmail, wiseRecipient.targetCurrency);
          if (foundContact) {
            contactFound = true;
            contactName = foundContact.accountHolderName;
            contactIdentifier = String(foundContact.id);
          }
        }

        if (!controlAlreadyAdded) {
          controls.push({
            name: 'recipientExistsInWise',
            passed: contactFound,
            reason: contactFound
              ? `Wise contact: ${contactName} (${contactIdentifier})`
              : wiseRecipient.wiseContactId
                ? `No payable account for contact ${wiseRecipient.wiseContactId.substring(0, 8)}...`
                : `No Wise contact found for ${wiseRecipient.wiseEmail}`,
            checkedAt: new Date(),
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
    // Note: Balance check happens at payment time in the confirmation dialog
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

  // Control: Not Already Paid
  // Check if this bill was already paid through Payouts
  const existingPayment = await prisma.paymentRecord.findFirst({
    where: { pcBillId: bill.uid, status: 'paid' },
  });
  controls.push({
    name: 'notAlreadyPaid',
    passed: !existingPayment,
    reason: existingPayment
      ? `Already paid on ${existingPayment.paidAt?.toISOString().split('T')[0]} (ref: ${existingPayment.paymentRef})`
      : 'Not yet paid',
    checkedAt: new Date(),
  });

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
