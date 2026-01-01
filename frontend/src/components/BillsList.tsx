/**
 * Bills list component with control status display.
 */

import { useState } from 'react';
import { Check, X, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { Bill } from '../lib/api';

interface BillsListProps {
  bills: Bill[];
  loading: boolean;
  error: string | null;
  onPayBill?: (bill: Bill) => void;
}

function ControlIcon({ passed }: { passed: boolean }) {
  return passed ? (
    <Check className="h-4 w-4 text-green-600" />
  ) : (
    <X className="h-4 w-4 text-red-600" />
  );
}

function ControlBadges({ controls }: { controls: Bill['controls'] }) {
  return (
    <div className="flex gap-1">
      {controls.map((control) => (
        <div
          key={control.name}
          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
            control.passed
              ? 'bg-green-100 text-green-800'
              : 'bg-red-100 text-red-800'
          }`}
          title={control.reason || control.name}
        >
          <ControlIcon passed={control.passed} />
          <span className="ml-1">{formatControlName(control.name)}</span>
        </div>
      ))}
    </div>
  );
}

function formatControlName(name: string): string {
  const names: Record<string, string> = {
    invoicePaid: 'Paid',
    invoiceNotVoided: 'Not Voided',
    payeeExists: 'Payee',
    provingPeriod: 'Proving',
    amountValid: 'Amount',
  };
  return names[name] || name;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function BillRow({
  bill,
  onPay,
}: {
  bill: Bill;
  onPay?: (bill: Bill) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="border-b hover:bg-muted/50">
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
        <td className="px-4 py-3 font-mono text-sm">{bill.uid.slice(0, 8)}</td>
        <td className="px-4 py-3">{bill.clientName}</td>
        <td className="px-4 py-3">{bill.payeeName}</td>
        <td className="px-4 py-3">{bill.description}</td>
        <td className="px-4 py-3 text-right font-medium">
          {formatAmount(bill.amount)}
        </td>
        <td className="px-4 py-3">
          <ControlBadges controls={bill.controls} />
        </td>
        <td className="px-4 py-3">
          {bill.readyToPay ? (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
              Ready
            </span>
          ) : (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
              Pending
            </span>
          )}
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
          >
            Pay
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-muted/30">
          <td colSpan={9} className="px-4 py-4">
            <div className="grid grid-cols-2 gap-4">
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
                    <dd className="inline font-mono">{bill.uid}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground inline">Status: </dt>
                    <dd className="inline">{bill.status}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export function BillsList({ bills, loading, error, onPayBill }: BillsListProps) {
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
      <table className="w-full">
        <thead className="bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left w-10"></th>
            <th className="px-4 py-3 text-left text-sm font-medium">ID</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Client</th>
            <th className="px-4 py-3 text-left text-sm font-medium">Payee</th>
            <th className="px-4 py-3 text-left text-sm font-medium">
              Description
            </th>
            <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
            <th className="px-4 py-3 text-left text-sm font-medium">
              Controls
            </th>
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
    </div>
  );
}
