import { Routes, Route, Navigate, Link } from 'react-router-dom';
import { DollarSign, RefreshCw, LogOut, Loader2, AlertCircle, CheckCircle, Settings, History, ChevronDown, ChevronUp, RotateCcw, ListChecks } from 'lucide-react';
import { PaymentHistoryPage } from './pages/PaymentHistoryPage';
import { PaymentQueuePage } from './pages/PaymentQueuePage';
import { PaymentDetailPage } from './pages/PaymentDetailPage';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useBills } from './hooks/useBills';
import { useBillControls } from './hooks/useBillControls';
import { BillsList, ViewModeToggle, ViewMode } from './components/BillsList';
import { PaymentConfirmationModal } from './components/PaymentConfirmationModal';
import { DismissConfirmationModal } from './components/DismissConfirmationModal';
import { WiseRecipientsPage } from './components/WiseRecipientsPage';
import { IntegrationStatusPanel } from './components/IntegrationStatus';
import { Bill, DismissedBill, api, getAuthUrl } from './lib/api';
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
  const [pendingDismissBill, setPendingDismissBill] = useState<Bill | null>(null);
  const [showDismissed, setShowDismissed] = useState(false);
  const [dismissedBills, setDismissedBills] = useState<DismissedBill[]>([]);
  const [dismissedLoading, setDismissedLoading] = useState(false);

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

  const handleDismissBill = (bill: Bill) => {
    setPendingDismissBill(bill);
  };

  const handleConfirmDismiss = async (reason: string) => {
    const bill = pendingDismissBill;
    if (!bill || !user) return;

    setPendingDismissBill(null);

    try {
      await api.dismissBill(bill.uid, {
        reason,
        dismissedBy: user.email,
        payeeName: bill.payeeName,
        clientName: bill.clientName,
        amount: bill.amount,
        tenantCode: bill.tenantCode,
        description: bill.description,
        qboInvoiceNum: bill.qboInvoiceNum || undefined,
        qboBillNum: bill.qboBillNum || undefined,
      });
      await refresh();
      // Refresh dismissed list if visible
      if (showDismissed) {
        loadDismissedBills();
      }
    } catch (err) {
      setPaymentStatus({
        loading: false,
        success: false,
        message: err instanceof Error ? err.message : 'Failed to dismiss bill',
        billId: bill.uid,
      });
    }
  };

  const loadDismissedBills = async () => {
    setDismissedLoading(true);
    try {
      const { dismissed } = await api.getDismissedBills();
      setDismissedBills(dismissed);
    } catch (err) {
      console.error('Failed to load dismissed bills:', err);
    } finally {
      setDismissedLoading(false);
    }
  };

  const handleToggleDismissed = () => {
    const next = !showDismissed;
    setShowDismissed(next);
    if (next) {
      loadDismissedBills();
    }
  };

  const handleRestoreBill = async (pcBillId: string) => {
    try {
      await api.restoreBill(pcBillId);
      setDismissedBills(prev => prev.filter(d => d.pcBillId !== pcBillId));
      await refresh();
    } catch (err) {
      setPaymentStatus({
        loading: false,
        success: false,
        message: err instanceof Error ? err.message : 'Failed to restore bill',
        billId: pcBillId,
      });
    }
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
              to="/queue"
              className="flex items-center gap-2 px-4 py-2 rounded-md border hover:bg-muted"
              title="View Payment Queue"
            >
              <ListChecks className="h-4 w-4" />
              Payment Queue
            </Link>
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
        <div className="mt-6 rounded-lg border bg-card">
          <button
            onClick={handleToggleDismissed}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-muted-foreground">Dismissed Bills</h2>
              {dismissedBills.length > 0 && showDismissed && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  {dismissedBills.length}
                </span>
              )}
            </div>
            {showDismissed ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
          {showDismissed && (
            <div className="border-t">
              {dismissedLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : dismissedBills.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No dismissed bills.
                </div>
              ) : (
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
                          <td className="px-4 py-3 text-right font-medium">{formatAmount(Number(d.amount))}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground max-w-[200px] truncate" title={d.reason}>
                            {d.reason}
                          </td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">{d.dismissedBy}</td>
                          <td className="px-4 py-3 text-sm text-muted-foreground">
                            {new Date(d.dismissedAt).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleRestoreBill(d.pcBillId)}
                              className="flex items-center gap-1 px-3 py-1 rounded text-sm font-medium border border-green-300 text-green-700 hover:bg-green-50"
                              title="Restore bill to active queue"
                            >
                              <RotateCcw className="h-3 w-3" />
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
        </div>
      </main>

      {/* Payment confirmation modal */}
      <PaymentConfirmationModal
        bill={pendingPaymentBill}
        onConfirm={handleConfirmPayment}
        onCancel={handleCancelPayment}
      />

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

  const errorMessages: Record<string, string> = {
    oauth_failed: 'Google sign-in failed. Please try again.',
    invalid_state: 'Session expired. Please try again.',
    no_code: 'Authorization failed. Please try again.',
    token_failed: 'Failed to complete sign-in. Please try again.',
    userinfo_failed: 'Failed to get user info. Please try again.',
    invalid_domain: 'Only @fortiumpartners.com accounts are allowed.',
    not_authorized: 'Your account is not authorized. Contact an administrator to be added.',
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
            <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-100">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-700">
                  {errorMessages[error] || 'An error occurred. Please try again.'}
                </p>
              </div>
              {error === 'not_authorized' && (
                <a
                  href={`https://identity.fortiumsoftware.com/auth/switch-account?return_to=${encodeURIComponent(window.location.origin + '/login')}`}
                  className="mt-3 flex items-center justify-center gap-2 w-full px-3 py-2 text-sm text-red-700 hover:text-red-800 hover:bg-red-100 rounded-md transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Use a Different Google Account
                </a>
              )}
            </div>
          )}

          {/* Sign in button */}
          <a
            href={getAuthUrl('/login')}
            className="flex items-center justify-center gap-3 w-full px-4 py-3 bg-white border-2 border-gray-200 rounded-lg hover:border-gray-300 hover:bg-gray-50 transition-all group"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-gray-700 font-medium">Sign in with Google</span>
          </a>

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
          path="/queue"
          element={
            <ProtectedRoute>
              <PaymentQueuePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments/:id"
          element={
            <ProtectedRoute>
              <PaymentDetailPage />
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
