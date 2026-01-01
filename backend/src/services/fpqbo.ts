/**
 * fpqbo API client for QuickBooks invoice and bill data.
 * Uses API key authentication.
 */

import { config } from '../lib/config.js';

// Error types
export class FpqboError extends Error {
  constructor(message: string, public statusCode?: number) {
    super(message);
    this.name = 'FpqboError';
  }
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

/**
 * fpqbo API client for QuickBooks data access.
 */
export class FpqboClient {
  private apiUrl: string;
  private apiKey: string;
  private tenant: 'US' | 'CA';

  constructor(tenant: 'US' | 'CA' = 'US', options?: {
    apiUrl?: string;
    apiKey?: string;
  }) {
    this.tenant = tenant;
    this.apiUrl = (options?.apiUrl || config.FPQBO_API_URL || '').replace(/\/$/, '');
    this.apiKey = options?.apiKey || (tenant === 'US'
      ? config.FPQBO_API_KEY_US || ''
      : config.FPQBO_API_KEY_CA || '');
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
        const errorData = await response.json().catch(() => ({})) as { message?: string; error?: string };
        throw new FpqboError(
          errorData.message || errorData.error || `API error ${response.status}`,
          response.status
        );
      }

      return await response.json() as T;
    } catch (err) {
      if (err instanceof FpqboError) throw err;
      throw new FpqboError(`Request failed: ${err}`);
    }
  }

  /**
   * Get invoice by ID.
   */
  async getInvoice(invoiceId: string): Promise<QBOInvoice> {
    const data = await this.request<any>('GET', `/api/invoices/${invoiceId}`);
    return this.mapInvoice(data);
  }

  /**
   * Check if an invoice has been paid.
   */
  async isInvoicePaid(invoiceId: string): Promise<{
    paid: boolean;
    paidDate?: Date;
    voided: boolean;
    voidedDate?: Date;
  }> {
    const invoice = await this.getInvoice(invoiceId);
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
    const data = await this.request<any>('GET', `/api/bills/${billId}`);
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
   */
  private mapInvoice(data: Record<string, unknown>): QBOInvoice {
    const status = String(data.status || data.Status || 'Open');
    return {
      id: String(data.id || data.Id || ''),
      docNumber: String(data.docNumber || data.DocNumber || ''),
      totalAmount: Number(data.totalAmount || data.TotalAmt || 0),
      balance: Number(data.balance || data.Balance || 0),
      status: status as QBOInvoice['status'],
      paidDate: data.paidDate || data.PaidDate
        ? new Date(String(data.paidDate || data.PaidDate))
        : undefined,
      voidedDate: data.voidedDate || data.VoidedDate
        ? new Date(String(data.voidedDate || data.VoidedDate))
        : undefined,
      customerId: String(data.customerId || data.CustomerRef?.value || ''),
      customerName: String(data.customerName || data.CustomerRef?.name || ''),
    };
  }

  /**
   * Map API response to QBOBill.
   */
  private mapBill(data: Record<string, unknown>): QBOBill {
    return {
      id: String(data.id || data.Id || ''),
      docNumber: String(data.docNumber || data.DocNumber || ''),
      totalAmount: Number(data.totalAmount || data.TotalAmt || 0),
      balance: Number(data.balance || data.Balance || 0),
      vendorId: String(data.vendorId || (data.VendorRef as any)?.value || ''),
      vendorName: String(data.vendorName || (data.VendorRef as any)?.name || ''),
      dueDate: new Date(String(data.dueDate || data.DueDate)),
    };
  }

  /**
   * Check if client is configured.
   */
  isConfigured(): boolean {
    return !!(this.apiUrl && this.apiKey);
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
