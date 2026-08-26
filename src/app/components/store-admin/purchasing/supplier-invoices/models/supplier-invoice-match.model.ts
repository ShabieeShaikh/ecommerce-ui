import type { SupplierInvoice, SupplierInvoiceItem } from './supplier-invoice.model';

export type SupplierInvoiceMatchIssueType =
  | 'invoice_quantity_exceeds_received'
  | 'invoice_quantity_exceeds_ordered'
  | 'price_mismatch'
  | 'missing_purchase_order'
  | 'missing_po_item'
  | 'invalid_invoice_item'
  | 'invalid_relationship'
  | 'received_quantity_integrity';

export interface SupplierInvoiceMatchIssue {
  type: SupplierInvoiceMatchIssueType;
  purchaseOrderItemId?: SupplierInvoiceItem['purchaseOrderItemId'];
  productName?: string;
  message: string;
}

export interface SupplierInvoiceItemMatchResult {
  purchaseOrderItemId: SupplierInvoiceItem['purchaseOrderItemId'];
  productId: SupplierInvoiceItem['productId'];
  variantId: SupplierInvoiceItem['variantId'];
  productName: string;
  variantName?: string;
  sku: string;
  orderedQuantity: number;
  receivedQuantity: number;
  previouslyInvoicedQuantity: number;
  availableToInvoice: number;
  invoicedQuantity: number;
  purchaseOrderUnitPrice: number;
  invoiceUnitPrice: number;
  quantityMatched: boolean;
  priceMatched: boolean;
  quantityDifference: number;
  priceDifference: number;
  matched: boolean;
}

export interface SupplierInvoiceMatchResult {
  invoiceId: SupplierInvoice['id'];
  purchaseOrderId: SupplierInvoice['purchaseOrderId'];
  matched: boolean;
  quantityMatched: boolean;
  priceMatched: boolean;
  itemResults: SupplierInvoiceItemMatchResult[];
  issues: SupplierInvoiceMatchIssue[];
  checkedAt: string;
}
