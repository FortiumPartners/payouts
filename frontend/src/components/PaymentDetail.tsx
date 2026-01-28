/**
 * Payment detail panel component.
 * Displays expanded payment information in a grid layout.
 */

import { PaymentDetail } from '../lib/api';

interface PaymentDetailPanelProps {
  detail: PaymentDetail;
}

export function PaymentDetailPanel({ detail }: PaymentDetailPanelProps) {
  return (
    <div className="p-4 bg-muted/50 grid grid-cols-2 md:grid-cols-4 gap-4">
      <div>
        <p className="text-sm text-muted-foreground">Client</p>
        <p className="font-medium">{detail.clientName || '—'}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Payment Method</p>
        <p className="font-medium">{detail.paymentMethod}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Reference #</p>
        <p className="font-medium">{detail.referenceNumber || '—'}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Invoice #</p>
        <p className="font-medium">{detail.invoiceNumber || '—'}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Bill #</p>
        <p className="font-medium">{detail.billNumber || '—'}</p>
      </div>
      <div>
        <p className="text-sm text-muted-foreground">Description</p>
        <p className="font-medium text-sm">{detail.description || '—'}</p>
      </div>
      <div className="col-span-2">
        <p className="text-sm text-muted-foreground">PartnerConnect</p>
        {detail.pcBillLink ? (
          <a
            href={detail.pcBillLink}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            View Bill →
          </a>
        ) : (
          <p className="text-muted-foreground">—</p>
        )}
      </div>
    </div>
  );
}
