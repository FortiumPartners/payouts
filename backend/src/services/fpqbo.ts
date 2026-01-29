/**
 * fpqbo API client for QuickBooks invoice and bill data.
 * Uses API key authentication against qbo-oauth service.
 */

import { config } from '../lib/config.js';

// Error types
export class FpqboError extends Error {
  constructor(message: string, public statusCode?: number, public isNotFound: boolean = false) {
    super(message);
    this.name = 'FpqboError';
  }
}

// Check if error indicates object not found (deleted/inactive in QBO)
function isNotFoundError(statusCode: number, errorData: Record<string, unknown>): boolean {
  const detail = String(errorData.detail || errorData.message || errorData.error || '');
  return (
    statusCode === 404 ||
    (statusCode === 500 && detail.includes('Object Not Found')) ||
    detail.includes('610:') // QBO error code for not found
  );
}

// Types
export interface QBOInvoice {
  id: string;
  docNumber: string;
  totalAmount: number;
  balance: number;
  status: 'Paid' | 'Open' | 'Overdue' | 'Voided';
  paidDate?: Date;
  voidedDate?: Date;
  customerId: string;
  customerName: string;
}

export interface QBOBill {
  id: string;
  docNumber: string;
  totalAmount: number;
  balance: number;
  vendorId: string;
  vendorName: string;
  dueDate: Date;
}

// Internal company IDs in qbo-oauth database
const COMPANY_IDS: Record<string, string> = {
  US: '1',
  CA: '2',
};

/**
 * fpqbo API client for QuickBooks data access.
 */
export class FpqboClient {
  private apiUrl: string;
  private apiKey: string;
  private tenant: 'US' | 'CA';
  private companyId: string;

  constructor(tenant: 'US' | 'CA' = 'US', options?: {
    apiUrl?: string;
    apiKey?: string;
  }) {
    this.tenant = tenant;
    this.apiUrl = (options?.apiUrl || config.FPQBO_API_URL || '').replace(/\/$/, '');
    this.apiKey = options?.apiKey || (tenant === 'US'
      ? config.FPQBO_API_KEY_US || ''
      : config.FPQBO_API_KEY_CA || '');
    this.companyId = COMPANY_IDS[tenant];
  }

  /**
   * Make authenticated API request.
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    if (!this.apiKey) {
      throw new FpqboError(`fpqbo API key not configured for ${this.tenant} tenant`);
    }

    const url = `${this.apiUrl}${endpoint}`;
    console.log(`[fpqbo] ${method} ${url}`);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'X-API-Key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;

        // Check if this is a "not found" case (deleted/inactive in QBO)
        if (isNotFoundError(response.status, errorData)) {
          // This is a normal business case - log at info level, not error
          console.log(`[fpqbo] Object not found (deleted/inactive in QBO)`);
          throw new FpqboError(
            'Object not found in QBO',
            response.status,
            true // isNotFound flag
          );
        }

        // Actual error - log details
        console.log(`[fpqbo] Response status: ${response.status}`);
        console.log(`[fpqbo] Error response:`, errorData);
        throw new FpqboError(
          String(errorData.message || errorData.error || errorData.detail || `API error ${response.status}`),
          response.status
        );
      }

      console.log(`[fpqbo] Response status: ${response.status}`);

      return await response.json() as T;
    } catch (err) {
      if (err instanceof FpqboError) throw err;
      console.log(`[fpqbo] Request error:`, err);
      throw new FpqboError(`Request failed: ${err}`);
    }
  }

  /**
   * Get invoice by DocNumber (e.g., "10044").
   * Uses the /by-doc-number endpoint which is what PartnerConnect stores.
   */
  async getInvoiceByDocNumber(docNumber: string): Promise<QBOInvoice> {
    const data = await this.request<any>('GET', `/api/invoices/by-doc-number/${docNumber}?company_id=${this.companyId}`);
    return this.mapInvoice(data);
  }

  /**
   * Check if an invoice has been paid.
   * @param docNumber - The invoice DocNumber (e.g., "10044") from PartnerConnect's externalInvoiceDocNum
   */
  async isInvoicePaid(docNumber: string): Promise<{
    paid: boolean;
    paidDate?: Date;
    voided: boolean;
    voidedDate?: Date;
  }> {
    const invoice = await this.getInvoiceByDocNumber(docNumber);
    return {
      paid: invoice.status === 'Paid',
      paidDate: invoice.paidDate,
      voided: invoice.status === 'Voided',
      voidedDate: invoice.voidedDate,
    };
  }

  /**
   * Get bill by ID.
   */
  async getBill(billId: string): Promise<QBOBill> {
    const data = await this.request<any>('GET', `/api/bills/${billId}?company_id=${this.companyId}`);
    return this.mapBill(data);
  }

  /**
   * Get bill amount for validation.
   */
  async getBillAmount(billId: string): Promise<number> {
    const bill = await this.getBill(billId);
    return bill.totalAmount;
  }

  /**
   * Map API response to QBOInvoice.
   * Infers status from Balance: 0 = Paid, >0 = Open
   */
  private mapInvoice(data: Record<string, unknown>): QBOInvoice {
    const balance = Number(data.balance || data.Balance || 0);
    const customerRef = data.CustomerRef as Record<string, unknown> | undefined;

    // Determine status from balance
    let status: QBOInvoice['status'] = 'Open';
    if (balance === 0) {
      status = 'Paid';
    }

    return {
      id: String(data.id || data.Id || ''),
      docNumber: String(data.docNumber || data.DocNumber || ''),
      totalAmount: Number(data.totalAmount || data.TotalAmt || 0),
      balance,
      status,
      paidDate: data.paidDate || data.PaidDate
        ? new Date(String(data.paidDate || data.PaidDate))
        : undefined,
      voidedDate: data.voidedDate || data.VoidedDate
        ? new Date(String(data.voidedDate || data.VoidedDate))
        : undefined,
      customerId: String(data.customerId || customerRef?.value || ''),
      customerName: String(data.customerName || customerRef?.name || ''),
    };
  }

  /**
   * Map API response to QBOBill.
   */
  private mapBill(data: Record<string, unknown>): QBOBill {
    const vendorRef = data.VendorRef as Record<string, unknown> | undefined;
    return {
      id: String(data.id || data.Id || ''),
      docNumber: String(data.docNumber || data.DocNumber || ''),
      totalAmount: Number(data.totalAmount || data.TotalAmt || 0),
      balance: Number(data.balance || data.Balance || 0),
      vendorId: String(data.vendorId || vendorRef?.value || ''),
      vendorName: String(data.vendorName || vendorRef?.name || ''),
      dueDate: new Date(String(data.dueDate || data.DueDate)),
    };
  }

  /**
   * Check if client is configured.
   */
  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey);
  }

  /**
   * Health check - verify API connectivity.
   */
  async healthCheck(): Promise<void> {
    // Try to fetch a known invoice to verify connectivity
    // This will throw if there's an auth or connectivity issue
    const response = await fetch(`${this.apiUrl}/health`, {
      headers: { 'X-API-Key': this.apiKey },
    });
    if (!response.ok) {
      throw new FpqboError(`Health check failed: ${response.status}`);
    }
  }
}

// Factory for getting tenant-specific clients
const clients: Record<string, FpqboClient> = {};

export function getFpqboClient(tenant: 'US' | 'CA' = 'US'): FpqboClient {
  if (!clients[tenant]) {
    clients[tenant] = new FpqboClient(tenant);
  }
  return clients[tenant];
}
