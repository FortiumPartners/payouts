/**
 * Bill control status component with progressive disclosure.
 * Shows a status dot with hover/click for details.
 */

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { ControlStatus, BillControlState } from '../hooks/useBillControls';
import { ControlResult } from '../lib/api';

interface StatusConfig {
  dot: string;
  text: string;
  textColor: string;
}

const statusConfigs: Record<ControlStatus, StatusConfig> = {
  unchecked: {
    dot: 'bg-gray-300',
    text: 'Pending',
    textColor: 'text-gray-500',
  },
  checking: {
    dot: 'bg-gray-400 animate-pulse',
    text: 'Checking...',
    textColor: 'text-gray-500',
  },
  ready: {
    dot: 'bg-green-500',
    text: 'Ready',
    textColor: 'text-green-600',
  },
  issues: {
    dot: 'bg-amber-500',
    text: 'Issues',
    textColor: 'text-amber-600',
  },
  error: {
    dot: 'bg-red-500',
    text: 'Error',
    textColor: 'text-red-600',
  },
};

interface BillControlStatusProps {
  state: BillControlState | undefined;
  onDetailsClick?: () => void;
}

export function BillControlStatus({ state, onDetailsClick }: BillControlStatusProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  const status = state?.status || 'unchecked';
  const config = statusConfigs[status];
  const failedCount = state?.failedCount || 0;

  // Build display text
  let displayText = config.text;
  if (status === 'issues' && failedCount > 0) {
    displayText = `${failedCount} ${failedCount === 1 ? 'issue' : 'issues'}`;
  }

  const isClickable = status === 'issues' || status === 'error';

  return (
    <div className="relative">
      <button
        className={`flex items-center gap-2 ${isClickable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
        onClick={isClickable ? onDetailsClick : undefined}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        type="button"
      >
        {/* Status dot */}
        <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />

        {/* Status text */}
        <span className={`text-sm font-medium ${config.textColor}`}>
          {displayText}
        </span>
      </button>

      {/* Tooltip for quick preview on hover */}
      {showTooltip && state && state.controls.length > 0 && (
        <ControlsTooltip controls={state.controls} status={status} />
      )}
    </div>
  );
}

interface ControlsTooltipProps {
  controls: ControlResult[];
  status: ControlStatus;
}

function ControlsTooltip({ controls, status }: ControlsTooltipProps) {
  // Only show failed controls in tooltip for brevity
  const failedControls = controls.filter(c => !c.passed);
  const passedCount = controls.filter(c => c.passed).length;

  if (status === 'ready') {
    return (
      <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-48">
        <div className="flex items-center gap-2 text-green-600">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">All {controls.length} controls passed</span>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute z-50 left-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-64 max-w-80">
      {/* Summary line */}
      <div className="text-xs text-gray-500 mb-2">
        {passedCount} passed, {failedControls.length} failed
      </div>

      {/* Failed controls list */}
      <div className="space-y-1.5">
        {failedControls.slice(0, 4).map((control) => (
          <div key={control.name} className="flex items-start gap-2">
            <X className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <span className="text-xs font-medium text-gray-900">
                {formatControlName(control.name)}
              </span>
              {control.reason && (
                <p className="text-xs text-gray-500 truncate" title={control.reason}>
                  {control.reason}
                </p>
              )}
            </div>
          </div>
        ))}
        {failedControls.length > 4 && (
          <div className="text-xs text-gray-400">
            +{failedControls.length - 4} more...
          </div>
        )}
      </div>

      {/* Click hint */}
      <div className="mt-2 pt-2 border-t text-xs text-gray-400">
        Click row to expand details
      </div>
    </div>
  );
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
    error: 'Error',
  };
  return nameMap[name] || name;
}
