import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { DollarSign, RefreshCw, LogOut, Loader2, AlertCircle, CheckCircle, Settings, History } from 'lucide-react';
import { PaymentHistoryPage } from './pages/PaymentHistoryPage';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useBills } from './hooks/useBills';
import { useBillControls } from './hooks/useBillControls';
import { BillsList, ViewModeToggle, ViewMode } from './components/BillsList';
import { PaymentConfirmationModal } from './components/PaymentConfirmationModal';
import { WiseRecipientsPage } from './components/WiseRecipientsPage';
import { IntegrationStatusPanel } from './components/IntegrationStatus';
import { Bill, api } from './lib/api';
import { useState } from 'react';

function Dashboard() {
  const { user, logout } = useAuth();
  const [statusFilter, setStatusFilter] = useState<'all' | 'ready' | 'pending'>('all');
  const [tenantFilter, setTenantFilter] = useState<'all' | 'US' | 'CA'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const { bills, summary, loading, error, refresh } = useBills({ status: statusFilter, tenant: tenantFilter });
  const { controlStates, isChecking, getBillWithControls } = useBillControls(bills);
  const [refreshing, setRefreshing] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<{
    loading: boolean;
    success: boolean | null;
    message: string | null;
    billId: string | null;
  }>({ loading: false, success: null, message: null, billId: null });
  const [pendingPaymentBill, setPendingPaymentBill] = useState<Bill | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handlePayBill = (bill: Bill) => {
    // Open confirmation modal instead of browser confirm
    setPendingPaymentBill(bill);
  };

  const handleConfirmPayment = async () => {
    const bill = pendingPaymentBill;
    if (!bill) return;

    setPendingPaymentBill(null);
    setPaymentStatus({ loading: true, success: null, message: null, billId: bill.uid });

    try {
      const result = await api.payBill(bill.uid);

      if (result.success) {
        setPaymentStatus({
          loading: false,
          success: true,
          message: result.message,
          billId: bill.uid,
        });
        // Refresh bills list after successful payment
        await refresh();
      } else {
        setPaymentStatus({
          loading: false,
          success: false,
          message: result.message,
          billId: bill.uid,
        });
      }
    } catch (err) {
      setPaymentStatus({
        loading: false,
        success: false,
        message: err instanceof Error ? err.message : 'Payment failed',
        billId: bill.uid,
      });
    }

    // Only auto-clear success messages after 5 seconds
    // Errors should stay visible until manually dismissed
    if (paymentStatus.success) {
      setTimeout(() => {
        setPaymentStatus({ loading: false, success: null, message: null, billId: null });
      }, 5000);
    }
  };

  const dismissPaymentStatus = () => {
    setPaymentStatus({ loading: false, success: null, message: null, billId: null });
  };

  const handleCancelPayment = () => {
    setPendingPaymentBill(null);
  };

  const formatAmount = (amount: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);

  // Get bills with latest control states applied
  const billsWithControls = bills.map(getBillWithControls);
  const readyCount = billsWithControls.filter((b) => b.readyToPay).length;
  const readyAmount = billsWithControls
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
            <Link
              to="/payment-history"
              className="flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-muted"
              title="View Payment History"
            >
              <History className="h-4 w-4" />
              Payment History
            </Link>
            <Link
              to="/wise-recipients"
              className="flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-muted"
              title="Manage Wise Recipients (Canada)"
            >
              <Settings className="h-4 w-4" />
              Wise Recipients
            </Link>
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
        {/* Payment status notification - FIXED position so always visible */}
        {(paymentStatus.message || paymentStatus.loading) && (
          <div className="fixed bottom-4 right-4 left-4 md:left-auto md:w-96 z-50">
            {paymentStatus.loading && (
              <div className="p-4 rounded-lg flex items-center gap-3 bg-blue-50 border border-blue-200 text-blue-800 shadow-lg">
                <Loader2 className="h-5 w-5 animate-spin flex-shrink-0" />
                <span>Processing payment...</span>
              </div>
            )}
            {paymentStatus.message && (
              <div
                className={`p-4 rounded-lg flex items-start gap-3 shadow-lg ${
                  paymentStatus.success
                    ? 'bg-green-50 border border-green-200 text-green-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {paymentStatus.success ? (
                  <CheckCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium">{paymentStatus.success ? 'Payment Successful' : 'Payment Failed'}</p>
                  <p className="text-sm mt-1 break-words">{paymentStatus.message}</p>
                </div>
                <button
                  onClick={dismissPaymentStatus}
                  className="flex-shrink-0 p-1 hover:bg-black/10 rounded"
                  title="Dismiss"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Ready to Pay</p>
            <p className="text-2xl font-bold">{readyCount}</p>
            <p className="text-sm text-muted-foreground">
              {formatAmount(readyAmount)}
            </p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">
              {isChecking ? 'Checking Controls...' : 'Pending Controls'}
            </p>
            <p className="text-2xl font-bold">{billsWithControls.length - readyCount}</p>
          </div>
          <div className="rounded-lg border bg-card p-6">
            <p className="text-sm text-muted-foreground">Total Bills</p>
            <p className="text-2xl font-bold">{summary?.total || 0}</p>
          </div>
        </div>

        {/* Integration Status */}
        <div className="mb-6">
          <IntegrationStatusPanel />
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-4 mb-4">
          {/* Status filter */}
          <div className="flex gap-2">
            <span className="self-center text-sm text-muted-foreground mr-1">Status:</span>
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
                {status === 'all' ? 'All' : status === 'ready' ? 'Ready' : 'Pending'}
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

          {/* View mode toggle */}
          <div className="ml-auto">
            <ViewModeToggle viewMode={viewMode} onChange={setViewMode} />
          </div>
        </div>

        {/* Bills table */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-6 py-4 flex items-center justify-between">
            <h2 className="font-semibold">Bills</h2>
            {isChecking && (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Checking controls...
              </span>
            )}
          </div>
          <BillsList
            bills={billsWithControls}
            loading={loading}
            error={error}
            viewMode={viewMode}
            controlStates={controlStates}
            onPayBill={handlePayBill}
          />
        </div>
      </main>

      {/* Payment confirmation modal */}
      <PaymentConfirmationModal
        bill={pendingPaymentBill}
        onConfirm={handleConfirmPayment}
        onCancel={handleCancelPayment}
      />
    </div>
  );
}

function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');

  const errorMessages: Record<string, string> = {
    oauth_failed: 'Google sign-in failed. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    no_code: 'Authorization failed. Please try again.',
    token_failed: 'Failed to complete sign-in. Please try again.',
    userinfo_failed: 'Failed to get user info. Please try again.',
    invalid_domain: 'Only @fortiumpartners.com accounts are allowed.',
    not_authorized: 'Your account is not authorized. Contact an administrator to be added.',
    auth_failed: 'Authentication failed. Please try again.',
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="rounded-lg border bg-card p-8 max-w-md w-full">
        <div className="flex items-center justify-center gap-2 mb-6">
          <DollarSign className="h-8 w-8" />
          <h1 className="text-2xl font-semibold">Fortium Payouts</h1>
        </div>
        {error && (
          <div className="mb-6 p-4 rounded-md bg-red-50 border border-red-200 text-red-800 text-sm">
            {errorMessages[error] || 'An error occurred. Please try again.'}
          </div>
        )}
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
        <Route
          path="/wise-recipients"
          element={
            <ProtectedRoute>
              <WiseRecipientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payment-history"
          element={
            <ProtectedRoute>
              <PaymentHistoryPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;
