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
  type: string; // v2 API returns uppercase: 'PERSONAL' | 'BUSINESS'
  // v2 API structure - business profiles have businessName, personal have fullName
  businessName?: string;
  fullName?: string;
  // Keep details for backwards compatibility with v1 (if ever needed)
  details?: {
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
  // Original contact UUID for Wise-to-Wise contacts
  contactUuid?: string;
}

// Contact from v2 Contacts API (includes Wise-to-Wise recipients)
export interface WiseContactV2 {
  id: string; // UUID string
  name: string;
  nickname?: string;
  hidden: boolean;
  active: boolean;
  self: boolean;
  legalEntityType: 'PERSON' | 'INSTITUTION';
  userId: number | null;
  profileId: number;
  capabilities: Array<{
    action: string;
    currencies: string[];
  }>;
  display: {
    title: string;
    subtitle: string;
    avatar: { type: string; value: string };
    details: Array<{ label: string; value: string }>;
  };
  lastUsedTime?: string;
}

export interface WiseContactsResponse {
  contacts: WiseContactV2[];
  currentPage: string | null;
  nextPage: string | null;
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

    console.log('[Wise] Fetching profiles...');
    // Use v2 API to get ALL profiles (v1 only returns subset)
    const profiles = await this.request<WiseProfile[]>('GET', '/v2/profiles');

    // Log all profiles to see what's available (v2 uses businessName/fullName, not details)
    console.log(`[Wise] Found ${profiles.length} profile(s):`);
    for (const p of profiles) {
      const name = p.businessName || p.fullName || 'unnamed';
      console.log(`[Wise]   - ${p.id}: ${p.type} - ${name}`);
    }

    // For CA payments, we need the Canada profile (ID 56956247)
    // which has the CAD balance. The v2 API returns type in uppercase.
    // First try to find by known Canada profile ID
    let businessProfile = profiles.find(p => p.id === 56956247);

    // Fall back to profile with "Canada" in name
    if (!businessProfile) {
      businessProfile = profiles.find(p =>
        p.type.toUpperCase() === 'BUSINESS' &&
        (p.businessName || '').toLowerCase().includes('canada')
      );
    }

    // Fall back to any business profile
    if (!businessProfile) {
      businessProfile = profiles.find(p => p.type.toUpperCase() === 'BUSINESS');
    }

    if (!businessProfile) {
      throw new WiseError('No business profile found');
    }

    console.log(`[Wise] Using business profile: ${businessProfile.id} (${businessProfile.businessName || businessProfile.fullName})`);
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
      let errorDetails = '';
      try {
        const errorBody = await response.json() as { message?: string; errors?: Array<{ message: string; code?: string; path?: string }> };
        errorMessage = errorBody.message || errorBody.errors?.[0]?.message || errorMessage;
        if (errorBody.errors && errorBody.errors.length > 0) {
          errorDetails = errorBody.errors.map(e => `${e.code || ''}: ${e.message} ${e.path ? `(${e.path})` : ''}`).join('; ');
        }
        console.error(`[Wise] API Error on ${path}:`, JSON.stringify(errorBody, null, 2));
      } catch {
        // Ignore JSON parse errors
      }
      throw new WiseError(errorDetails || errorMessage, response.status);
    }

    // Empty response
    if (response.status === 204) {
      return null as T;
    }

    return response.json() as Promise<T>;
  }

  /**
   * List all contacts from Wise using the v2 Contacts API.
   * This includes both bank account recipients AND Wise-to-Wise transfers.
   * Handles pagination to fetch ALL contacts.
   */
  async listContacts(): Promise<WiseContactV2[]> {
    const profileId = await this.getBusinessProfileId();
    const allContacts: WiseContactV2[] = [];
    let nextPage: string | null = null;
    let pageCount = 0;
    const maxPages = 10; // Safety limit

    do {
      const url: string = nextPage
        ? `/v2/profiles/${profileId}/contacts?page=${nextPage}`
        : `/v2/profiles/${profileId}/contacts`;

      const response: WiseContactsResponse = await this.request<WiseContactsResponse>('GET', url);
      const contacts = response.contacts || [];
      allContacts.push(...contacts);
      nextPage = response.nextPage;
      pageCount++;

      console.log(`[Wise] Fetched page ${pageCount}: ${contacts.length} contacts (total: ${allContacts.length})`);
    } while (nextPage && pageCount < maxPages);

    console.log(`[Wise] Found ${allContacts.length} total contact(s)`);
    return allContacts;
  }

  /**
   * List all recipients (accounts) from Wise.
   * Now uses Contacts API which includes Wise-to-Wise transfers.
   * Maps contacts to WiseRecipientAccount format for backwards compatibility.
   */
  async listRecipients(): Promise<WiseRecipientAccount[]> {
    const contacts = await this.listContacts();
    const profileId = await this.getBusinessProfileId();

    // Map contacts to WiseRecipientAccount format
    const recipients: WiseRecipientAccount[] = contacts
      .filter(c => c.active && !c.hidden && !c.self) // Only active, visible, non-self contacts
      .map((c, index) => {
        // Extract email from display details if available
        const emailDetail = c.display.details.find(d => d.label === 'Email');
        const email = emailDetail?.value;

        // Determine type from subtitle (e.g., "Wise account", "Bank Of Montreal ending ·· 8648")
        const isWiseAccount = c.display.subtitle.toLowerCase().includes('wise');
        const type = isWiseAccount ? 'wise' : 'bank';

        // Get primary currency - for Wise-to-Wise, default to CAD (Canada payments)
        // The capabilities may list AED first but we're doing CAD payments
        const primaryCurrency = isWiseAccount ? 'CAD' : (c.capabilities[0]?.currencies[0] || 'CAD');

        return {
          // Use more of the UUID to avoid collisions - take chars 0-8 and 9-12 for uniqueness
          id: parseInt(c.id.replace(/-/g, '').slice(0, 12), 16) % 2147483647 || (index + 1),
          creatorId: c.userId || 0,
          profileId: profileId,
          name: {
            fullName: c.name,
          },
          nickname: c.nickname || undefined,
          currency: primaryCurrency,
          country: 'CA', // Default to CA since this is for Canada payments
          type: type,
          legalEntityType: c.legalEntityType,
          email: email,
          active: c.active,
          details: {
            email: email,
          },
          accountSummary: c.display.subtitle,
          longAccountSummary: `${c.display.title} - ${c.display.subtitle}`,
          ownedByCustomer: c.self,
          // Store original UUID for Wise-to-Wise transfers
          contactUuid: c.id,
        };
      });

    console.log(`[Wise] Mapped ${recipients.length} recipient(s):`);
    for (const r of recipients) {
      const email = r.email || r.details?.email || r.details?.interacAccount || '-';
      console.log(`[Wise]   - ${r.name?.fullName} (type: ${r.type}, currency: ${r.currency}, uuid: ${r.contactUuid})`);
    }

    return recipients;
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
   * Get contact by ID (legacy - for bank account recipients).
   */
  async getContact(contactId: number): Promise<WiseContact | null> {
    return this.request<WiseContact>('GET', `/v1/accounts/${contactId}`);
  }

  /**
   * Get recipient accounts for a contact by UUID.
   * For Wise-to-Wise contacts, this returns their payable accounts.
   */
  async getContactAccounts(contactUuid: string): Promise<{ id: number; currency: string; type: string }[]> {
    const profileId = await this.getBusinessProfileId();
    console.log(`[Wise] Fetching accounts for contact ${contactUuid}`);

    try {
      const response = await this.request<{
        content: Array<{
          id: number;
          currency: string;
          type: string;
          details?: { accountNumber?: string };
        }>;
      }>('GET', `/v2/profiles/${profileId}/contacts/${contactUuid}/accounts`);

      const accounts = response?.content || [];
      console.log(`[Wise] Found ${accounts.length} account(s) for contact ${contactUuid}`);
      return accounts.map(a => ({ id: a.id, currency: a.currency, type: a.type }));
    } catch (err) {
      console.log(`[Wise] No accounts found for contact ${contactUuid}:`, err);
      return [];
    }
  }

  /**
   * Find recipient account ID for a contact, given the contact UUID and currency.
   * Used for Wise-to-Wise transfers.
   */
  async findRecipientAccountForContact(contactUuid: string, currency: string): Promise<number | null> {
    const accounts = await this.getContactAccounts(contactUuid);

    // Find account matching the currency
    const account = accounts.find(a => a.currency === currency);
    if (account) {
      console.log(`[Wise] Found ${currency} account ${account.id} for contact ${contactUuid}`);
      return account.id;
    }

    // If no exact match, try to find any account
    if (accounts.length > 0) {
      console.log(`[Wise] No ${currency} account, using first account ${accounts[0].id} for contact ${contactUuid}`);
      return accounts[0].id;
    }

    console.log(`[Wise] No accounts found for contact ${contactUuid}`);
    return null;
  }

  /**
   * Create an email recipient for Wise-to-Wise transfers.
   * This creates a v1/accounts entry that can be used for transfers.
   * When the recipient has a Wise account, funds go directly to their balance.
   *
   * @param name Full name of the recipient
   * @param email Recipient's email address
   * @param currency Target currency (e.g., 'CAD')
   * @returns The numeric account ID for use in transfers
   */
  async createEmailRecipient(
    name: string,
    email: string,
    currency: string
  ): Promise<number> {
    const profileId = await this.getBusinessProfileId();

    console.log(`[Wise] Creating email recipient: ${name} (${email}) for ${currency}`);

    const account = await this.request<{ id: number }>('POST', '/v1/accounts', {
      profile: profileId,
      accountHolderName: name,
      currency,
      type: 'email',
      details: {
        email,
      },
    });

    console.log(`[Wise] Email recipient created: ${account.id}`);
    return account.id;
  }

  /**
   * Discover a Wise contact by email using the Contact Discovery API.
   * This finds an existing Wise profile by identifier and creates a proper
   * contact linkage — enabling direct Wise-to-Wise transfers (no claim links).
   *
   * @param email The email address to discover
   * @returns The discovered contact with its UUID, or null if not found
   */
  async discoverContact(email: string): Promise<{ id: string; name: string } | null> {
    const profileId = await this.getBusinessProfileId();

    console.log(`[Wise] Discovering contact by email: ${email}`);

    try {
      const contact = await this.request<{
        id: string;
        name: string;
        active: boolean;
      }>('POST', `/v2/profiles/${profileId}/contacts?isDirectIdentifierCreation=true`, {
        identifier: {
          type: 'EMAIL',
          value: email,
        },
      });

      if (contact) {
        console.log(`[Wise] Discovered contact: ${contact.name} (${contact.id})`);
        return { id: contact.id, name: contact.name };
      }

      console.log(`[Wise] No Wise account found for email: ${email}`);
      return null;
    } catch (err) {
      console.log(`[Wise] Contact discovery failed for ${email}:`, err);
      return null;
    }
  }

  /**
   * Find an existing v1/accounts entry by account holder name (fuzzy match).
   * Useful for matching v2/contacts to their v1/accounts entry.
   *
   * @param name Account holder name to search for
   * @param currency Optional currency filter
   * @returns The account if found, null otherwise
   */
  async findAccountByName(name: string, currency?: string): Promise<{ id: number; type: string } | null> {
    const profileId = await this.getBusinessProfileId();
    const queryParams = currency ? `?profileId=${profileId}&currency=${currency}` : `?profileId=${profileId}`;
    const accounts = await this.request<Array<{ id: number; accountHolderName: string; type: string; currency: string }>>(
      'GET',
      `/v1/accounts${queryParams}`
    );

    // Try exact match first
    let account = accounts.find(a => a.accountHolderName.toLowerCase() === name.toLowerCase());

    // Try partial match if no exact match
    if (!account) {
      const nameParts = name.toLowerCase().split(' ');
      account = accounts.find(a => {
        const holderParts = a.accountHolderName.toLowerCase().split(' ');
        // Match if all name parts are found in the holder name
        return nameParts.every(part => holderParts.some(hp => hp.includes(part) || part.includes(hp)));
      });
    }

    if (account) {
      console.log(`[Wise] Found account by name "${name}": ${account.id} (${account.type})`);
      return { id: account.id, type: account.type };
    }

    console.log(`[Wise] No account found for name: ${name}`);
    return null;
  }

  /**
   * Create a quote for a transfer.
   * @param sourceCurrency Source currency (e.g., 'CAD')
   * @param targetCurrency Target currency (e.g., 'USD')
   * @param sourceAmount Amount in source currency
   * @param targetContactId Optional: Contact UUID for Wise-to-Wise transfers
   */
  async createQuote(
    sourceCurrency: string,
    targetCurrency: string,
    sourceAmount: number,
    targetContactId?: string
  ): Promise<WiseQuote> {
    const profileId = await this.getBusinessProfileId();

    const isWiseToWise = !!targetContactId;
    console.log(`[Wise] Creating quote: ${sourceAmount} ${sourceCurrency} -> ${targetCurrency}${isWiseToWise ? ` (Wise-to-Wise contact: ${targetContactId})` : ''}`);

    const quotePayload: Record<string, unknown> = {
      sourceCurrency,
      targetCurrency,
      sourceAmount,
      payOut: 'BALANCE', // Transfer to Wise balance
      payIn: 'BALANCE',  // Pay from Wise balance
    };

    // For Wise-to-Wise transfers, include targetContactId
    if (targetContactId) {
      quotePayload.targetContactId = targetContactId;
    }

    const quote = await this.request<WiseQuote>('POST', `/v3/profiles/${profileId}/quotes`, quotePayload);

    console.log(`[Wise] Quote created: ${quote.id}, rate: ${quote.rate}, target: ${quote.targetAmount} ${targetCurrency}`);
    return quote;
  }

  /**
   * Create a transfer using v1/transfers (for bank account recipients).
   * @param quoteId Quote ID from createQuote
   * @param targetAccountId Recipient account ID (numeric, from v1/accounts)
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
   * Create a transfer for Wise-to-Wise contacts.
   * Uses v1/transfers but omits targetAccount since it's embedded in the quote.
   * @param quoteId Quote ID from createQuote (must have targetContactId embedded)
   * @param reference Payment reference (max 10 chars)
   */
  async createTransferFromQuote(
    quoteId: string,
    reference: string
  ): Promise<WiseTransfer> {
    console.log(`[Wise] Creating Wise-to-Wise transfer: quote=${quoteId}, ref=${reference}`);

    // v1/transfers - when quote has targetContactId, targetAccount is not required
    const transfer = await this.request<WiseTransfer>('POST', `/v1/transfers`, {
      quoteUuid: quoteId,
      customerTransactionId: crypto.randomUUID(),
      details: {
        reference: reference.substring(0, 10),
        sourceOfFunds: 'verification.source.of.funds.other',
      },
    });

    if (!transfer) {
      throw new WiseError('Failed to create transfer - API returned empty response');
    }

    console.log(`[Wise] Wise-to-Wise transfer created: ${transfer.id}, status: ${transfer.status}`);
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

    // types parameter is REQUIRED for v4 balances API
    const balances = await this.request<WiseBalance[]>(
      'GET',
      `/v4/profiles/${profileId}/balances?types=STANDARD`
    );

    // Log what we got
    console.log(`[Wise] Raw balances:`, JSON.stringify(balances.map(b => ({
      id: b.id,
      currency: b.currency,
      type: (b as any).type,
      amount: b.amount,
    }))));

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
