/**
 * Payment History page.
 * Shows payment history with filters, search, summary stats, and CSV export.
 */

import { useState, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, ArrowLeft, Search, Download } from 'lucide-react';
import { PaymentFilters, PaymentFilterValues } from '../components/PaymentFilters';
import { PaymentTable } from '../components/PaymentTable';
import { PaymentHistoryItem } from '../lib/api';

// Default filter values
const defaultFilters: PaymentFilterValues = {
  dateRange: null,
  payeeIds: [],
  clientIds: [],
  tenant: 'all',
  paymentMethods: [],
  minAmount: undefined,
  maxAmount: undefined,
  statuses: [],
};

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function exportToCsv(payments: PaymentHistoryItem[]) {
  const headers = ['Date', 'Payee', 'Client', 'Tenant', 'Method', 'Amount', 'Currency', 'Status'];
  const rows = payments.map((p) => [
    p.paidDate || '',
    `"${p.payeeName.replace(/"/g, '""')}"`,
    `"${p.clientName.replace(/"/g, '""')}"`,
    p.tenantCode,
    p.paymentMethod,
    p.amount.toString(),
    p.currency,
    p.status,
  ]);

  const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `payment-history-${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function PaymentHistoryPage() {
  const [filters, setFilters] = useState<PaymentFilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<PaymentFilterValues>(defaultFilters);
  const [searchText, setSearchText] = useState('');
  const [currentPayments, setCurrentPayments] = useState<PaymentHistoryItem[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
  };

  const handlePaymentsLoaded = useCallback((payments: PaymentHistoryItem[], total: number) => {
    setCurrentPayments(payments);
    setTotalRecords(total);
  }, []);

  // Summary stats from current page of payments
  const stats = useMemo(() => {
    if (currentPayments.length === 0) {
      return { count: 0, totalAmount: 0, avgAmount: 0 };
    }
    const totalAmount = currentPayments.reduce((sum, p) => sum + p.amount, 0);
    return {
      count: totalRecords,
      totalAmount,
      avgAmount: totalAmount / currentPayments.length,
    };
  }, [currentPayments, totalRecords]);

  const handleExport = () => {
    if (currentPayments.length === 0) return;
    exportToCsv(currentPayments);
  };

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
              <h1 className="text-xl font-semibold">Payment History</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {/* Search + Export bar */}
        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search by partner name, client, or reference..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-md border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <button
            onClick={handleExport}
            disabled={currentPayments.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total Payments</p>
            <p className="text-2xl font-bold">{stats.count}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Total Amount (page)</p>
            <p className="text-2xl font-bold">{formatAmount(stats.totalAmount)}</p>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <p className="text-sm text-muted-foreground">Avg Payment (page)</p>
            <p className="text-2xl font-bold">{formatAmount(stats.avgAmount)}</p>
          </div>
        </div>

        {/* Filters */}
        <PaymentFilters
          filters={filters}
          onChange={setFilters}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        />

        {/* Table */}
        <div className="mt-6">
          <PaymentTable
            filters={appliedFilters}
            onPaymentsLoaded={handlePaymentsLoaded}
            globalFilter={searchText}
          />
        </div>
      </main>
    </div>
  );
}
