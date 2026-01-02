/**
 * Bills list component with control status display.
 * Supports list view and grouped-by-payee view.
 */

import { useState, useMemo } from 'react';
import { Check, X, ChevronDown, ChevronUp, Loader2, Users, List } from 'lucide-react';
import { Bill } from '../lib/api';

export type ViewMode = 'list' | 'grouped';

interface BillsListProps {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  viewMode: ViewMode;
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

/** Simple status summary - "Ready" or "X issues" */
function ControlSummary({ controls, readyToPay }: { controls: Bill['controls']; readyToPay: boolean }) {
  const failed = controls.filter(c => !c.passed).length;
  if (readyToPay) {
    return <span className="text-green-600 text-sm font-medium">Ready</span>;
  }
  return <span className="text-yellow-600 text-sm font-medium">{failed} {failed === 1 ? 'issue' : 'issues'}</span>;
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
  onPay,
  indented = false,
}: {
  bill: Bill;
  onPay?: (bill: Bill) => void;
  indented?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className={`border-b hover:bg-muted/50 ${indented ? 'bg-muted/20' : ''}`}>
        <td className={`px-4 py-3 ${indented ? 'pl-8' : ''}`}>
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
          <ControlSummary controls={bill.controls} readyToPay={bill.readyToPay} />
        </td>
        <td className="px-4 py-3">
          <button
            onClick={() => onPay?.(bill)}
            disabled={!bill.readyToPay}
            className={`px-3 py-1 rounded text-sm font-medium ${
              bill.readyToPay
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
            title={bill.readyToPay
              ? `Pay via ${bill.tenantCode === 'CA' ? 'Wise' : 'Bill.com'}`
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
              <div>
                <h4 className="font-medium mb-2">Control Details</h4>
                <div className="space-y-2">
                  {bill.controls.map((control) => (
                    <div
                      key={control.name}
                      className="flex items-start gap-2 text-sm"
                    >
                      <ControlIcon passed={control.passed} />
                      <div>
                        <span className="font-medium">{control.name}</span>
                        {control.reason && (
                          <p className="text-muted-foreground">
                            {control.reason}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">Bill Details</h4>
                <dl className="text-sm space-y-1">
                  <div>
                    <dt className="text-muted-foreground inline">Bill ID: </dt>
                    <dd className="inline font-mono text-xs">{bill.uid}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">Status: </dt>
                    <dd className="inline">{bill.status}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">Description: </dt>
                    <dd className="inline">{bill.description || '-'}</dd>
                  </div>
                </dl>
              </div>
              <div>
                <h4 className="font-medium mb-2">External References</h4>
                <dl className="text-sm space-y-1">
                  <div>
                    <dt className="text-muted-foreground inline">QBO Invoice: </dt>
                    <dd className="inline font-mono">{bill.qboInvoiceNum || '-'}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">QBO Bill: </dt>
                    <dd className="inline font-mono">{bill.qboBillNum || '-'}</dd>
                  </div>
                  {bill.tenantCode === 'US' && (
                    <div>
                      <dt className="text-muted-foreground inline">Bill.com: </dt>
                      <dd className="inline font-mono">{bill.billComId || '-'}</dd>
                    </div>
                  )}
                </dl>
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
  onPay,
}: {
  group: PayeeGroup;
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
        <BillRow key={bill.uid} bill={bill} onPay={onPay} indented />
      ))}
    </>
  );
}

/** List view table */
function ListView({ bills, onPayBill }: { bills: Bill[]; onPayBill?: (bill: Bill) => void }) {
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
          <BillRow key={bill.uid} bill={bill} onPay={onPayBill} />
        ))}
      </tbody>
    </table>
  );
}

/** Grouped view table */
function GroupedView({ bills, onPayBill }: { bills: Bill[]; onPayBill?: (bill: Bill) => void }) {
  const groups = useMemo(() => {
    const groupMap = new Map<string, Bill[]>();
    bills.forEach(bill => {
      const existing = groupMap.get(bill.payeeName) || [];
      groupMap.set(bill.payeeName, [...existing, bill]);
    });

    return Array.from(groupMap.entries())
      .map(([payeeName, bills]): PayeeGroup => ({
        payeeName,
        bills,
        totalAmount: bills.reduce((sum, b) => sum + b.amount, 0),
        readyCount: bills.filter(b => b.readyToPay).length,
        issueCount: bills.filter(b => !b.readyToPay).length,
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
          <PayeeGroupRow key={group.payeeName} group={group} onPay={onPayBill} />
        ))}
      </tbody>
    </table>
  );
}

export function BillsList({ bills, loading, error, viewMode, onPayBill }: BillsListProps) {
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
        <ListView bills={bills} onPayBill={onPayBill} />
      ) : (
        <GroupedView bills={bills} onPayBill={onPayBill} />
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
