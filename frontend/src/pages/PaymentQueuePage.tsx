/**
 * Payment Queue page.
 * Shows summary stats and a unified queue of bills in various stages:
 * pending controls, validated, processing, paid, and failed.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DollarSign,
  ArrowLeft,
  RefreshCw,
  Loader2,
  Search,
  Clock,
  CheckCircle,
  CreditCard,
  AlertCircle,
} from 'lucide-react';
import { api, Bill } from '../lib/api';

type QueueStatus = 'all' | 'pending' | 'validated' | 'processing' | 'paid';
type TenantFilter = 'all' | 'US' | 'CA';

interface QueueItem {
  id: string;
  tenant: 'US' | 'CA';
  clientName: string;
  payeeName: string;
  amount: number;
  status: 'pending' | 'validated' | 'processing' | 'paid' | 'failed';
  dateAdded: string;
  source: 'bill' | 'payment';
  billComStatus?: string | null;
  paymentRecordId?: string | null;
}

interface DashboardStats {
  pendingCount: number;
  validatedCount: number;
  paidThisMonth: number;
  pendingAmount: number;
}

const statusBadgeClasses: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  validated: 'bg-green-100 text-green-800',
  processing: 'bg-blue-100 text-blue-800',
  paid: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
  scheduled: 'bg-sky-100 text-sky-800',
};

const statusLabels: Record<string, string> = {
  pending: 'Pending',
  validated: 'Validated',
  processing: 'Processing',
  paid: 'Paid',
  failed: 'Failed',
  scheduled: 'Scheduled',
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

type SortField = 'tenant' | 'clientName' | 'payeeName' | 'amount' | 'status' | 'dateAdded';
type SortDir = 'asc' | 'desc';

export function PaymentQueuePage() {
  const navigate = useNavigate();

  const [bills, setBills] = useState<Bill[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [executingBillId, setExecutingBillId] = useState<string | null>(null);
  const [executeResult, setExecuteResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<QueueStatus>('all');
  const [tenantFilter, setTenantFilter] = useState<TenantFilter>('all');
  const [searchText, setSearchText] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<SortField>('amount');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const fetchData = useCallback(async () => {
    setError(null);
    try {
      const [billsResponse, dashStats] = await Promise.all([
        api.getBills({ status: 'all', tenant: 'all' }),
        api.getDashboardStats(),
      ]);
      setBills(billsResponse.bills);
      setStats(dashStats);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleExecutePayment = async (billId: string) => {
    setExecutingBillId(billId);
    setExecuteResult(null);
    try {
      const result = await api.executePayment(billId);
      setExecuteResult({ success: result.success, message: result.message });
      // Refresh queue after execution
      await fetchData();
    } catch (err) {
      setExecuteResult({
        success: false,
        message: err instanceof Error ? err.message : 'Payment execution failed',
      });
    } finally {
      setExecutingBillId(null);
      // Auto-clear success messages
      setTimeout(() => setExecuteResult(null), 5000);
    }
  };

  // Build unified queue items from bills
  const queueItems: QueueItem[] = useMemo(() => {
    return bills.map((bill): QueueItem => ({
      id: bill.uid,
      tenant: bill.tenantCode,
      clientName: bill.clientName || '-',
      payeeName: bill.payeeName,
      amount: bill.amount,
      status: bill.readyToPay ? 'validated' : 'pending',
      dateAdded: new Date().toISOString(), // Bills don't have a created date exposed
      source: 'bill',
    }));
  }, [bills]);

  // Filter and sort
  const filteredItems = useMemo(() => {
    let items = [...queueItems];

    // Status filter
    if (statusFilter !== 'all') {
      items = items.filter((item) => item.status === statusFilter);
    }

    // Tenant filter
    if (tenantFilter !== 'all') {
      items = items.filter((item) => item.tenant === tenantFilter);
    }

    // Search text
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      items = items.filter(
        (item) =>
          item.payeeName.toLowerCase().includes(search) ||
          item.clientName.toLowerCase().includes(search)
      );
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'tenant':
          cmp = a.tenant.localeCompare(b.tenant);
          break;
        case 'clientName':
          cmp = a.clientName.localeCompare(b.clientName);
          break;
        case 'payeeName':
          cmp = a.payeeName.localeCompare(b.payeeName);
          break;
        case 'amount':
          cmp = a.amount - b.amount;
          break;
        case 'status':
          cmp = a.status.localeCompare(b.status);
          break;
        case 'dateAdded':
          cmp = a.dateAdded.localeCompare(b.dateAdded);
          break;
      }
      return sortDir === 'asc' ? cmp : -cmp;
    });

    return items;
  }, [queueItems, statusFilter, tenantFilter, searchText, sortField, sortDir]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const SortHeader = ({ field, label, align }: { field: SortField; label: string; align?: string }) => (
    <th
      className={`px-4 py-3 text-sm font-medium cursor-pointer hover:bg-muted/80 select-none ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => handleSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortField === field && (
          <span className="text-xs">{sortDir === 'asc' ? '\u25B2' : '\u25BC'}</span>
        )}
      </span>
    </th>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <DollarSign className="h-6 w-6" />
              <h1 className="text-xl font-semibold">Payment Queue</h1>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <AlertCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
            <p className="text-red-600">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-4 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-amber-100">
                    <Clock className="h-5 w-5 text-amber-700" />
                  </div>
                  <p className="text-sm text-muted-foreground">Total Pending</p>
                </div>
                <p className="text-2xl font-bold">{stats?.pendingCount ?? 0}</p>
              </div>

              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-green-100">
                    <CheckCircle className="h-5 w-5 text-green-700" />
                  </div>
                  <p className="text-sm text-muted-foreground">Total Validated</p>
                </div>
                <p className="text-2xl font-bold">{stats?.validatedCount ?? 0}</p>
              </div>

              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-blue-100">
                    <CreditCard className="h-5 w-5 text-blue-700" />
                  </div>
                  <p className="text-sm text-muted-foreground">Paid This Month</p>
                </div>
                <p className="text-2xl font-bold">{stats?.paidThisMonth ?? 0}</p>
              </div>

              <div className="rounded-lg border bg-card p-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-md bg-purple-100">
                    <DollarSign className="h-5 w-5 text-purple-700" />
                  </div>
                  <p className="text-sm text-muted-foreground">Pending Amount</p>
                </div>
                <p className="text-2xl font-bold">{formatAmount(stats?.pendingAmount ?? 0)}</p>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4 mb-4">
              {/* Status filter */}
              <div className="flex gap-2">
                <span className="self-center text-sm text-muted-foreground mr-1">Status:</span>
                {(['all', 'pending', 'validated', 'processing', 'paid'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      statusFilter === s
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {/* Tenant filter */}
              <div className="flex gap-2">
                <span className="self-center text-sm text-muted-foreground mr-1">Tenant:</span>
                {(['all', 'US', 'CA'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTenantFilter(t)}
                    className={`px-4 py-2 rounded-md text-sm font-medium ${
                      tenantFilter === t
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80'
                    }`}
                  >
                    {t === 'all' ? 'All' : t}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="flex-1 min-w-[200px] relative">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search by partner or client name..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {/* Execution result notification */}
            {executeResult && (
              <div className={`mb-4 p-4 rounded-lg flex items-center gap-3 ${
                executeResult.success
                  ? 'bg-green-50 border border-green-200 text-green-800'
                  : 'bg-red-50 border border-red-200 text-red-800'
              }`}>
                {executeResult.success ? (
                  <CheckCircle className="h-5 w-5 flex-shrink-0" />
                ) : (
                  <AlertCircle className="h-5 w-5 flex-shrink-0" />
                )}
                <span className="text-sm">{executeResult.message}</span>
                <button
                  onClick={() => setExecuteResult(null)}
                  className="ml-auto p-1 hover:bg-black/10 rounded"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}

            {/* Queue Table */}
            <div className="rounded-lg border bg-card">
              <div className="border-b px-6 py-4 flex items-center justify-between">
                <h2 className="font-semibold">
                  Queue ({filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'})
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <SortHeader field="tenant" label="Tenant" />
                      <SortHeader field="clientName" label="Client" />
                      <SortHeader field="payeeName" label="Payee" />
                      <SortHeader field="amount" label="Amount" align="right" />
                      <SortHeader field="status" label="Status" />
                      <th className="px-4 py-3 text-left text-sm font-medium">Payment</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                          No items match your filters.
                        </td>
                      </tr>
                    ) : (
                      filteredItems.map((item) => (
                        <tr
                          key={item.id}
                          className="border-b hover:bg-muted/50 cursor-pointer"
                          onClick={() => navigate(`/payments/${item.id}`)}
                        >
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-1 rounded font-medium ${
                                item.tenant === 'US'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-purple-100 text-purple-800'
                              }`}
                            >
                              {item.tenant}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm">{item.clientName}</td>
                          <td className="px-4 py-3 text-sm">{item.payeeName}</td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatAmount(item.amount)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`text-xs px-2 py-1 rounded font-medium ${statusBadgeClasses[item.status] || 'bg-gray-100 text-gray-600'}`}
                            >
                              {statusLabels[item.status] || item.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {item.billComStatus ? (
                              <span className={`text-xs px-2 py-1 rounded font-medium ${statusBadgeClasses[item.billComStatus] || 'bg-gray-100 text-gray-600'}`}>
                                {statusLabels[item.billComStatus] || item.billComStatus}
                              </span>
                            ) : item.tenant === 'US' ? (
                              <span className="text-xs text-muted-foreground">Bill.com</span>
                            ) : (
                              <span className="text-xs text-muted-foreground">Wise</span>
                            )}
                          </td>
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            {item.status === 'validated' && item.tenant === 'US' && (
                              <button
                                onClick={() => handleExecutePayment(item.id)}
                                disabled={executingBillId === item.id}
                                className="flex items-center gap-1 px-3 py-1 rounded text-xs font-medium bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50 disabled:cursor-wait"
                              >
                                {executingBillId === item.id ? (
                                  <>
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    Executing...
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="h-3 w-3" />
                                    Execute
                                  </>
                                )}
                              </button>
                            )}
                            {item.status === 'processing' && (
                              <span className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Processing
                              </span>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
