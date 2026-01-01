import { Routes, Route, Navigate } from 'react-router-dom';
import { DollarSign, RefreshCw, LogOut, Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useBills } from './hooks/useBills';
import { BillsList } from './components/BillsList';
import { Bill } from './lib/api';
import { useState } from 'react';

function Dashboard() {
  const { user, logout } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'pending'>('all');
  const { bills, summary, loading, error, refresh } = useBills({ status: statusFilter });
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handlePayBill = (bill: Bill) => {
    // TODO: Implement payment flow
    console.log('Pay bill:', bill.uid);
    alert(`Payment flow for ${bill.payeeName} - $${bill.amount.toFixed(2)} not yet implemented`);
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  const readyAmount = bills
    .filter((b) => b.readyToPay)
    .reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Fortium Payouts</h1>
          </div>
          <div className="flex items-center gap-4">
            {user && (
              <span className="text-sm text-muted-foreground">{user.email}</span>
            )}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-muted"
            >
              <LogOut className="h-4 w-4" />
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Ready to Pay</p>
            <p className="text-2xl font-bold">{summary?.readyToPay || 0}</p>
            <p className="text-sm text-muted-foreground">
              {formatAmount(readyAmount)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Pending Controls</p>
            <p className="text-2xl font-bold">{summary?.pending || 0}</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Bills</p>
            <p className="text-2xl font-bold">{summary?.total || 0}</p>
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-4">
          {(['all', 'ready', 'pending'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                statusFilter === status
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted hover:bg-muted/80'
              }`}
            >
              {status === 'all' ? 'All Bills' : status === 'ready' ? 'Ready to Pay' : 'Pending'}
            </button>
          ))}
        </div>

        {/* Bills table */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4">
            <h2 className="font-semibold">Bills</h2>
          </div>
          <BillsList
            bills={bills}
            loading={loading}
            error={error}
            onPayBill={handlePayBill}
          />
        </div>
      </main>
    </div>
  );
}

function Login() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="rounded-lg border bg-card p-8 max-w-md w-full">
        <div className="flex items-center justify-center gap-2 mb-6">
          <DollarSign className="h-8 w-8" />
          <h1 className="text-2xl font-semibold">Fortium Payouts</h1>
        </div>
        <p className="text-center text-muted-foreground mb-6">
          Sign in with your Fortium Partners Google account.
        </p>
        <a
          href="/auth/login"
          className="block w-full text-center px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
        >
          Sign in with Google
        </a>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
