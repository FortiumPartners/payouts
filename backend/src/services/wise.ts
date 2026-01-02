/**
 * Wise API client for CA (Canada) payments.
 * Uses API token authentication.
 *
 * Docs: https://docs.wise.com/api-docs/api-reference
 *
 * Flow:
 * 1. Get business profile ID (cached)
 * 2. Find contact by email
 * 3. Create quote
 * 4. Create transfer
 */

import { config } from '../lib/config.js';

// Error types
export class WiseError extends Error {
  constructor(message: string, public statusCode?: number, public errorCode?: string) {
    super(message);
    this.name = 'WiseError';
  }
}

export class WiseAuthError extends WiseError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'WiseAuthError';
  }
}

// Types
export interface WiseProfile {
  id: number;
  type: 'personal' | 'business';
  details: {
    name?: string;
    companyName?: string;
  };
}

export interface WiseContact {
  id: number;
  profile: number;
  accountHolderName: string;
  currency: string;
  country: string;
  type: string;
  details: {
    email?: string;
    accountNumber?: string;
    routingNumber?: string;
  };
}

export interface WiseQuote {
  id: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceAmount: number;
  targetAmount: number;
  rate: number;
  fee: number;
  paymentOptions: Array<{
    payIn: string;
    payOut: string;
    fee: { total: number };
    estimatedDelivery: string;
  }>;
  expirationTime: string;
}

export interface WiseTransfer {
  id: number;
  user: number;
  targetAccount: number;
  sourceAccount: number | null;
  quote: string;
  status: 'incoming_payment_waiting' | 'processing' | 'funds_converted' | 'outgoing_payment_sent' | 'cancelled' | 'bounced_back';
  reference: string;
  rate: number;
  created: string;
  sourceCurrency: string;
  targetCurrency: string;
  sourceValue: number;
  targetValue: number;
}

export interface WiseRecipientAccount {
  id: number;
  creatorId: number;
  profileId: number;
  name: {
    fullName: string;
    givenName?: string;
    familyName?: string;
  };
  nickname?: string;
  currency: string;
  country: string;
  type: string;
  legalEntityType: string;
  email?: string;
  active: boolean;
  details: {
    email?: string;
    interacAccount?: string;
    accountNumber?: string;
    institutionNumber?: string;
    transitNumber?: string;
    [key: string]: unknown;
  };
  accountSummary: string;
  longAccountSummary: string;
  ownedByCustomer: boolean;
}

export interface WiseBalance {
  id: number;
  currency: string;
  amount: {
    value: number;
    currency: string;
  };
  reservedAmount: {
    value: number;
    currency: string;
  };
  bankDetails?: {
    accountNumber?: string;
    bankCode?: string;
  };
}

/**
 * Wise API client with profile caching.
 */
export class WiseClient {
  private apiUrl: string;
  private apiToken: string;

  // Profile cache
  private businessProfileId: number | null = null;
  private profileFetched = false;

  constructor(options?: {
    apiUrl?: string;
    apiToken?: string;
  }) {
    const sandbox = config.WISE_SANDBOX === 'true';
    this.apiUrl = options?.apiUrl || config.WISE_API_URL ||
      (sandbox ? 'https://api.sandbox.transferwise.tech' : 'https://api.wise.com');
    this.apiToken = options?.apiToken || config.WISE_API_TOKEN || '';
  }

  /**
   * Get business profile ID (cached).
   */
  async getBusinessProfileId(): Promise<number> {
    if (this.businessProfileId && this.profileFetched) {
      return this.businessProfileId;
    }

    console.log('[Wise] Fetching business profile...');
    const profiles = await this.request<WiseProfile[]>('GET', '/v1/profiles');

    const businessProfile = profiles.find(p => p.type === 'business');
    if (!businessProfile) {
      throw new WiseError('No business profile found');
    }

    console.log(`[Wise] Business profile: ${businessProfile.id} (${businessProfile.details.companyName || businessProfile.details.name})`);
    this.businessProfileId = businessProfile.id;
    this.profileFetched = true;

    return this.businessProfileId;
  }

  /**
   * Make authenticated API request.
   */
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: Record<string, unknown>
  ): Promise<T> {
    if (!this.apiToken) {
      throw new WiseAuthError('Wise API token not configured');
    }

    const url = `${this.apiUrl}${path}`;
    console.log(`[Wise] ${method} ${path}`);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After') || '60';
      throw new WiseError(`Rate limited, retry after ${retryAfter}s`, 429);
    }

    // Handle auth errors
    if (response.status === 401 || response.status === 403) {
      throw new WiseAuthError('Invalid or expired API token');
    }

    // Handle not found
    if (response.status === 404) {
      return null as T;
    }

    // Handle other errors
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}`;
      try {
        const errorBody = await response.json() as { message?: string; errors?: Array<{ message: string }> };
        errorMessage = errorBody.message || errorBody.errors?.[0]?.message || errorMessage;
      } catch {
        // Ignore JSON parse errors
      }
      throw new WiseError(errorMessage, response.status);
    }

    // Empty response
    if (response.status === 204) {
      return null as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * List all recipients (accounts) from Wise.
   * Returns external recipients (not owned by customer).
   */
  async listRecipients(): Promise<WiseRecipientAccount[]> {
    // Don't filter by profileId - recipients may be under different profiles
    const response = await this.request<{ content: WiseRecipientAccount[] }>(
      'GET',
      `/v2/accounts?ownedByCustomer=false&size=100`
    );

    console.log(`[Wise] Found ${response.content?.length || 0} recipients`);
    return response.content || [];
  }

  /**
   * Find a contact (recipient) by email.
   * Searches existing contacts for matching email.
   */
  async findContact(email: string, currency: string): Promise<WiseContact | null> {
    // Search all recipients without profile filter
    const recipients = await this.listRecipients();

    // Find recipient with matching email (case-insensitive)
    const contact = recipients.find(r =>
      r.details?.email?.toLowerCase() === email.toLowerCase() ||
      r.details?.interacAccount?.toLowerCase() === email.toLowerCase() ||
      r.email?.toLowerCase() === email.toLowerCase()
    );

    if (contact) {
      console.log(`[Wise] Found contact: ${contact.name?.fullName} (${contact.id})`);
      // Convert to WiseContact format
      return {
        id: contact.id,
        profile: contact.profileId,
        accountHolderName: contact.name?.fullName || '',
        currency: contact.currency,
        country: contact.country,
        type: contact.type,
        details: {
          email: contact.email || contact.details?.email || contact.details?.interacAccount,
        },
      };
    }

    console.log(`[Wise] No contact found with email: ${email}`);
    return null;
  }

  /**
   * Get contact by ID.
   */
  async getContact(contactId: number): Promise<WiseContact | null> {
    return this.request<WiseContact>('GET', `/v1/accounts/${contactId}`);
  }

  /**
   * Create a quote for a transfer.
   * @param sourceCurrency Source currency (e.g., 'CAD')
   * @param targetCurrency Target currency (e.g., 'USD')
   * @param sourceAmount Amount in source currency
   */
  async createQuote(
    sourceCurrency: string,
    targetCurrency: string,
    sourceAmount: number
  ): Promise<WiseQuote> {
    const profileId = await this.getBusinessProfileId();

    console.log(`[Wise] Creating quote: ${sourceAmount} ${sourceCurrency} -> ${targetCurrency}`);

    const quote = await this.request<WiseQuote>('POST', `/v3/profiles/${profileId}/quotes`, {
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      payOut: 'BALANCE', // Transfer to Wise balance
    });

    console.log(`[Wise] Quote created: ${quote.id}, rate: ${quote.rate}, target: ${quote.targetAmount} ${targetCurrency}`);
    return quote;
  }

  /**
   * Create a transfer.
   * @param quoteId Quote ID from createQuote
   * @param targetAccountId Recipient account ID
   * @param reference Payment reference (max 10 chars for some currencies)
   */
  async createTransfer(
    quoteId: string,
    targetAccountId: number,
    reference: string
  ): Promise<WiseTransfer> {
    const profileId = await this.getBusinessProfileId();

    console.log(`[Wise] Creating transfer: quote=${quoteId}, recipient=${targetAccountId}, ref=${reference}`);

    const transfer = await this.request<WiseTransfer>('POST', `/v1/transfers`, {
      targetAccount: targetAccountId,
      quoteUuid: quoteId,
      customerTransactionId: crypto.randomUUID(),
      details: {
        reference: reference.substring(0, 10), // Max 10 chars for some currencies
        sourceOfFunds: 'verification.source.of.funds.other',
      },
    });

    console.log(`[Wise] Transfer created: ${transfer.id}, status: ${transfer.status}`);
    return transfer;
  }

  /**
   * Fund a transfer from the Wise balance.
   * After funding, the transfer will be processed.
   */
  async fundTransfer(transferId: number): Promise<{ status: string }> {
    const profileId = await this.getBusinessProfileId();

    console.log(`[Wise] Funding transfer: ${transferId}`);

    const result = await this.request<{ status: string; errorCode?: string }>(
      'POST',
      `/v3/profiles/${profileId}/transfers/${transferId}/payments`,
      { type: 'BALANCE' }
    );

    console.log(`[Wise] Transfer funded: ${result.status}`);
    return result;
  }

  /**
   * Get transfer status.
   */
  async getTransfer(transferId: number): Promise<WiseTransfer | null> {
    return this.request<WiseTransfer>('GET', `/v1/transfers/${transferId}`);
  }

  /**
   * Get account balances.
   * Returns all currency balances for the business profile.
   */
  async getBalances(): Promise<WiseBalance[]> {
    const profileId = await this.getBusinessProfileId();

    console.log(`[Wise] Fetching balances for profile ${profileId}`);

    const balances = await this.request<WiseBalance[]>(
      'GET',
      `/v4/profiles/${profileId}/balances?types=STANDARD`
    );

    console.log(`[Wise] Found ${balances.length} balance(s)`);
    return balances;
  }

  /**
   * Check if client is configured.
   */
  isConfigured(): boolean {
    return !!this.apiToken;
  }
}

// Singleton instance
let wiseClient: WiseClient | null = null;

export function getWiseClient(): WiseClient {
  if (!wiseClient) {
    wiseClient = new WiseClient();
  }
  return wiseClient;
}
