import { Calendar } from 'primereact/calendar';
import { MultiSelect, MultiSelectChangeEvent } from 'primereact/multiselect';
import { Dropdown, DropdownChangeEvent } from 'primereact/dropdown';
import { InputNumber, InputNumberValueChangeEvent } from 'primereact/inputnumber';
import { Button } from 'primereact/button';

export interface FilterOption {
  id: string;
  name: string;
}

export interface PaymentFilterValues {
  dateRange: [Date | null, Date | null] | null;
  payeeIds: string[];
  clientIds: string[];
  tenant: 'US' | 'CA' | 'all';
  paymentMethods: string[];
  statuses: string[];
  minAmount: number | undefined;
  maxAmount: number | undefined;
}

interface PaymentFiltersProps {
  filters: PaymentFilterValues;
  onChange: (filters: PaymentFilterValues) => void;
  onApply: () => void;
  onClear: () => void;
  payeeOptions?: FilterOption[];
  clientOptions?: FilterOption[];
  loading?: boolean;
}

const tenantOptions = [
  { label: 'All', value: 'all' },
  { label: 'US', value: 'US' },
  { label: 'Canada', value: 'CA' },
];

const paymentMethodOptions = [
  { label: 'Bill.com', value: 'bill_com' },
  { label: 'Wise', value: 'wise' },
];

const statusOptions = [
  { label: 'Paid', value: 'paid' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
];

export function PaymentFilters({
  filters,
  onChange,
  onApply,
  onClear,
  payeeOptions = [],
  clientOptions = [],
  loading = false,
}: PaymentFiltersProps) {
  const updateFilter = <K extends keyof PaymentFilterValues>(
    key: K,
    value: PaymentFilterValues[K]
  ) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Date Range */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Date Range</label>
          <Calendar
            value={filters.dateRange}
            onChange={(e) => {
              const value = e.value as [Date | null, Date | null] | null;
              updateFilter('dateRange', value);
            }}
            selectionMode="range"
            readOnlyInput
            placeholder="Select date range"
            className="w-full"
            showIcon
            dateFormat="yy-mm-dd"
          />
        </div>

        {/* Payee */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Payee</label>
          <MultiSelect
            value={filters.payeeIds}
            onChange={(e: MultiSelectChangeEvent) => updateFilter('payeeIds', e.value)}
            options={payeeOptions.map(p => ({ label: p.name, value: p.id }))}
            placeholder="All Payees"
            className="w-full"
            filter
            showClear
            disabled={payeeOptions.length === 0}
          />
        </div>

        {/* Client */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Client</label>
          <MultiSelect
            value={filters.clientIds}
            onChange={(e: MultiSelectChangeEvent) => updateFilter('clientIds', e.value)}
            options={clientOptions.map(c => ({ label: c.name, value: c.id }))}
            placeholder="All Clients"
            className="w-full"
            filter
            showClear
            disabled={clientOptions.length === 0}
          />
        </div>

        {/* Tenant */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Tenant</label>
          <Dropdown
            value={filters.tenant}
            onChange={(e: DropdownChangeEvent) => updateFilter('tenant', e.value)}
            options={tenantOptions}
            placeholder="All"
            className="w-full"
          />
        </div>

        {/* Payment Method */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Payment Method</label>
          <MultiSelect
            value={filters.paymentMethods}
            onChange={(e: MultiSelectChangeEvent) => updateFilter('paymentMethods', e.value)}
            options={paymentMethodOptions}
            placeholder="All Methods"
            className="w-full"
            showClear
          />
        </div>

        {/* Amount Range */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Min Amount</label>
          <InputNumber
            value={filters.minAmount}
            onValueChange={(e: InputNumberValueChangeEvent) => updateFilter('minAmount', e.value ?? undefined)}
            mode="currency"
            currency="USD"
            placeholder="Min"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Max Amount</label>
          <InputNumber
            value={filters.maxAmount}
            onValueChange={(e: InputNumberValueChangeEvent) => updateFilter('maxAmount', e.value ?? undefined)}
            mode="currency"
            currency="USD"
            placeholder="Max"
            className="w-full"
          />
        </div>

        {/* Status */}
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-muted-foreground">Status</label>
          <MultiSelect
            value={filters.statuses}
            onChange={(e: MultiSelectChangeEvent) => updateFilter('statuses', e.value)}
            options={statusOptions}
            placeholder="All Statuses"
            className="w-full"
            showClear
          />
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex justify-end gap-2 mt-4">
        <Button
          label="Clear"
          icon="pi pi-times"
          severity="secondary"
          outlined
          onClick={onClear}
          disabled={loading}
        />
        <Button
          label="Apply"
          icon="pi pi-check"
          onClick={onApply}
          loading={loading}
        />
      </div>
    </div>
  );
}
