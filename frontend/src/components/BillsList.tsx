/**
 * Bills list component with control status display.
 * Supports list view and grouped-by-payee view.
 * Controls are grouped by integration (PartnerConnect, QuickBooks, Bill.com/Wise, General).
 */

import { useState, useMemo } from 'react';
import { Check, X, ChevronDown, ChevronUp, Loader2, Users, List, Building2, FileSpreadsheet, CreditCard, Settings2 } from 'lucide-react';
import { Bill, ControlResult } from '../lib/api';
import { BillControlStatus } from './BillControlStatus';
import { BillControlState } from '../hooks/useBillControls';

// Control groupings by integration
type IntegrationGroup = 'partnerconnect' | 'quickbooks' | 'payment' | 'general';

interface ControlGroup {
  id: IntegrationGroup;
  name: string;
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  controls: ControlResult[];
}

// Map control names to their integration
const controlIntegrationMap: Record<string, IntegrationGroup> = {
  // PartnerConnect
  billApprovedInPC: 'partnerconnect',
  payeeExistsInPC: 'partnerconnect',
  // QuickBooks
  invoiceExistsInQbo: 'quickbooks',
  invoicePaid: 'quickbooks',
  invoiceNotVoided: 'quickbooks',
  billExistsInQbo: 'quickbooks',
  vendorExistsInQbo: 'quickbooks',
  // Bill.com (US)
  vendorExistsInBillCom: 'payment',
  billExistsInBillCom: 'payment',
  billApprovedInBillCom: 'payment',
  // Wise (CA)
  recipientMappedInSystem: 'payment',
  recipientExistsInWise: 'payment',
  wisePaymentReady: 'payment',
  // General
  notAlreadyPaid: 'general',
  provingPeriod: 'general',
  amountValid: 'general',
};

function groupControlsByIntegration(controls: ControlResult[], tenantCode: 'US' | 'CA'): ControlGroup[] {
  const groups: Record<IntegrationGroup, ControlResult[]> = {
    partnerconnect: [],
    quickbooks: [],
    payment: [],
    general: [],
  };

  controls.forEach(control => {
    const group = controlIntegrationMap[control.name] || 'general';
    groups[group].push(control);
  });

  const result: ControlGroup[] = [];

  if (groups.partnerconnect.length > 0) {
    result.push({
      id: 'partnerconnect',
      name: 'PartnerConnect',
      icon: <Building2 className="h-4 w-4" />,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      controls: groups.partnerconnect,
    });
  }

  if (groups.quickbooks.length > 0) {
    result.push({
      id: 'quickbooks',
      name: 'QuickBooks',
      icon: <FileSpreadsheet className="h-4 w-4" />,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      controls: groups.quickbooks,
    });
  }

  if (groups.payment.length > 0) {
    result.push({
      id: 'payment',
      name: tenantCode === 'US' ? 'Bill.com' : 'Wise',
      icon: <CreditCard className="h-4 w-4" />,
      bgColor: tenantCode === 'US' ? 'bg-sky-50' : 'bg-teal-50',
      borderColor: tenantCode === 'US' ? 'border-sky-300' : 'border-teal-300',
      controls: groups.payment,
    });
  }

  if (groups.general.length > 0) {
    result.push({
      id: 'general',
      name: 'General',
      icon: <Settings2 className="h-4 w-4" />,
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      controls: groups.general,
    });
  }

  return result;
}

// Format camelCase control names to human-readable
function formatControlName(name: string): string {
  const nameMap: Record<string, string> = {
    billApprovedInPC: 'Bill Approved',
    payeeExistsInPC: 'Payee Exists',
    invoiceExistsInQbo: 'Invoice Exists',
    invoicePaid: 'Invoice Paid',
    invoiceNotVoided: 'Invoice Active',
    billExistsInQbo: 'Bill Exists',
    vendorExistsInQbo: 'Vendor Linked',
    vendorExistsInBillCom: 'Vendor Exists',
    billExistsInBillCom: 'Bill Exists',
    billApprovedInBillCom: 'Bill Approved',
    recipientMappedInSystem: 'Recipient Mapped',
    recipientExistsInWise: 'Contact Exists',
    wisePaymentReady: 'Payment Ready',
    notAlreadyPaid: 'Not Already Paid',
    provingPeriod: 'Proving Period',
    amountValid: 'Amount Valid',
  };
  return nameMap[name] || name;
}

export type ViewMode = 'list' | 'grouped';

interface BillsListProps {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
  controlStates: Map<string, BillControlState>;
  onPayBill?: (bill: Bill) => void;
}

interface PayeeGroup {
  payeeName: string;
  bills: Bill[];
  totalAmount: number;
  readyCount: number;
  issueCount: number;
}

function ControlIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <Check className="h-4 w-4 text-green-600" />
  ) : (
    <X className="h-4 w-4 text-red-600" />
  );
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

/** Individual bill row for list view */
function BillRow({
  bill,
  controlState,
  onPay,
  indented = false,
}: {
  bill: Bill;
  controlState?: BillControlState;
  onPay?: (bill: Bill) => void;
  indented?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const handleExpand = () => {
    setExpanded(!expanded);
  };

  // Use controls from controlState if available, otherwise from bill
  const controls = controlState?.controls || bill.controls;
  const readyToPay = controlState?.readyToPay ?? bill.readyToPay;

  return (
    <>
      <tr className={`border-b hover:bg-muted/50 ${indented ? 'bg-muted/20' : ''}`}>
        <td className={`px-4 py-3 ${indented ? 'pl-8' : ''}`}>
          <button
            onClick={handleExpand}
            className="p-1 hover:bg-muted rounded"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-1 rounded font-medium ${
            bill.tenantCode === 'US' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
          }`}>
            {bill.tenantCode}
          </span>
        </td>
        <td className="px-4 py-3 text-sm">{bill.clientName || '-'}</td>
        <td className="px-4 py-3 text-sm">{bill.payeeName}</td>
        <td className="px-4 py-3 text-right font-medium">
          {formatAmount(bill.amount)}
        </td>
        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
          {bill.qboInvoiceNum || '-'}
        </td>
        <td className="px-4 py-3">
          <BillControlStatus
            state={controlState}
            onDetailsClick={handleExpand}
          />
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => onPay?.(bill)}
            disabled={!readyToPay || controlState?.status === 'checking'}
            className={`px-3 py-1 rounded text-sm font-medium ${
              readyToPay
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : controlState?.status === 'checking'
                ? 'bg-muted text-muted-foreground cursor-wait'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
            title={readyToPay
              ? `Pay via ${bill.tenantCode === 'CA' ? 'Wise' : 'Bill.com'}`
              : controlState?.status === 'checking'
              ? 'Checking controls...'
              : 'Controls not passed'}
          >
            Pay
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={8} className={`px-4 py-4 ${indented ? 'pl-8' : ''}`}>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <h4 className="font-medium mb-3">Control Details</h4>
                {controlState?.status === 'checking' ? (
                  <div className="flex items-center gap-2 text-muted-foreground py-4">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Checking controls...</span>
                  </div>
                ) : controls.length === 0 ? (
                  <div className="text-muted-foreground py-4">No controls loaded</div>
                ) : (
                <div className="grid grid-cols-2 gap-3">
                  {groupControlsByIntegration(controls, bill.tenantCode).map((group) => {
                    const allPassed = group.controls.every(c => c.passed);
                    const failedCount = group.controls.filter(c => !c.passed).length;
                    return (
                      <div
                        key={group.id}
                        className={`rounded-lg border p-3 ${group.bgColor} ${group.borderColor}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-muted-foreground">{group.icon}</span>
                          <span className="font-medium text-sm">{group.name}</span>
                          {allPassed ? (
                            <Check className="h-4 w-4 text-green-600 ml-auto" />
                          ) : (
                            <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded ml-auto">
                              {failedCount} issue{failedCount !== 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {group.controls.map((control) => (
                            <div
                              key={control.name}
                              className="flex items-start gap-2 text-sm"
                            >
                              <ControlIcon passed={control.passed} />
                              <div className="min-w-0 flex-1">
                                <span className="font-medium text-xs">{formatControlName(control.name)}</span>
                                {control.reason && (
                                  <p className="text-muted-foreground text-xs truncate" title={control.reason}>
                                    {control.reason}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
                )}
              </div>
              <div>
                <h4 className="font-medium mb-3">Bill Details</h4>
                <div className="space-y-3">
                  {/* PartnerConnect */}
                  <div className="text-sm">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">PartnerConnect</div>
                    <dl className="space-y-0.5">
                      <div>
                        <dt className="text-muted-foreground inline">Bill: </dt>
                        <dd className="inline font-mono text-xs">{bill.uid}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground inline">Status: </dt>
                        <dd className="inline">{bill.status}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* QuickBooks */}
                  <div className="text-sm">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">QuickBooks</div>
                    <dl className="space-y-0.5">
                      <div>
                        <dt className="text-muted-foreground inline">Invoice: </dt>
                        <dd className="inline font-mono">{bill.qboInvoiceNum || '-'}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground inline">Bill: </dt>
                        <dd className="inline font-mono">{bill.qboBillNum || '-'}</dd>
                      </div>
                    </dl>
                  </div>

                  {/* Bill.com or Wise */}
                  <div className="text-sm">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      {bill.tenantCode === 'US' ? 'Bill.com' : 'Wise'}
                    </div>
                    <dl className="space-y-0.5">
                      {bill.tenantCode === 'US' ? (
                        <div>
                          <dt className="text-muted-foreground inline">Bill: </dt>
                          <dd className="inline font-mono">{bill.billComId || '-'}</dd>
                        </div>
                      ) : (
                        <div>
                          <dt className="text-muted-foreground inline">Payment: </dt>
                          <dd className="inline">CAD transfer</dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {/* Description */}
                  {bill.description && (
                    <div className="text-sm pt-2 border-t">
                      <div className="text-muted-foreground text-xs">{bill.description}</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** Payee group row for grouped view */
function PayeeGroupRow({
  group,
  controlStates,
  onPay,
}: {
  group: PayeeGroup;
  controlStates: Map<string, BillControlState>;
  onPay?: (bill: Bill) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b hover:bg-muted/50 bg-muted/10">
        <td className="px-4 py-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 hover:bg-muted rounded"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </td>
        <td className="px-4 py-3 font-medium" colSpan={2}>
          {group.payeeName}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {group.bills.length} {group.bills.length === 1 ? 'bill' : 'bills'}
        </td>
        <td className="px-4 py-3 text-right font-medium">
          {formatAmount(group.totalAmount)}
        </td>
        <td className="px-4 py-3">
          {group.issueCount === 0 ? (
            <span className="text-green-600 text-sm font-medium">
              {group.readyCount} ready
            </span>
          ) : (
            <span className="text-yellow-600 text-sm font-medium">
              {group.readyCount}/{group.bills.length} ready
            </span>
          )}
        </td>
        <td className="px-4 py-3"></td>
        <td className="px-4 py-3"></td>
      </tr>
      {expanded && group.bills.map((bill) => (
        <BillRow
          key={bill.uid}
          bill={bill}
          controlState={controlStates.get(bill.uid)}
          onPay={onPay}
          indented
        />
      ))}
    </>
  );
}

/** List view table */
function ListView({
  bills,
  controlStates,
  onPayBill,
}: {
  bills: Bill[];
  controlStates: Map<string, BillControlState>;
  onPayBill?: (bill: Bill) => void;
}) {
  return (
    <table className="w-full">
      <thead className="bg-muted/50">
        <tr>
          <th className="px-4 py-3 text-left w-10"></th>
          <th className="px-4 py-3 text-left text-sm font-medium">Tenant</th>
          <th className="px-4 py-3 text-left text-sm font-medium">Client</th>
          <th className="px-4 py-3 text-left text-sm font-medium">Payee</th>
          <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
          <th className="px-4 py-3 text-left text-sm font-medium">QBO Inv</th>
          <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
          <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
        </tr>
      </thead>
      <tbody>
        {bills.map((bill) => (
          <BillRow
            key={bill.uid}
            bill={bill}
            controlState={controlStates.get(bill.uid)}
            onPay={onPayBill}
          />
        ))}
      </tbody>
    </table>
  );
}

/** Grouped view table */
function GroupedView({
  bills,
  controlStates,
  onPayBill,
}: {
  bills: Bill[];
  controlStates: Map<string, BillControlState>;
  onPayBill?: (bill: Bill) => void;
}) {
  const groups = useMemo(() => {
    const groupMap = new Map<string, Bill[]>();
    bills.forEach(bill => {
      const existing = groupMap.get(bill.payeeName) || [];
      groupMap.set(bill.payeeName, [...existing, bill]);
    });

    return Array.from(groupMap.entries())
      .map(([payeeName, groupBills]): PayeeGroup => ({
        payeeName,
        bills: groupBills,
        totalAmount: groupBills.reduce((sum, b) => sum + b.amount, 0),
        readyCount: groupBills.filter(b => b.readyToPay).length,
        issueCount: groupBills.filter(b => !b.readyToPay).length,
      }))
      .sort((a, b) => b.totalAmount - a.totalAmount); // Sort by total amount desc
  }, [bills]);

  return (
    <table className="w-full">
      <thead className="bg-muted/50">
        <tr>
          <th className="px-4 py-3 text-left w-10"></th>
          <th className="px-4 py-3 text-left text-sm font-medium" colSpan={2}>Payee</th>
          <th className="px-4 py-3 text-left text-sm font-medium">Bills</th>
          <th className="px-4 py-3 text-right text-sm font-medium">Total</th>
          <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
          <th className="px-4 py-3 text-left text-sm font-medium" colSpan={2}></th>
        </tr>
      </thead>
      <tbody>
        {groups.map((group) => (
          <PayeeGroupRow
            key={group.payeeName}
            group={group}
            controlStates={controlStates}
            onPay={onPayBill}
          />
        ))}
      </tbody>
    </table>
  );
}

export function BillsList({ bills, loading, error, viewMode, controlStates, onPayBill }: BillsListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        <p>Error loading bills: {error}</p>
      </div>
    );
  }

  if (bills.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No bills found.</p>
        <p className="text-sm mt-2">
          Bills from PartnerConnect will appear here once available.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {viewMode === 'list' ? (
        <ListView bills={bills} controlStates={controlStates} onPayBill={onPayBill} />
      ) : (
        <GroupedView bills={bills} controlStates={controlStates} onPayBill={onPayBill} />
      )}
    </div>
  );
}

/** View mode toggle component */
export function ViewModeToggle({
  viewMode,
  onChange
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex gap-1 border rounded-md p-1">
      <button
        onClick={() => onChange('list')}
        className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
          viewMode === 'list'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        <List className="h-4 w-4" />
        List
      </button>
      <button
        onClick={() => onChange('grouped')}
        className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
          viewMode === 'grouped'
            ? 'bg-primary text-primary-foreground'
            : 'text-muted-foreground hover:bg-muted'
        }`}
      >
        <Users className="h-4 w-4" />
        By Payee
      </button>
    </div>
  );
}
