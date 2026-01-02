/**
 * API client for the Payouts backend.
 */

const API_BASE = '/api';

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
  payeeName: string;
  wiseEmail: string;
  targetCurrency: string;
  wiseContactId: string | null;
  createdAt: string;
  updatedAt: string;
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
}

export interface WiseBalance {
  currency: string;
  amount: number;
  reserved: number;
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
      const response = await fetch('/auth/me', { credentials: 'include' });
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

  logout(): void {
    window.location.href = '/auth/logout';
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

  async createWiseRecipient(data: {
    payeeName: string;
    wiseEmail: string;
    targetCurrency: 'USD' | 'CAD';
    wiseContactId?: number;
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
}

export const api = new ApiClient();
