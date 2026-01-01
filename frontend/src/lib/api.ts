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

  logout(): void {
    window.location.href = '/auth/logout';
  }
}

export const api = new ApiClient();
