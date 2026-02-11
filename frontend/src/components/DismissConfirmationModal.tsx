/**
 * Dismiss confirmation modal with required reason.
 */

import { useState, useEffect } from 'react';
import { X, AlertTriangle, User, Building2, DollarSign } from 'lucide-react';
import { Bill } from '../lib/api';

interface DismissConfirmationModalProps {
  bill: Bill | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function DismissConfirmationModal({
  bill,
  onConfirm,
  onCancel,
}: DismissConfirmationModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason('');
  }, [bill]);

  if (!bill) return null;

  const canConfirm = reason.trim().length > 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-amber-500 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-lg font-semibold">Dismiss Bill</h2>
          </div>
          <button
            onClick={onCancel}
            className="text-white/80 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            This bill will be removed from the active queue. You can restore it later from the Dismissed Bills section.
          </p>

          {/* Bill summary */}
          <div className="space-y-3 mb-4">
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
          </div>

          {/* Reason textarea */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Reason for dismissal <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Deleted in QBO, duplicate bill, no longer needed..."
              className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
              rows={3}
              autoFocus
            />
          </div>
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
            onClick={() => canConfirm && onConfirm(reason.trim())}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-md font-medium ${
              canConfirm
                ? 'bg-amber-500 text-white hover:bg-amber-600'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
            }`}
          >
            Dismiss Bill
          </button>
        </div>
      </div>
    </div>
  );
}
