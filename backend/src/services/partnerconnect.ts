/**
 * PartnerConnect API client using OAuth2 client credentials authentication.
 * Adapted from pipelinemgr pattern.
 */

import { config } from '../lib/config.js';

// Error types
export class PCError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'PCError';
  }
}

export class PCConnectionError extends PCError {
  constructor(message: string) {
    super(message);
    this.name = 'PCConnectionError';
  }
}

export class PCAuthError extends PCError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = 'PCAuthError';
  }
}

export class PCAPIError extends PCError {
  constructor(message: string, statusCode?: number) {
    super(message, statusCode);
    this.name = 'PCAPIError';
  }
}

// Types
export interface PCBill {
  uid: string;
  description: string;
  statusCode: string;  // 'Ready' or ProcessCode value
  processCode: string;
  total: number;
  balance: number;
  adjustedBillPayment: number;  // Amount to actually pay
  resourceUid: string;
  resourceName: string;         // Payee - who we pay (display only)
  qboVendorId: string;          // QBO vendor ID (Resource.CAExternalUserId or USExternalUserId)
  clientName: string;           // Client - who we invoice
  externalBillId: string;
  externalBillDocNum: string;
  externalInvoiceId: string;
  externalInvoiceDocNum: string;
  trxDate: Date;
  dueDate?: Date;
  paidDate?: Date;
  tenantCode: string;
  payeeEmail?: string;          // Payee's email address from Resource.PrimaryEmail (single bill only)
}

/**
 * PartnerConnect API client with OAuth2 client credentials flow.
 */
export class PartnerConnectClient {
  private apiUrl: string;
  private clientId: string;
  private clientSecret: string;
  private auth0Domain: string;
  private audience: string;

  // Token cache
  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private readonly TOKEN_REFRESH_BUFFER = 60; // seconds

  constructor(options?: {
    apiUrl?: string;
    clientId?: string;
    clientSecret?: string;
    auth0Domain?: string;
    audience?: string;
  }) {
    this.apiUrl = (options?.apiUrl || config.PARTNERCONNECT_API_URL || '').replace(/\/$/, '');
    this.clientId = options?.clientId || config.PARTNERCONNECT_CLIENT_ID || '';
    this.clientSecret = options?.clientSecret || config.PARTNERCONNECT_CLIENT_SECRET || '';
    this.auth0Domain = options?.auth0Domain || config.PARTNERCONNECT_AUTH0_DOMAIN || '';
    this.audience = options?.audience || config.PARTNERCONNECT_AUDIENCE || '';
  }

  /**
   * Get valid access token, refreshing if needed.
   */
  private async getToken(): Promise<string> {
    // Check if cached token is still valid
    if (this.accessToken && Date.now() / 1000 < this.tokenExpiresAt) {
      return this.accessToken;
    }

    // Validate credentials
    if (!this.clientId || !this.clientSecret) {
      throw new PCAuthError(
        'PartnerConnect OAuth2 credentials not configured. ' +
        'Set PARTNERCONNECT_CLIENT_ID and PARTNERCONNECT_CLIENT_SECRET.'
      );
    }

    const tokenUrl = `https://${this.auth0Domain}/oauth/token`;

    try {
      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          audience: this.audience,
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error_description?: string; error?: string };
        const errorMsg = errorData.error_description || errorData.error || 'Unknown error';
        throw new PCAuthError(`OAuth2 authentication failed: ${errorMsg}`, response.status);
      }

      const data = await response.json() as { access_token: string; expires_in?: number };
      this.accessToken = data.access_token;
      const expiresIn = data.expires_in || 600;
      this.tokenExpiresAt = Date.now() / 1000 + expiresIn - this.TOKEN_REFRESH_BUFFER;

      return this.accessToken;
    } catch (err) {
      if (err instanceof PCError) throw err;
      throw new PCConnectionError(`Failed to get OAuth2 token: ${err}`);
    }
  }

  /**
   * Make authenticated API request with retry.
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown,
    retries = 3
  ): Promise<T> {
    const token = await this.getToken();
    const url = `${this.apiUrl}${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: body ? JSON.stringify(body) : undefined,
        });

        // Handle error status codes
        if (response.status === 401 || response.status === 403) {
          this.accessToken = null;
          this.tokenExpiresAt = 0;
          throw new PCAuthError('Authentication failed', response.status);
        }

        if (response.status === 429 || response.status === 503) {
          if (attempt < retries) {
            const delay = Math.pow(2, attempt) * 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw new PCAPIError('Rate limit or service unavailable', response.status);
        }

        if (response.status >= 500) {
          throw new PCAPIError(`Server error: ${response.status}`, response.status);
        }

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({})) as { message?: string };
          throw new PCAPIError(
            errorData.message || `API error ${response.status}`,
            response.status
          );
        }

        return await response.json() as T;
      } catch (err) {
        if (err instanceof PCError) throw err;
        if (attempt === retries) {
          throw new PCConnectionError(`Request failed: ${err}`);
        }
      }
    }

    throw new PCConnectionError('Request failed after retries');
  }

  /**
   * Fetch approved bills ready for payment.
   * Uses /api/bills/explorers and filters for:
   * - ProcessCode = 'Approved' (bill has been approved)
   * - Balance > 0 (bill not yet paid)
   */
  async getPayableBills(): Promise<PCBill[]> {
    const data = await this.request<any[]>('GET', '/api/bills/explorers');

    // Filter for approved bills with positive balance
    const approved = data.filter(bill =>
      bill.ProcessCode === 'Approved' &&
      (bill.Balance || 0) > 0
    );

    return approved.map(bill => this.mapBill(bill));
  }

  /**
   * Approve bills for payment.
   * @param uids - List of bill UIDs to approve
   */
  async approveBills(uids: string[]): Promise<PCBill[]> {
    const data = await this.request<any[]>('POST', '/api/bills/approve', uids);
    return data.map(bill => this.mapBill(bill));
  }

  /**
   * Get a single bill by ID.
   */
  async getBill(uid: string): Promise<PCBill> {
    const data = await this.request<any>('GET', `/api/bills/${uid}`);
    return this.mapBill(data);
  }

  /**
   * Map API response to PCBill type.
   * Handles PascalCase field names from .NET API.
   * Works with both Bill and BillExplorer response shapes.
   */
  private mapBill(data: Record<string, unknown>): PCBill {
    // Handle Resource which may be an object with Uid/FullName (individual Bill)
    // or flat fields like Payee (BillExplorer list)
    const resource = data.Resource as Record<string, unknown> | undefined;
    const tenantCode = String(data.TenantCode || '');

    // Resource object uses FullName, not Name
    const resourceName = String(
      resource?.FullName ||
      resource?.DisplayName ||
      resource?.Name ||
      data.Payee ||
      data.ResourceName ||
      ''
    );

    // QBO vendor ID comes from Resource.CAExternalUserId (CA) or USExternalUserId (US)
    const isCanada = ['CA', 'CAN', 'Canada'].includes(tenantCode);
    const qboVendorId = String(
      isCanada
        ? (resource?.CAExternalUserId || data.CAExternalUserId || '')
        : (resource?.USExternalUserId || data.USExternalUserId || '')
    );

    return {
      uid: String(data.Uid || ''),
      description: String(data.Description || ''),
      statusCode: String(data.StatusCode || data.ProcessCode || 'Ready'),
      processCode: String(data.ProcessCode || ''),
      total: Number(data.Total || 0),
      balance: Number(data.Balance || 0),
      adjustedBillPayment: Number(data.AdjustedBillPayment || data.Balance || 0),
      resourceUid: String(resource?.Uid || data.ResourceUid || ''),
      resourceName,
      qboVendorId,
      clientName: String(
        data.ClientName ||
        data.Client ||
        data.EngagementDescription ||
        // Extract from description if available (format: "...for [ClientName]")
        this.extractClientFromDescription(String(data.Description || '')) ||
        ''
      ),
      externalBillId: String(data.ExternalBillId || ''),
      externalBillDocNum: String(data.ExternalBillDocNum || ''),
      externalInvoiceId: String(data.ExternalInvoiceId || ''),
      externalInvoiceDocNum: String(data.ExternalInvoiceDocNum || ''),
      trxDate: new Date(String(data.TrxDate)),
      dueDate: data.DueDate ? new Date(String(data.DueDate)) : undefined,
      paidDate: data.PaidDate ? new Date(String(data.PaidDate)) : undefined,
      tenantCode,
      // Payee email from Resource.PrimaryEmail (only available in single bill response, not list)
      payeeEmail: resource?.PrimaryEmail ? String(resource.PrimaryEmail) : undefined,
    };
  }

  /**
   * Extract client name from description.
   * Format: "...for [ClientName]" at the end of description.
   */
  private extractClientFromDescription(description: string): string {
    // Match "for [ClientName]" at the end, where ClientName doesn't contain " for "
    const match = description.match(/ for ([^]+)$/);
    return match?.[1]?.trim() || '';
  }

  /**
   * Fetch paid bills (historical payments).
   * Uses /api/bills/explorers and filters for:
   * - ProcessCode = 'Paid' OR paidDate is set
   */
  async getPaidBills(options?: {
    startDate?: string;
    endDate?: string;
    tenant?: 'US' | 'CA' | 'all';
  }): Promise<PCBill[]> {
    const data = await this.request<any[]>('GET', '/api/bills/explorers');

    // Filter for paid bills
    let paid = data.filter(bill =>
      bill.ProcessCode === 'Paid' || bill.PaidDate
    );

    // Apply date filters
    if (options?.startDate) {
      const start = new Date(options.startDate);
      paid = paid.filter(bill => {
        const paidDate = bill.PaidDate ? new Date(bill.PaidDate) : null;
        return paidDate && paidDate >= start;
      });
    }

    if (options?.endDate) {
      const end = new Date(options.endDate);
      end.setHours(23, 59, 59, 999); // Include entire end day
      paid = paid.filter(bill => {
        const paidDate = bill.PaidDate ? new Date(bill.PaidDate) : null;
        return paidDate && paidDate <= end;
      });
    }

    // Apply tenant filter
    if (options?.tenant && options.tenant !== 'all') {
      paid = paid.filter(bill => bill.TenantCode === options.tenant);
    }

    return paid.map(bill => this.mapBill(bill));
  }

  /**
   * Check if client is configured.
   */
  isConfigured(): boolean {
    return !!(this.apiUrl && this.clientId && this.clientSecret && this.auth0Domain);
  }

  /**
   * Get access token (for health checks).
   * This tests the OAuth flow.
   */
  async getAccessToken(): Promise<string> {
    return this.getToken();
  }
}

// Singleton instance
let pcClient: PartnerConnectClient | null = null;

export function getPartnerConnectClient(): PartnerConnectClient {
  if (!pcClient) {
    pcClient = new PartnerConnectClient();
  }
  return pcClient;
}
