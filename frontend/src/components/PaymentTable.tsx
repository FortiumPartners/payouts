/**
 * Payment history table component using PrimeReact DataTable.
 * Supports filtering, pagination, and expandable row details.
 */

import { useState, useEffect, useCallback } from 'react';
import { DataTable, DataTableExpandedRows, DataTablePageEvent, DataTableRowEvent } from 'primereact/datatable';
import { Column } from 'primereact/column';
import { Skeleton } from 'primereact/skeleton';
import { Message } from 'primereact/message';
import { Button } from 'primereact/button';
import { Tag } from 'primereact/tag';
import { api, PaymentHistoryItem, PaymentDetail } from '../lib/api';
import { PaymentDetailPanel } from './PaymentDetail';
import { PaymentFilterValues, FilterOption } from './PaymentFilters';

interface PaymentTableProps {
  filters: PaymentFilterValues;
  onFiltersLoaded?: (payees: FilterOption[], clients: FilterOption[]) => void;
}

export function PaymentTable({ filters, onFiltersLoaded }: PaymentTableProps) {
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [expandedRows, setExpandedRows] = useState<DataTableExpandedRows | PaymentHistoryItem[]>({});
  const [detailsCache, setDetailsCache] = useState<Record<string, PaymentDetail>>({});
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatCurrency = (amount: number, currency: 'USD' | 'CAD') => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
    }).format(amount);
  };

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: Parameters<typeof api.getPaymentHistory>[0] = {
        page,
        pageSize,
        tenant: filters.tenant,
      };

      // Date range
      if (filters.dateRange && Array.isArray(filters.dateRange) && filters.dateRange[0]) {
        params.startDate = filters.dateRange[0].toISOString().split('T')[0];
      }
      if (filters.dateRange && Array.isArray(filters.dateRange) && filters.dateRange[1]) {
        params.endDate = filters.dateRange[1].toISOString().split('T')[0];
      }

      // Multi-select filters
      if (filters.payeeIds.length > 0) {
        params.payeeIds = filters.payeeIds.join(',');
      }
      if (filters.clientIds.length > 0) {
        params.clientIds = filters.clientIds.join(',');
      }
      if (filters.paymentMethods.length > 0) {
        params.paymentMethod = filters.paymentMethods.join(',');
      }
      if (filters.statuses.length > 0) {
        params.status = filters.statuses.join(',');
      }

      // Amount range
      if (filters.minAmount !== undefined) {
        params.minAmount = filters.minAmount;
      }
      if (filters.maxAmount !== undefined) {
        params.maxAmount = filters.maxAmount;
      }

      const response = await api.getPaymentHistory(params);
      setPayments(response.payments);
      setTotalRecords(response.total);

      // Pass filter options up
      if (onFiltersLoaded) {
        onFiltersLoaded(response.filters.payees, response.filters.clients);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payments');
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize, onFiltersLoaded]);

  useEffect(() => {
    fetchPayments();
  }, [fetchPayments]);

  const onPageChange = (event: DataTablePageEvent) => {
    setPage((event.page ?? 0) + 1);
    setPageSize(event.rows);
  };

  const onRowExpand = async (event: DataTableRowEvent) => {
    const payment = event.data as PaymentHistoryItem;
    if (!detailsCache[payment.id]) {
      setLoadingDetail(payment.id);
      try {
        const detail = await api.getPaymentDetail(payment.id);
        setDetailsCache(prev => ({ ...prev, [payment.id]: detail }));
      } catch (err) {
        console.error('Failed to load payment detail:', err);
      } finally {
        setLoadingDetail(null);
      }
    }
  };

  const statusTemplate = (rowData: PaymentHistoryItem) => {
    const severity = rowData.status === 'paid' ? 'success' : rowData.status === 'pending' ? 'warning' : 'danger';
    return <Tag value={rowData.status.charAt(0).toUpperCase() + rowData.status.slice(1)} severity={severity} />;
  };

  const amountTemplate = (rowData: PaymentHistoryItem) => {
    return formatCurrency(rowData.amount, rowData.currency);
  };

  const dateTemplate = (rowData: PaymentHistoryItem) => {
    return formatDate(rowData.paidDate);
  };

  const rowExpansionTemplate = (data: PaymentHistoryItem) => {
    const detail = detailsCache[data.id];
    const isLoading = loadingDetail === data.id;

    if (isLoading) {
      return (
        <div className="p-4">
          <Skeleton height="6rem" />
        </div>
      );
    }

    if (!detail) {
      return (
        <div className="p-4 text-muted-foreground">
          Loading details...
        </div>
      );
    }

    return <PaymentDetailPanel detail={detail} />;
  };

  if (error) {
    return (
      <div className="rounded-lg border bg-card">
        <Message severity="error" text={error} className="w-full" />
        <div className="p-4">
          <Button label="Retry" icon="pi pi-refresh" onClick={fetchPayments} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      <DataTable
        value={payments}
        loading={loading}
        paginator
        lazy
        first={(page - 1) * pageSize}
        rows={pageSize}
        totalRecords={totalRecords}
        onPage={onPageChange}
        rowsPerPageOptions={[25, 50, 100]}
        expandedRows={expandedRows}
        onRowToggle={(e) => setExpandedRows(e.data)}
        onRowExpand={onRowExpand}
        rowExpansionTemplate={rowExpansionTemplate}
        dataKey="id"
        emptyMessage="No payments found"
        tableStyle={{ minWidth: '50rem' }}
      >
        <Column expander style={{ width: '3rem' }} />
        <Column field="paidDate" header="Date" body={dateTemplate} sortable style={{ width: '10rem' }} />
        <Column field="payeeName" header="Payee" sortable />
        <Column field="amount" header="Amount" body={amountTemplate} sortable style={{ width: '10rem' }} />
        <Column field="status" header="Status" body={statusTemplate} style={{ width: '8rem' }} />
      </DataTable>
    </div>
  );
}
