/**
 * Payment confirmation modal with bill details and type-to-confirm for large amounts.
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, DollarSign, Building2, User, FileText, Wallet } from 'lucide-react';
import { Bill, WiseBalance, api } from '../lib/api';

// Amount threshold for type-to-confirm (in dollars)
const TYPE_CONFIRM_THRESHOLD = 1000;

interface PaymentConfirmationModalProps {
  bill: Bill | null;
  onConfirm: () => void;
  onCancel: () => void;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function PaymentConfirmationModal({
  bill,
  onConfirm,
  onCancel,
}: PaymentConfirmationModalProps) {
  const [confirmText, setConfirmText] = useState('');
  const [wiseBalances, setWiseBalances] = useState<WiseBalance[]>([]);
  const [loadingBalance, setLoadingBalance] = useState(false);

  // Reset confirmation text when modal opens/closes
  useEffect(() => {
    setConfirmText('');
  }, [bill]);

  // Fetch Wise balance when modal opens for CA bills
  useEffect(() => {
    if (bill?.tenantCode === 'CA') {
      setLoadingBalance(true);
      api.getWiseBalance()
        .then(({ balances }) => setWiseBalances(balances))
        .catch((err) => console.error('Failed to fetch Wise balance:', err))
        .finally(() => setLoadingBalance(false));
    }
  }, [bill]);

  if (!bill) return null;

  const requiresTypeConfirm = bill.amount >= TYPE_CONFIRM_THRESHOLD;
  const expectedConfirmText = 'PAY';
  const canConfirm = !requiresTypeConfirm || confirmText === expectedConfirmText;

  const handleConfirm = () => {
    if (canConfirm) {
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-primary px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-primary-foreground">
            <DollarSign className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Confirm Payment</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-primary-foreground/80 hover:text-primary-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Warning for large amounts */}
          {requiresTypeConfirm && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-medium">Large Payment Warning</p>
                <p>This payment exceeds ${TYPE_CONFIRM_THRESHOLD.toLocaleString()}. Type <strong>PAY</strong> to confirm.</p>
              </div>
            </div>
          )}

          {/* Bill details */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Payee</p>
                <p className="font-medium">{bill.payeeName}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="font-medium">{bill.clientName || '-'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <DollarSign className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-medium text-lg">{formatAmount(bill.amount)}</p>
              </div>
            </div>

            {bill.description && (
              <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                <FileText className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs text-muted-foreground">Description</p>
                  <p className="text-sm">{bill.description}</p>
                </div>
              </div>
            )}

            {/* Reference numbers */}
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
              <p>QBO Invoice: <span className="font-mono">{bill.qboInvoiceNum || '-'}</span></p>
              <p>QBO Bill: <span className="font-mono">{bill.qboBillNum || '-'}</span></p>
              {bill.tenantCode === 'US' && (
                <p>Bill.com: <span className="font-mono">{bill.billComId || 'Pending'}</span></p>
              )}
            </div>
          </div>

          {/* Payment method notice */}
          <div className={`mt-4 p-3 rounded-lg text-sm ${
            bill.tenantCode === 'CA'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-blue-50 border border-blue-200 text-blue-800'
          }`}>
            This payment will be processed via{' '}
            <strong>{bill.tenantCode === 'CA' ? 'Wise' : 'Bill.com'}</strong>.
          </div>

          {/* Wise balance for CA bills */}
          {bill.tenantCode === 'CA' && (() => {
            const cadBalance = wiseBalances.find(b => b.currency === 'CAD');
            const available = cadBalance ? cadBalance.amount - cadBalance.reserved : 0;
            const isInsufficient = !loadingBalance && cadBalance && available < bill.amount;

            return (
              <>
                {isInsufficient && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-red-800">
                      <p className="font-medium">Insufficient Balance</p>
                      <p>
                        CAD {available.toFixed(2)} available, but {formatAmount(bill.amount)} required.
                        Payment may fail.
                      </p>
                    </div>
                  </div>
                )}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Wallet className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Wise Balance</span>
                  </div>
                  {loadingBalance ? (
                    <div className="text-sm text-muted-foreground">Loading...</div>
                  ) : wiseBalances.length > 0 ? (
                    <div className="flex gap-4">
                      {wiseBalances.map((b) => (
                        <div key={b.currency} className="text-sm">
                          <span className="font-medium">
                            {new Intl.NumberFormat('en-US', {
                              style: 'currency',
                              currency: b.currency,
                            }).format(b.amount)}
                          </span>
                          <span className="text-muted-foreground ml-1">{b.currency}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">Unable to load balance</div>
                  )}
                </div>
              </>
            );
          })()}

          {/* Type-to-confirm input for large amounts */}
          {requiresTypeConfirm && (
            <div className="mt-4">
              <label className="block text-sm font-medium mb-2">
                Type <span className="font-mono bg-muted px-1 rounded">PAY</span> to confirm:
              </label>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value.toUpperCase())}
                placeholder="Type PAY"
                className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                autoFocus
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted/30 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-md border hover:bg-muted"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-md font-medium ${
              canConfirm
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            Confirm Payment
          </button>
        </div>
      </div>
    </div>
  );
}
