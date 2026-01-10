/**
 * Hook for lazy parallel fetching of bill controls.
 * Automatically fetches controls for all bills after initial load.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Bill, ControlResult } from '../lib/api';

export type ControlStatus = 'unchecked' | 'checking' | 'ready' | 'issues' | 'error';

export interface BillControlState {
  status: ControlStatus;
  controls: ControlResult[];
  readyToPay: boolean;
  failedCount: number;
}

interface UseBillControlsResult {
  controlStates: Map<string, BillControlState>;
  isChecking: boolean;
  checkControls: (billIds: string[]) => Promise<void>;
  getBillWithControls: (bill: Bill) => Bill;
}

const BATCH_SIZE = 10; // Check 10 bills at a time

export function useBillControls(bills: Bill[]): UseBillControlsResult {
  const [controlStates, setControlStates] = useState<Map<string, BillControlState>>(new Map());
  const [isChecking, setIsChecking] = useState(false);
  const checkedRef = useRef<Set<string>>(new Set());

  // Check controls for a batch of bills
  const checkControls = useCallback(async (billIds: string[]) => {
    if (billIds.length === 0) return;

    // Mark as checking
    setControlStates(prev => {
      const next = new Map(prev);
      billIds.forEach(id => {
        next.set(id, {
          status: 'checking',
          controls: [],
          readyToPay: false,
          failedCount: 0,
        });
      });
      return next;
    });

    try {
      const response = await api.checkBillControls(billIds);

      setControlStates(prev => {
        const next = new Map(prev);
        Object.entries(response.results).forEach(([billId, result]) => {
          const failedCount = result.controls.filter(c => !c.passed).length;
          const hasError = result.controls.some(c => c.name === 'error');

          next.set(billId, {
            status: hasError ? 'error' : result.readyToPay ? 'ready' : 'issues',
            controls: result.controls,
            readyToPay: result.readyToPay,
            failedCount,
          });
        });
        return next;
      });
    } catch (err) {
      // Mark all as error
      setControlStates(prev => {
        const next = new Map(prev);
        billIds.forEach(id => {
          next.set(id, {
            status: 'error',
            controls: [{ name: 'error', passed: false, reason: 'Failed to check controls' }],
            readyToPay: false,
            failedCount: 1,
          });
        });
        return next;
      });
    }
  }, []);

  // Auto-check controls when bills change
  useEffect(() => {
    if (bills.length === 0) return;

    // Find bills that haven't been checked yet
    const uncheckedBillIds = bills
      .filter(b => !checkedRef.current.has(b.uid))
      .map(b => b.uid);

    if (uncheckedBillIds.length === 0) return;

    // Mark as checked to prevent duplicate requests
    uncheckedBillIds.forEach(id => checkedRef.current.add(id));

    // Check in batches
    const checkInBatches = async () => {
      setIsChecking(true);

      for (let i = 0; i < uncheckedBillIds.length; i += BATCH_SIZE) {
        const batch = uncheckedBillIds.slice(i, i + BATCH_SIZE);
        await checkControls(batch);
      }

      setIsChecking(false);
    };

    checkInBatches();
  }, [bills, checkControls]);

  // Get a bill with its controls applied
  const getBillWithControls = useCallback((bill: Bill): Bill => {
    const state = controlStates.get(bill.uid);
    if (!state || state.status === 'unchecked' || state.status === 'checking') {
      return bill;
    }
    return {
      ...bill,
      controls: state.controls,
      readyToPay: state.readyToPay,
    };
  }, [controlStates]);

  return {
    controlStates,
    isChecking,
    checkControls,
    getBillWithControls,
  };
}
