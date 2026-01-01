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
  status: string;
  amount: number;
  clientUid: string;
  clientName: string;
  engagementUid: string;
  invoiceUid: string;
  payeeVendorId: string;
  payeeName: string;
  createdAt: Date;
  approvedAt?: Date;
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
   * Fetch bills with status "approved but not paid".
   * This is the main method for the payouts workflow.
   */
  async getApprovedBills(): Promise<PCBill[]> {
    // TODO: Adjust endpoint based on actual PC API
    const data = await this.request<any[]>('GET', '/api/bills?status=approved');

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
   */
  private mapBill(data: Record<string, unknown>): PCBill {
    return {
      uid: String(data.Uid || data.uid || ''),
      description: String(data.Description || data.description || ''),
      status: String(data.Status || data.status || ''),
      amount: Number(data.Amount || data.amount || 0),
      clientUid: String(data.ClientUid || data.clientUid || ''),
      clientName: String(data.ClientName || data.clientName || ''),
      engagementUid: String(data.EngagementUid || data.engagementUid || ''),
      invoiceUid: String(data.InvoiceUid || data.invoiceUid || ''),
      payeeVendorId: String(data.PayeeVendorId || data.payeeVendorId || ''),
      payeeName: String(data.PayeeName || data.payeeName || ''),
      createdAt: new Date(String(data.CreateTime || data.createdAt)),
      approvedAt: data.ApprovedAt || data.approvedAt
        ? new Date(String(data.ApprovedAt || data.approvedAt))
        : undefined,
    };
  }

  /**
   * Check if client is configured.
   */
  isConfigured(): boolean {
    return !!(this.apiUrl && this.clientId && this.clientSecret && this.auth0Domain);
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
