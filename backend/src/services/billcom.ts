/**
 * Bill.com API v2 client for US payments.
 * Uses session-based authentication with MFA support.
 *
 * Docs: https://developer.bill.com/reference/api-reference-overview
 *
 * Note: v2 API is used because the dev key only works with v2 endpoints.
 * v3 API requires different authentication.
 */

import { config } from '../lib/config.js';

// Error types
export class BillComError extends Error {
  constructor(message: string, public statusCode?: number, public errorCode?: string) {
    super(message);
    this.name = 'BillComError';
  }
}

export class BillComAuthError extends BillComError {
  constructor(message: string) {
    super(message, 401);
    this.name = 'BillComAuthError';
  }
}

export class BillComMfaRequired extends BillComError {
  constructor(message: string) {
    super(message, 403, 'MFA_REQUIRED');
    this.name = 'BillComMfaRequired';
  }
}

// Types
export interface BillComVendor {
  id: string;
  name: string;
  email?: string;
  isActive: boolean;
  paymentEmail?: string;
  accountNumber?: string;
}

export interface BillComBill {
  id: string;
  vendorId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  dueAmount: number;
  paymentStatus: string;
  approvalStatus: string;
}

export interface BillComPayment {
  id: string;
  billId: string;
  vendorId: string;
  amount: number;
  status: string;
  processDate?: string;
}

// v2 API base URL (v3 requires different dev key registration)
const V2_API_URL = 'https://api.bill.com/api/v2';

/**
 * Bill.com API v2 client with session and MFA management.
 */
export class BillComClient {
  private apiUrl: string;
  private username: string;
  private password: string;
  private devKey: string;
  private orgId: string;
  private mfaId: string;
  private deviceId: string;

  // Session cache
  private sessionId: string | null = null;
  private sessionTrusted = false;
  private sessionExpiresAt = 0;
  private readonly SESSION_DURATION = 30 * 60 * 1000; // 30 minutes

  constructor(options?: {
    apiUrl?: string;
    username?: string;
    password?: string;
    devKey?: string;
    orgId?: string;
    mfaId?: string;
    deviceId?: string;
  }) {
    this.apiUrl = options?.apiUrl || config.BILLCOM_API_URL || V2_API_URL;
    this.username = options?.username || config.BILLCOM_USERNAME || '';
    this.password = options?.password || config.BILLCOM_PASSWORD || '';
    this.devKey = options?.devKey || config.BILLCOM_DEV_KEY || '';
    this.orgId = options?.orgId || config.BILLCOM_ORG_ID || '';
    // MFA credentials - once set up, these persist for 30 days
    this.mfaId = options?.mfaId || config.BILLCOM_MFA_ID || '';
    this.deviceId = options?.deviceId || config.BILLCOM_DEVICE_ID || 'fortium-payouts';

    // Ensure we're using v2 URL
    if (this.apiUrl && this.apiUrl.includes('gateway.prod.bill.com')) {
      this.apiUrl = V2_API_URL;
    }
  }

  /**
   * Login and get session ID.
   * If mfaId is set, creates an MFA-trusted session for payments.
   */
  private async login(): Promise<string> {
    // Return cached session if still valid
    if (this.sessionId && Date.now() < this.sessionExpiresAt) {
      console.log(`[Bill.com] Using cached session`);
      return this.sessionId;
    }

    if (!this.username || !this.password || !this.devKey || !this.orgId) {
      console.log(`[Bill.com] Credentials not configured`);
      throw new BillComAuthError('Bill.com credentials not configured');
    }
    console.log(`[Bill.com] Logging in as ${this.username}...`);

    // v2 API uses form-urlencoded with userName and orgId field names
    const params = new URLSearchParams();
    params.append('userName', this.username);
    params.append('password', this.password);
    params.append('devKey', this.devKey);
    params.append('orgId', this.orgId);

    // Include MFA credentials for trusted session
    if (this.mfaId) {
      params.append('mfaId', this.mfaId);
      params.append('deviceId', this.deviceId);
    }

    const response = await fetch(`${this.apiUrl}/Login.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const data = await response.json() as {
      response_status: number;
      response_message: string;
      response_data: {
        sessionId?: string;
        error_code?: string;
        error_message?: string;
      };
    };

    console.log(`[Bill.com] Login response status: ${response.status}, api_status: ${data.response_status}`);

    if (data.response_status !== 0 || !data.response_data?.sessionId) {
      const errorMsg = data.response_data?.error_message || data.response_message || 'Unknown error';
      console.log(`[Bill.com] Login failed: ${errorMsg}`);
      throw new BillComAuthError(`Login failed: ${errorMsg}`);
    }

    console.log(`[Bill.com] Login successful`);
    this.sessionId = data.response_data.sessionId;
    this.sessionTrusted = !!this.mfaId; // Trusted if MFA was provided
    this.sessionExpiresAt = Date.now() + this.SESSION_DURATION;

    return this.sessionId;
  }

  /**
   * Make authenticated API request using v2 API format.
   * v2 uses form-urlencoded with sessionId, devKey, and optional data JSON.
   */
  private async request<T>(
    endpoint: string,
    data?: Record<string, unknown>
  ): Promise<T> {
    const sessionId = await this.login();

    const url = `${this.apiUrl}${endpoint}`;
    console.log(`[Bill.com] POST ${url}`);

    const params = new URLSearchParams();
    params.append('sessionId', sessionId);
    params.append('devKey', this.devKey);
    if (data) {
      params.append('data', JSON.stringify(data));
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });

    const result = await response.json() as {
      response_status: number;
      response_message: string;
      response_data: T | { error_code?: string; error_message?: string };
    };

    console.log(`[Bill.com] Response status: ${response.status}, api_status: ${result.response_status}`);

    // Session expired - clear and retry once
    if (result.response_status === 1 &&
        (result.response_data as { error_code?: string })?.error_code === 'BDC_1109') {
      console.log(`[Bill.com] Session expired, retrying...`);
      this.sessionId = null;
      this.sessionExpiresAt = 0;
      return this.request(endpoint, data);
    }

    if (result.response_status !== 0) {
      const errorData = result.response_data as { error_code?: string; error_message?: string };
      console.log(`[Bill.com] Error response:`, errorData);
      throw new BillComError(
        errorData?.error_message || result.response_message || 'API error',
        response.status,
        errorData?.error_code
      );
    }

    return result.response_data as T;
  }

  /**
   * Find vendor by name using v2 List/Vendor.json with filters.
   */
  async findVendor(searchTerm: string): Promise<BillComVendor | null> {
    const results = await this.request<Array<{
      entity: string;
      id: string;
      isActive: string;
      name: string;
      email?: string;
      paymentEmail?: string;
      accNumber?: string;
    }>>(
      '/List/Vendor.json',
      {
        start: 0,
        max: 10,
        filters: [{ field: 'name', op: '=', value: searchTerm }],
      }
    );

    if (!results || results.length === 0) return null;

    const vendor = results[0];
    return {
      id: vendor.id,
      name: vendor.name,
      email: vendor.email,
      isActive: vendor.isActive === '1',
      paymentEmail: vendor.paymentEmail,
      accountNumber: vendor.accNumber,
    };
  }

  /**
   * Get vendor by ID using v2 Read/Vendor.json.
   */
  async getVendor(vendorId: string): Promise<BillComVendor | null> {
    try {
      const vendor = await this.request<{
        id: string;
        isActive: string;
        name: string;
        email?: string;
        paymentEmail?: string;
        accNumber?: string;
      }>('/Read/Vendor.json', { id: vendorId });

      return {
        id: vendor.id,
        name: vendor.name,
        email: vendor.email,
        isActive: vendor.isActive === '1',
        paymentEmail: vendor.paymentEmail,
        accountNumber: vendor.accNumber,
      };
    } catch {
      return null;
    }
  }

  /**
   * Find bill by invoice number using v2 List/Bill.json with filters.
   */
  async findBill(invoiceNumber: string): Promise<BillComBill | null> {
    const results = await this.request<Array<{
      entity: string;
      id: string;
      vendorId: string;
      invoiceNumber: string;
      invoiceDate: string;
      dueDate: string;
      amount: number;
      dueAmount: number;
      paymentStatus: string;
      approvalStatus: string;
    }>>(
      '/List/Bill.json',
      {
        start: 0,
        max: 1,
        filters: [{ field: 'invoiceNumber', op: '=', value: invoiceNumber }],
      }
    );

    if (!results || results.length === 0) return null;

    const bill = results[0];
    return {
      id: bill.id,
      vendorId: bill.vendorId,
      invoiceNumber: bill.invoiceNumber,
      invoiceDate: bill.invoiceDate,
      dueDate: bill.dueDate,
      amount: bill.amount,
      dueAmount: bill.dueAmount,
      paymentStatus: bill.paymentStatus,
      approvalStatus: bill.approvalStatus,
    };
  }

  /**
   * Get bill by ID using v2 Read/Bill.json.
   */
  async getBill(billId: string): Promise<BillComBill | null> {
    try {
      const bill = await this.request<{
        id: string;
        vendorId: string;
        invoiceNumber: string;
        invoiceDate: string;
        dueDate: string;
        amount: number;
        dueAmount: number;
        paymentStatus: string;
        approvalStatus: string;
      }>('/Read/Bill.json', { id: billId });

      return {
        id: bill.id,
        vendorId: bill.vendorId,
        invoiceNumber: bill.invoiceNumber,
        invoiceDate: bill.invoiceDate,
        dueDate: bill.dueDate,
        amount: bill.amount,
        dueAmount: bill.dueAmount,
        paymentStatus: bill.paymentStatus,
        approvalStatus: bill.approvalStatus,
      };
    } catch {
      return null;
    }
  }

  /**
   * Initiate MFA challenge - sends SMS code to registered phone.
   * Call this to start MFA setup or refresh.
   * Note: v2 API uses MFAChallenge.json endpoint.
   */
  async initiateMfaChallenge(): Promise<{ challengeId: string }> {
    await this.login();
    const result = await this.request<{ challengeId: string }>('/MFAChallenge.json', {});
    return result;
  }

  /**
   * Validate MFA challenge with SMS code.
   * Returns mfaId to store for future trusted sessions.
   * Note: v2 API uses MFAAuthenticate.json endpoint.
   */
  async validateMfaChallenge(challengeId: string, token: string): Promise<{ mfaId: string }> {
    const result = await this.request<{ mfaId: string }>(
      '/MFAAuthenticate.json',
      { challengeId, token, deviceId: this.deviceId, machineName: this.deviceId }
    );
    // Update local mfaId for this session
    this.mfaId = result.mfaId;
    return { mfaId: result.mfaId };
  }

  /**
   * Check if current session is MFA-trusted (required for payments).
   */
  isTrusted(): boolean {
    return this.sessionTrusted;
  }

  /**
   * Pay a bill. Requires MFA-trusted session.
   * Note: v2 API uses PayBills.json endpoint.
   */
  async payBill(billId: string, amount: number, processDate?: string): Promise<BillComPayment> {
    if (!this.sessionTrusted && !this.mfaId) {
      throw new BillComMfaRequired('MFA required for payments. Call initiateMfaChallenge() first.');
    }

    // Get the bill first to get vendor ID
    const bill = await this.getBill(billId);
    if (!bill) {
      throw new BillComError(`Bill not found: ${billId}`);
    }

    // Create the payment using v2 PayBills endpoint
    const result = await this.request<Array<{
      id: string;
      vendorId: string;
      amount: number;
      status: string;
      processDate: string;
    }>>('/PayBills.json', {
      vendorId: bill.vendorId,
      processDate: processDate || new Date().toISOString().split('T')[0],
      billPays: [{ billId, amount }],
    });

    const payment = result[0];
    return {
      id: payment.id,
      billId: billId,
      vendorId: payment.vendorId,
      amount: payment.amount,
      status: payment.status,
      processDate: payment.processDate,
    };
  }

  /**
   * Check if client is configured.
   */
  isConfigured(): boolean {
    return !!(this.apiUrl && this.username && this.password && this.devKey && this.orgId);
  }

  /**
   * Check if MFA is configured for payments.
   */
  isMfaConfigured(): boolean {
    return !!this.mfaId;
  }
}

// Singleton instance
let billComClient: BillComClient | null = null;

export function getBillComClient(): BillComClient {
  if (!billComClient) {
    billComClient = new BillComClient();
  }
  return billComClient;
}
