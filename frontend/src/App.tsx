import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { DollarSign, RefreshCw, LogOut, Loader2, AlertCircle, CheckCircle, Settings, History, ChevronUp, ChevronDown } from 'lucide-react';
import { PaymentHistoryPage } from './pages/PaymentHistoryPage';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useBills } from './hooks/useBills';
import { useBillControls } from './hooks/useBillControls';
import { BillsList, ViewModeToggle, ViewMode } from './components/BillsList';
import { PaymentConfirmationModal } from './components/PaymentConfirmationModal';
import { WiseRecipientsPage } from './components/WiseRecipientsPage';
import { IntegrationStatusPanel } from './components/IntegrationStatus';
import { DismissConfirmationModal } from './components/DismissConfirmationModal';
import { Bill, DismissedBill, api, getAuthUrl } from './lib/api';
import { useState, useEffect } from 'react';

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
  const [pendingDismissBill, setPendingDismissBill] = useState<Bill | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissedBills, setDismissedBills] = useState<DismissedBill[]>([]);
  const [apiStartedAt, setApiStartedAt] = useState<string | null>(null);

  const loadDismissedBills = async () => {
    try {
      const result = await api.getDismissedBills();
      setDismissedBills(result.dismissed);
    } catch {
      // Silently fail — dismissed bills are secondary
    }
  };

  useEffect(() => {
    loadDismissedBills();
    fetch('/api/health').then(r => r.json()).then(d => setApiStartedAt(d.startedAt)).catch(() => {});
  }, []);

  const handleDismissBill = (bill: Bill) => {
    setPendingDismissBill(bill);
  };

  const handleConfirmDismiss = async (reason: string) => {
    const bill = pendingDismissBill;
    if (!bill) return;
    setPendingDismissBill(null);

    try {
      await api.dismissBill(bill.uid, { reason });
      await refresh();
      await loadDismissedBills();
    } catch (err) {
      setPaymentStatus({
        loading: false,
        success: false,
        message: err instanceof Error ? err.message : 'Failed to dismiss bill',
        billId: bill.uid,
      });
    }
  };

  const handleRestoreBill = async (pcBillId: string) => {
    try {
      await api.restoreBill(pcBillId);
      await refresh();
      await loadDismissedBills();
    } catch (err) {
      setPaymentStatus({
        loading: false,
        success: false,
        message: err instanceof Error ? err.message : 'Failed to restore bill',
        billId: pcBillId,
      });
    }
  };

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
              <span className="text-sm text-muted-foreground">{user.name || user.email}</span>
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
            onDismissBill={handleDismissBill}
          />
        </div>

        {/* Dismissed Bills Section */}
        {dismissedBills.length > 0 && (
          <div className="rounded-lg border bg-card mt-6">
            <button
              onClick={() => setShowDismissed(!showDismissed)}
              className="w-full border-b px-6 py-4 flex items-center justify-between hover:bg-muted/50"
            >
              <h2 className="font-semibold text-muted-foreground">
                Dismissed Bills ({dismissedBills.length})
              </h2>
              {showDismissed ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showDismissed && (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-medium">Tenant</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Client</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Payee</th>
                      <th className="px-4 py-3 text-right text-sm font-medium">Amount</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Reason</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Dismissed By</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Date</th>
                      <th className="px-4 py-3 text-left text-sm font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dismissedBills.map((d) => (
                      <tr key={d.id} className="border-b hover:bg-muted/50">
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-1 rounded font-medium ${
                            d.tenantCode === 'US' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                          }`}>
                            {d.tenantCode}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{d.clientName}</td>
                        <td className="px-4 py-3 text-sm">{d.payeeName}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {formatAmount(d.amount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground max-w-xs truncate" title={d.reason}>
                          {d.reason}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{d.dismissedByName || d.dismissedBy}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          {new Date(d.dismissedAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3">
                          <button
                            onClick={() => handleRestoreBill(d.pcBillId)}
                            className="px-3 py-1 rounded text-sm font-medium bg-green-100 text-green-700 hover:bg-green-200"
                          >
                            Restore
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Payment confirmation modal */}
      <PaymentConfirmationModal
        bill={pendingPaymentBill}
        onConfirm={handleConfirmPayment}
        onCancel={handleCancelPayment}
      />

      {/* Build info */}
      <div className="text-center text-xs text-gray-400 py-2">
        UI: {new Date(__BUILD_TIME__).toLocaleString()}
        {apiStartedAt && <> · API: {new Date(apiStartedAt).toLocaleString()}</>}
      </div>

      {/* Dismiss confirmation modal */}
      <DismissConfirmationModal
        bill={pendingDismissBill}
        onConfirm={handleConfirmDismiss}
        onCancel={() => setPendingDismissBill(null)}
      />
    </div>
  );
}

function Login() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const rejectedEmail = params.get('email');
  const switchAccount = params.get('switch');

  // After Identity session cleared via signout-and-retry, auto-start fresh login.
  // Identity defaults to prompt=select_account for Google OAuth.
  if (switchAccount === '1') {
    window.location.href = getAuthUrl('/login');
    return null;
  }

  // Track which Google account Identity last saw.
  // Persisted in localStorage so it survives page reloads.
  const knownEmail = (() => {
    if (rejectedEmail) {
      localStorage.setItem('lastIdentityEmail', rejectedEmail);
      return rejectedEmail;
    }
    return localStorage.getItem('lastIdentityEmail');
  })();

  const isNotAuthorized = error === 'not_authorized';

  const errorMessages: Record<string, string> = {
    oauth_failed: 'Sign-in failed. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    no_code: 'Authorization failed. Please try again.',
    token_failed: 'Failed to complete sign-in. Please try again.',
    userinfo_failed: 'Failed to get user info. Please try again.',
    invalid_domain: 'Only @fortiumpartners.com accounts are allowed.',
    not_authorized: rejectedEmail
      ? `${rejectedEmail} does not have access to Payouts.`
      : 'Your account is not authorized. Contact an administrator.',
    auth_failed: 'Authentication failed. Please try again.',
    state_missing: 'Session expired. Please try again.',
    state_invalid: 'Invalid session. Please try again.',
    state_mismatch: 'Session mismatch. Please try again.',
    auth_init_failed: 'Failed to start sign-in. Please try again.',
    invalid_callback: 'Invalid response from identity provider.',
    callback_failed: 'Sign-in failed. Please try again.',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-900 flex items-center justify-center p-4">
      {/* Subtle pattern overlay */}
      <div
        className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative w-full max-w-md">
        {/* Main card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-10">
          {/* Logo */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white text-3xl font-bold">P</span>
            </div>
          </div>

          {/* Title */}
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Fortium Payouts</h1>
            <p className="text-gray-500">Payment control & validation</p>
          </div>

          {/* Error message */}
          {error && (
            <div className={`mb-6 p-4 rounded-lg ${isNotAuthorized ? 'bg-amber-50 border border-amber-200' : 'bg-red-50 border border-red-100'}`}>
              <div className="flex items-start gap-3">
                <AlertCircle className={`h-5 w-5 flex-shrink-0 mt-0.5 ${isNotAuthorized ? 'text-amber-500' : 'text-red-500'}`} />
                <div>
                  <p className={`text-sm ${isNotAuthorized ? 'text-amber-800' : 'text-red-700'}`}>
                    {errorMessages[error] || 'An error occurred. Please try again.'}
                  </p>
                  {isNotAuthorized && (
                    <p className="text-xs text-amber-600 mt-1">
                      Sign in with an authorized Fortium account, or contact an administrator.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* When not authorized: primary action is switching accounts */}
          {isNotAuthorized ? (
            <>
              <a
                href={getAuthUrl('/switch-account')}
                className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-all font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                </svg>
                Sign in with a different account
              </a>
            </>
          ) : (
            <>
              {/* Current account indicator */}
              {knownEmail && (
                <div className="mb-4 p-3 rounded-lg bg-gray-50 border border-gray-200 text-center">
                  <p className="text-xs text-gray-500 mb-1">Signed in as</p>
                  <p className="text-sm font-medium text-gray-700">{knownEmail}</p>
                </div>
              )}

              {/* Sign in button */}
              <a
                href={getAuthUrl('/login')}
                className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all group"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                  <polyline points="10 17 15 12 10 7" />
                  <line x1="15" y1="12" x2="3" y2="12" />
                </svg>
                <span className="text-gray-700 font-medium">
                  {knownEmail ? `Sign in as ${knownEmail}` : 'Sign in'}
                </span>
              </a>
              <div className="text-center mt-2">
                <a
                  href={getAuthUrl('/switch-account')}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {knownEmail ? 'Use a different account' : 'Sign in with a different account'}
                </a>
              </div>
            </>
          )}

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-white text-sm text-gray-400">For Fortium Partners Finance</span>
            </div>
          </div>

          {/* Features */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-emerald-50 flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-xs text-gray-500">Validate Bills</p>
            </div>
            <div>
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-emerald-50 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-xs text-gray-500">Execute Payments</p>
            </div>
            <div>
              <div className="w-10 h-10 mx-auto mb-2 rounded-lg bg-emerald-50 flex items-center justify-center">
                <History className="h-5 w-5 text-emerald-600" />
              </div>
              <p className="text-xs text-gray-500">Track History</p>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="mt-6 text-center">
          <p className="text-emerald-100 text-sm flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Secured by Fortium Identity
          </p>
        </div>

        {/* Footer */}
        <div className="mt-4 text-center">
          <p className="text-emerald-200/60 text-xs">
            © {new Date().getFullYear()} Fortium Partners
          </p>
        </div>
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
