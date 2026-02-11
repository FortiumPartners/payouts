/**
 * Payment Detail page.
 * Shows bill info, validation results grouped by integration,
 * payment status, and a vertical timeline of state changes.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft,
  DollarSign,
  Loader2,
  AlertCircle,
  Check,
  X,
  Building2,
  FileSpreadsheet,
  CreditCard,
  Settings2,
  Clock,
  CheckCircle,
  XCircle,
  CreditCard as CreditCardIcon,
} from 'lucide-react';
import { api, Bill, ControlResult, PaymentDetail } from '../lib/api';

// ----- Control grouping (matches BillsList.tsx) -----

type IntegrationGroup = 'partnerconnect' | 'quickbooks' | 'payment' | 'general';

interface ControlGroup {
  id: IntegrationGroup;
  name: string;
  icon: React.ReactNode;
  bgColor: string;
  borderColor: string;
  controls: ControlResult[];
}

const controlIntegrationMap: Record<string, IntegrationGroup> = {
  billApprovedInPC: 'partnerconnect',
  payeeExistsInPC: 'partnerconnect',
  invoiceExistsInQbo: 'quickbooks',
  invoicePaid: 'quickbooks',
  invoiceNotVoided: 'quickbooks',
  billExistsInQbo: 'quickbooks',
  vendorExistsInQbo: 'quickbooks',
  vendorExistsInBillCom: 'payment',
  billExistsInBillCom: 'payment',
  billApprovedInBillCom: 'payment',
  recipientMappedInSystem: 'payment',
  recipientExistsInWise: 'payment',
  wisePaymentReady: 'payment',
  notAlreadyPaid: 'general',
  provingPeriod: 'general',
  amountValid: 'general',
};

const controlNameMap: Record<string, string> = {
  billApprovedInPC: 'Bill Approved',
  payeeExistsInPC: 'Payee Exists',
  invoiceExistsInQbo: 'Invoice Exists',
  invoicePaid: 'Invoice Paid',
  invoiceNotVoided: 'Invoice Active',
  billExistsInQbo: 'Bill Exists',
  vendorExistsInQbo: 'Vendor Linked',
  vendorExistsInBillCom: 'Vendor Exists',
  billExistsInBillCom: 'Bill Exists',
  billApprovedInBillCom: 'Bill Approved',
  recipientMappedInSystem: 'Recipient Mapped',
  recipientExistsInWise: 'Contact Exists',
  wisePaymentReady: 'Payment Ready',
  notAlreadyPaid: 'Not Already Paid',
  provingPeriod: 'Proving Period',
  amountValid: 'Amount Valid',
};

function groupControlsByIntegration(controls: ControlResult[], tenantCode: 'US' | 'CA'): ControlGroup[] {
  const groups: Record<IntegrationGroup, ControlResult[]> = {
    partnerconnect: [],
    quickbooks: [],
    payment: [],
    general: [],
  };

  controls.forEach((control) => {
    const group = controlIntegrationMap[control.name] || 'general';
    groups[group].push(control);
  });

  const result: ControlGroup[] = [];

  if (groups.partnerconnect.length > 0) {
    result.push({
      id: 'partnerconnect',
      name: 'PartnerConnect',
      icon: <Building2 className="h-4 w-4" />,
      bgColor: 'bg-indigo-50',
      borderColor: 'border-indigo-200',
      controls: groups.partnerconnect,
    });
  }

  if (groups.quickbooks.length > 0) {
    result.push({
      id: 'quickbooks',
      name: 'QuickBooks',
      icon: <FileSpreadsheet className="h-4 w-4" />,
      bgColor: 'bg-green-50',
      borderColor: 'border-green-200',
      controls: groups.quickbooks,
    });
  }

  if (groups.payment.length > 0) {
    result.push({
      id: 'payment',
      name: tenantCode === 'US' ? 'Bill.com' : 'Wise',
      icon: <CreditCard className="h-4 w-4" />,
      bgColor: tenantCode === 'US' ? 'bg-sky-50' : 'bg-teal-50',
      borderColor: tenantCode === 'US' ? 'border-sky-300' : 'border-teal-300',
      controls: groups.payment,
    });
  }

  if (groups.general.length > 0) {
    result.push({
      id: 'general',
      name: 'General',
      icon: <Settings2 className="h-4 w-4" />,
      bgColor: 'bg-gray-50',
      borderColor: 'border-gray-200',
      controls: groups.general,
    });
  }

  return result;
}

// ----- Helpers -----

function formatAmount(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateString: string | null): string {
  if (!dateString) return '--';
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// Status badge used for payment status
const statusBadgeClasses: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  pending_controls: 'bg-amber-100 text-amber-800',
  ready: 'bg-green-100 text-green-800',
  processing: 'bg-blue-100 text-blue-800',
  paid: 'bg-gray-100 text-gray-600',
  failed: 'bg-red-100 text-red-800',
};

// ----- Timeline -----

interface TimelineStep {
  label: string;
  description: string;
  completed: boolean;
  failed?: boolean;
  date?: string | null;
}

function buildTimeline(bill: Bill | null, payment: PaymentDetail | null): TimelineStep[] {
  const steps: TimelineStep[] = [];

  // Step 1: Bill Created
  steps.push({
    label: 'Bill Created',
    description: 'Bill imported from PartnerConnect',
    completed: true,
  });

  // Step 2: Controls Checked
  if (bill) {
    const passedCount = bill.controls.filter((c) => c.passed).length;
    const totalCount = bill.controls.length;
    const allPassed = totalCount > 0 && passedCount === totalCount;
    steps.push({
      label: 'Controls Checked',
      description:
        totalCount === 0
          ? 'Awaiting control checks'
          : `${passedCount}/${totalCount} passed`,
      completed: totalCount > 0,
      failed: totalCount > 0 && !allPassed,
    });
  } else {
    steps.push({
      label: 'Controls Checked',
      description: payment ? 'Controls verified' : 'Awaiting control checks',
      completed: !!payment,
    });
  }

  // Step 3: Payment Initiated
  if (payment) {
    steps.push({
      label: 'Payment Initiated',
      description: `Via ${payment.paymentMethod || 'Unknown'}`,
      completed: true,
    });
  } else {
    steps.push({
      label: 'Payment Initiated',
      description: 'Not yet initiated',
      completed: false,
    });
  }

  // Step 4: Payment Completed
  if (payment) {
    const isPaid = payment.status === 'paid';
    const isFailed = payment.status === 'failed';
    steps.push({
      label: isPaid ? 'Payment Completed' : isFailed ? 'Payment Failed' : 'Awaiting Completion',
      description: isPaid
        ? `Paid on ${formatDate(payment.paidDate)}`
        : isFailed
        ? 'Payment was not successful'
        : 'Payment is being processed',
      completed: isPaid,
      failed: isFailed,
      date: payment.paidDate,
    });
  } else {
    steps.push({
      label: 'Payment Completed',
      description: 'Pending',
      completed: false,
    });
  }

  return steps;
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <div className="relative">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        return (
          <div key={i} className="flex gap-4">
            {/* Dot and line */}
            <div className="flex flex-col items-center">
              <div
                className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                  step.failed
                    ? 'bg-red-500 border-red-500'
                    : step.completed
                    ? 'bg-green-500 border-green-500'
                    : 'bg-white border-gray-300'
                }`}
              />
              {!isLast && (
                <div
                  className={`w-0.5 flex-1 min-h-[2rem] ${
                    step.completed && !step.failed ? 'bg-green-300' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>

            {/* Content */}
            <div className={`pb-6 ${isLast ? 'pb-0' : ''}`}>
              <p
                className={`font-medium text-sm ${
                  step.failed
                    ? 'text-red-700'
                    : step.completed
                    ? 'text-foreground'
                    : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ----- Main Component -----

export function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [bill, setBill] = useState<Bill | null>(null);
  const [payment, setPayment] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    const fetchDetail = async () => {
      setLoading(true);
      setError(null);

      // Try loading the bill first. If it fails (e.g. already paid),
      // fall back to payment detail.
      const results = await Promise.allSettled([
        api.getBill(id),
        api.getPaymentDetail(id),
      ]);

      const billResult = results[0];
      const paymentResult = results[1];

      if (billResult.status === 'fulfilled') {
        setBill(billResult.value);
      }
      if (paymentResult.status === 'fulfilled') {
        setPayment(paymentResult.value);
      }

      if (billResult.status === 'rejected' && paymentResult.status === 'rejected') {
        setError('Could not load bill or payment details.');
      }

      setLoading(false);
    };

    fetchDetail();
  }, [id]);

  // Determine which data source to use for display
  const tenantCode: 'US' | 'CA' = bill?.tenantCode ?? payment?.tenantCode ?? 'US';
  const controls = bill?.controls ?? [];
  const controlGroups = groupControlsByIntegration(controls, tenantCode);
  const timelineSteps = buildTimeline(bill, payment);

  const displayStatus = payment?.status ?? (bill?.readyToPay ? 'ready' : 'pending_controls');
  const paymentMethod = payment?.paymentMethod ?? (tenantCode === 'US' ? 'Bill.com' : 'Wise');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center gap-4">
          <Link to="/queue" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            <h1 className="text-xl font-semibold">Payment Detail</h1>
          </div>
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
            <Link
              to="/queue"
              className="mt-4 inline-block px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90"
            >
              Back to Queue
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column: Bill Info + Validation */}
            <div className="lg:col-span-2 space-y-6">
              {/* Bill Info Section */}
              <div className="rounded-lg border bg-card">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Bill Information</h2>
                </div>
                <div className="p-6 grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Client</p>
                    <p className="font-medium">{bill?.clientName || payment?.clientName || '--'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Payee</p>
                    <p className="font-medium">{bill?.payeeName || payment?.payeeName || '--'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Amount</p>
                    <p className="font-medium text-lg">
                      {formatAmount(bill?.amount ?? payment?.amount ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Tenant</p>
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        tenantCode === 'US'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {tenantCode}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">QBO Invoice</p>
                    <p className="font-mono text-sm">
                      {bill?.qboInvoiceNum || payment?.invoiceNumber || '--'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">QBO Bill</p>
                    <p className="font-mono text-sm">
                      {bill?.qboBillNum || payment?.billNumber || '--'}
                    </p>
                  </div>
                  {(bill?.description || payment?.description) && (
                    <div className="col-span-2 md:col-span-3">
                      <p className="text-sm text-muted-foreground">Description</p>
                      <p className="text-sm">{bill?.description || payment?.description}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Validation Results Section */}
              <div className="rounded-lg border bg-card">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Validation Results</h2>
                </div>
                <div className="p-6">
                  {controls.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      No control check results available.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {controlGroups.map((group) => {
                        const allPassed = group.controls.every((c) => c.passed);
                        const failedCount = group.controls.filter((c) => !c.passed).length;
                        return (
                          <div
                            key={group.id}
                            className={`rounded-lg border p-4 ${group.bgColor} ${group.borderColor}`}
                          >
                            <div className="flex items-center gap-2 mb-3">
                              <span className="text-muted-foreground">{group.icon}</span>
                              <span className="font-medium text-sm">{group.name}</span>
                              {allPassed ? (
                                <Check className="h-4 w-4 text-green-600 ml-auto" />
                              ) : (
                                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded ml-auto">
                                  {failedCount} issue{failedCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <div className="space-y-2">
                              {group.controls.map((control) => (
                                <div key={control.name} className="flex items-start gap-2 text-sm">
                                  {control.passed ? (
                                    <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                                  ) : (
                                    <X className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                                  )}
                                  <div className="min-w-0 flex-1">
                                    <span className="font-medium text-xs">
                                      {controlNameMap[control.name] || control.name}
                                    </span>
                                    {control.reason && (
                                      <p
                                        className="text-muted-foreground text-xs truncate"
                                        title={control.reason}
                                      >
                                        {control.reason}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Right column: Payment Status + Timeline */}
            <div className="space-y-6">
              {/* Payment Status */}
              <div className="rounded-lg border bg-card">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Payment Status</h2>
                </div>
                <div className="p-6 space-y-4">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Current Status</p>
                    <span
                      className={`text-sm px-3 py-1 rounded font-medium ${
                        statusBadgeClasses[displayStatus] || 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {displayStatus.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Payment Method</p>
                    <div className="flex items-center gap-2">
                      <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium">{paymentMethod}</span>
                    </div>
                  </div>
                  {payment?.referenceNumber && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Reference Number</p>
                      <p className="font-mono text-sm">{payment.referenceNumber}</p>
                    </div>
                  )}
                  {payment?.paidDate && (
                    <div>
                      <p className="text-sm text-muted-foreground mb-1">Paid Date</p>
                      <p className="text-sm font-medium">{formatDate(payment.paidDate)}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Timeline */}
              <div className="rounded-lg border bg-card">
                <div className="border-b px-6 py-4">
                  <h2 className="font-semibold">Timeline</h2>
                </div>
                <div className="p-6">
                  <Timeline steps={timelineSteps} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
