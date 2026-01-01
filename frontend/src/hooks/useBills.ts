/**
 * Hook for fetching bills data.
 */

import { useState, useEffect, useCallback } from 'react';
import { api, Bill, BillsResponse } from '../lib/api';

interface UseBillsOptions {
  tenant?: 'US' | 'CA' | 'all';
  status?: 'ready' | 'pending' | 'all';
}

interface UseBillsResult {
  bills: Bill[];
  summary: BillsResponse['summary'] | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useBills(options: UseBillsOptions = {}): UseBillsResult {
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<BillsResponse['summary'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchBills = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await api.getBills(options);
      setBills(response.bills);
      setSummary(response.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch bills');
    } finally {
      setLoading(false);
    }
  }, [options.tenant, options.status]);

  useEffect(() => {
    fetchBills();
  }, [fetchBills]);

  return {
    bills,
    summary,
    loading,
    error,
    refresh: fetchBills,
  };
}
