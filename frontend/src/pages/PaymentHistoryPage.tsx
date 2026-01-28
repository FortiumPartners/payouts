import { useState } from 'react';
import { Link } from 'react-router-dom';
import { DollarSign, ArrowLeft } from 'lucide-react';
import { PaymentFilters, PaymentFilterValues } from '../components/PaymentFilters';
import { PaymentTable } from '../components/PaymentTable';

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

export function PaymentHistoryPage() {
  const [filters, setFilters] = useState<PaymentFilterValues>(defaultFilters);
  const [appliedFilters, setAppliedFilters] = useState<PaymentFilterValues>(defaultFilters);

  const handleApplyFilters = () => {
    setAppliedFilters({ ...filters });
  };

  const handleClearFilters = () => {
    setFilters(defaultFilters);
    setAppliedFilters(defaultFilters);
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
        {/* Filters */}
        <PaymentFilters
          filters={filters}
          onChange={setFilters}
          onApply={handleApplyFilters}
          onClear={handleClearFilters}
        />

        {/* Table */}
        <div className="mt-6">
          <PaymentTable filters={appliedFilters} />
        </div>
      </main>
    </div>
  );
}
