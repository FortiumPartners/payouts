/**
 * API client for the Payouts backend.
 */

const API_URL = import.meta.env.VITE_API_URL || '';
const API_BASE = `${API_URL}/api`;
const AUTH_BASE = `${API_URL}/auth`;

/**
 * Get the full URL for an auth endpoint.
 * Used for cross-origin auth when frontend and API are on different domains.
 */
export function getAuthUrl(path: string): string {
  return `${AUTH_BASE}${path}`;
}

export interface ControlResult {
  name: string;
  passed: boolean;
  reason?: string;
}

export interface Bill {
  uid: string;
  description: string;
  status: string;
  amount: number;
  clientName: string;
  payeeName: string;
  tenantCode: 'US' | 'CA';
  qboInvoiceNum: string | null;
  qboBillNum: string | null;
  billComId: string | null;
  controls: ControlResult[];
  readyToPay: boolean;
}

export interface BillsResponse {
  bills: Bill[];
  summary: {
    total: number;
    readyToPay: number;
    pending: number;
  };
}

export interface User {
  email: string;
  name?: string;
  picture?: string;
}

export interface WiseRecipient {
  id: string;
  qboVendorId: string;
  payeeName: string;
  wiseEmail: string;
  targetCurrency: string;
  wiseContactId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentHistoryItem {
  id: string;
  pcBillId: string;
  paidDate: string | null;
  payeeName: string;
  payeeId: string;
  amount: number;
  currency: 'USD' | 'CAD';
  status: 'paid' | 'pending' | 'failed';
  clientName: string;
  tenantCode: 'US' | 'CA';
  paymentMethod: string;
}

export interface PaymentDetail extends PaymentHistoryItem {
  invoiceNumber: string | null;
  billNumber: string | null;
  referenceNumber: string | null;
  pcBillLink: string | null;
  description: string;
}

export interface PaymentHistoryResponse {
  payments: PaymentHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  filters: {
    payees: { id: string; name: string }[];
    clients: { id: string; name: string }[];
  };
}

export interface DismissedBill {
  id: string;
  pcBillId: string;
  reason: string;
  dismissedBy: string;
  dismissedAt: string;
  payeeName: string;
  clientName: string;
  amount: number;
  tenantCode: string;
  description?: string;
  qboInvoiceNum?: string;
  qboBillNum?: string;
}

export interface WiseAccount {
  id: number;
  name: string;
  nickname: string | null;
  email: string | null;
  currency: string;
  country: string;
  type: string;
  accountSummary: string;
  contactUuid: string | null;
}

export interface WiseBalance {
  currency: string;
  amount: number;
  reserved: number;
}

export interface IntegrationStatus {
  name: string;
  status: 'connected' | 'error' | 'not_configured';
  message: string;
  lastChecked: string;
}

export interface ValidationRule {
  id: string;
  name: string;
  ruleType: 'required_field' | 'amount_threshold' | 'approval_required' | 'duplicate_detection' | 'custom';
  conditions: Record<string, unknown>;
  active: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface RuleResult {
  ruleId: string;
  ruleName: string;
  ruleType: string;
  passed: boolean;
  reason: string;
}

export interface ValidationResult {
  billId: string;
  passed: boolean;
  results: RuleResult[];
  failedCount: number;
  passedCount: number;
}

export interface PaymentExecutionResult {
  success: boolean;
  paymentId?: string;
  paymentRecordId?: string;
  billId: string;
  amount: number;
  status: string;
  processDate?: string;
  message: string;
}

export interface PaymentStatusResult {
  paymentRecordId: string;
  pcBillId: string;
  payeeName: string;
  amount: number;
  status: string;
  billComPaymentId: string | null;
  billComStatus: string | null;
  processDate: string | null;
  executedAt: string | null;
  executedBy: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

class ApiClient {
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (response.status === 401) {
      window.location.href = '/login';
      throw new Error('Unauthorized');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.message || `API error ${response.status}`);
    }

    return response.json();
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      // Auth routes are at /auth, not /api/auth
      // Use AUTH_BASE for cross-origin support
      const response = await fetch(`${AUTH_BASE}/me`, { credentials: 'include' });
      if (!response.ok) return null;
      return response.json();
    } catch {
      return null;
    }
  }

  async getBills(params?: {
    tenant?: 'US' | 'CA' | 'all';
    status?: 'ready' | 'pending' | 'all';
  }): Promise<BillsResponse> {
    const searchParams = new URLSearchParams();
    if (params?.tenant) searchParams.set('tenant', params.tenant);
    if (params?.status) searchParams.set('status', params.status);

    const query = searchParams.toString();
    return this.request<BillsResponse>(`/bills${query ? `?${query}` : ''}`);
  }

  async getBill(id: string): Promise<Bill> {
    return this.request<Bill>(`/bills/${id}`);
  }

  async checkBillControls(billIds: string[]): Promise<{
    results: Record<string, {
      controls: ControlResult[];
      readyToPay: boolean;
    }>;
  }> {
    return this.request('/bills/check-controls', {
      method: 'POST',
      body: JSON.stringify({ billIds }),
    });
  }

  async getPaymentStatus(): Promise<{
    configured: boolean;
    mfaConfigured: boolean;
    trusted: boolean;
  }> {
    return this.request('/payments/status');
  }

  async initiateMfa(): Promise<{ challengeId: string; message: string }> {
    return this.request('/payments/mfa/initiate', { method: 'POST' });
  }

  async validateMfa(
    challengeId: string,
    code: string
  ): Promise<{ success: boolean; mfaId?: string; message: string }> {
    return this.request('/payments/mfa/validate', {
      method: 'POST',
      body: JSON.stringify({ challengeId, code }),
    });
  }

  async payBill(
    billId: string,
    processDate?: string
  ): Promise<{
    success: boolean;
    paymentId?: string;
    billId: string;
    amount: number;
    status: string;
    message: string;
  }> {
    return this.request(`/payments/pay/${billId}`, {
      method: 'POST',
      body: JSON.stringify({ processDate }),
    });
  }

  // Dismissed bills
  async dismissBill(billId: string, data: {
    reason: string;
    dismissedBy: string;
    payeeName: string;
    clientName: string;
    amount: number;
    tenantCode: string;
    description?: string;
    qboInvoiceNum?: string;
    qboBillNum?: string;
  }): Promise<DismissedBill> {
    return this.request(`/bills/${billId}/dismiss`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getDismissedBills(): Promise<{ dismissed: DismissedBill[] }> {
    return this.request('/bills/dismissed');
  }

  async restoreBill(billId: string): Promise<{ success: boolean; pcBillId: string }> {
    return this.request(`/bills/${billId}/restore`, { method: 'POST' });
  }

  logout(): void {
    window.location.href = `${AUTH_BASE}/logout`;
  }

  // Wise Recipients
  async getWiseRecipients(): Promise<{ recipients: WiseRecipient[] }> {
    return this.request('/wise-recipients');
  }

  async getWiseAccounts(): Promise<{ accounts: WiseAccount[] }> {
    return this.request('/wise-recipients/wise-accounts');
  }

  async getWiseBalance(): Promise<{ balances: WiseBalance[] }> {
    return this.request('/wise-recipients/balance');
  }

  async getIntegrationStatus(): Promise<{ integrations: IntegrationStatus[]; allHealthy: boolean }> {
    return this.request('/status/integrations');
  }

  async createWiseRecipient(data: {
    qboVendorId: string;
    payeeName: string;
    wiseEmail?: string;  // Optional for Wise-to-Wise contacts (use contactId instead)
    targetCurrency: 'USD' | 'CAD';
    wiseContactId?: string;  // Contact UUID from Wise API
  }): Promise<WiseRecipient> {
    return this.request('/wise-recipients', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateWiseRecipient(
    id: string,
    data: { wiseEmail?: string; targetCurrency?: 'USD' | 'CAD' }
  ): Promise<WiseRecipient> {
    return this.request(`/wise-recipients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteWiseRecipient(id: string): Promise<void> {
    await fetch(`${API_BASE}/wise-recipients/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
  }

  async getPaymentHistory(params?: {
    startDate?: string;
    endDate?: string;
    payeeIds?: string;
    clientIds?: string;
    tenant?: 'US' | 'CA' | 'all';
    paymentMethod?: string;
    minAmount?: number;
    maxAmount?: number;
    status?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PaymentHistoryResponse> {
    const searchParams = new URLSearchParams();
    if (params?.startDate) searchParams.set('startDate', params.startDate);
    if (params?.endDate) searchParams.set('endDate', params.endDate);
    if (params?.payeeIds) searchParams.set('payeeIds', params.payeeIds);
    if (params?.clientIds) searchParams.set('clientIds', params.clientIds);
    if (params?.tenant) searchParams.set('tenant', params.tenant);
    if (params?.paymentMethod) searchParams.set('paymentMethod', params.paymentMethod);
    if (params?.minAmount !== undefined) searchParams.set('minAmount', String(params.minAmount));
    if (params?.maxAmount !== undefined) searchParams.set('maxAmount', String(params.maxAmount));
    if (params?.status) searchParams.set('status', params.status);
    if (params?.page) searchParams.set('page', String(params.page));
    if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));

    const query = searchParams.toString();
    return this.request<PaymentHistoryResponse>(`/payments/history${query ? `?${query}` : ''}`);
  }

  async getPaymentDetail(id: string): Promise<PaymentDetail> {
    return this.request<PaymentDetail>(`/payments/history/${id}`);
  }

  // Validation Rules
  async getValidationRules(): Promise<{ rules: ValidationRule[] }> {
    return this.request('/rules');
  }

  async createValidationRule(data: {
    name: string;
    ruleType: ValidationRule['ruleType'];
    conditions: Record<string, unknown>;
    active?: boolean;
    priority?: number;
  }): Promise<ValidationRule> {
    return this.request('/rules', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateValidationRule(
    id: string,
    data: Partial<Omit<ValidationRule, 'id' | 'createdAt' | 'updatedAt'>>
  ): Promise<ValidationRule> {
    return this.request(`/rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteValidationRule(id: string): Promise<{ success: boolean }> {
    return this.request(`/rules/${id}`, { method: 'DELETE' });
  }

  async seedValidationRules(): Promise<{ message: string; count: number; rules: ValidationRule[] }> {
    return this.request('/rules/seed', { method: 'POST' });
  }

  async validateBill(billId: string): Promise<ValidationResult> {
    return this.request(`/bills/${billId}/validate`, { method: 'POST' });
  }

  // Bill.com Payment Execution
  async executePayment(
    billId: string,
    processDate?: string
  ): Promise<PaymentExecutionResult> {
    return this.request(`/payments/execute/${billId}`, {
      method: 'POST',
      body: JSON.stringify({ processDate }),
    });
  }

  async getPaymentStatus(paymentRecordId: string): Promise<PaymentStatusResult> {
    return this.request(`/payments/${paymentRecordId}/status`);
  }

  async getDashboardStats(): Promise<{
    pendingCount: number;
    validatedCount: number;
    paidThisMonth: number;
    pendingAmount: number;
    paidAmount: number;
  }> {
    // Aggregate from existing endpoints
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const [billsResponse, paymentsResponse] = await Promise.all([
      this.getBills({ status: 'all', tenant: 'all' }),
      this.getPaymentHistory({
        startDate: startOfMonth,
        endDate: endOfMonth,
        status: 'paid',
        pageSize: 1,
      }),
    ]);

    const pendingBills = billsResponse.bills.filter((b) => !b.readyToPay);
    const validatedBills = billsResponse.bills.filter((b) => b.readyToPay);

    return {
      pendingCount: pendingBills.length,
      validatedCount: validatedBills.length,
      paidThisMonth: paymentsResponse.total,
      pendingAmount: pendingBills.reduce((sum, b) => sum + b.amount, 0),
      paidAmount: 0, // Not available from paginated response total
    };
  }
}

export const api = new ApiClient();
