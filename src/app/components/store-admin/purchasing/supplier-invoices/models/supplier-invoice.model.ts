import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderProductId,
  PurchaseOrderStoreId,
  PurchaseOrderSupplierId,
  PurchaseOrderVariantId,
} from '../../purchase-orders/models/purchase-order.model';

export type SupplierInvoiceStatus =
  'draft' | 'pending_review' | 'approved' | 'partially_paid' | 'paid' | 'cancelled';

export type SupplierInvoiceMatchStatus = 'not_checked' | 'matched' | 'mismatch';

export interface SupplierInvoiceItem {
  id: string;
  purchaseOrderItemId: PurchaseOrderItem['id'];
  productId: PurchaseOrderProductId;
  variantId: PurchaseOrderVariantId | null;
  productName: string;
  variantName?: string;
  sku: string;
  invoicedQuantity: number;
  unitPrice: number;
  lineTotal: number;
}

export interface SupplierInvoice {
  id: string;
  storeId: PurchaseOrderStoreId;
  invoiceNumber: string;
  supplierId: PurchaseOrderSupplierId;
  supplierName: string;
  purchaseOrderId: PurchaseOrder['id'];
  poNumber: PurchaseOrder['poNumber'];
  invoiceDate: string;
  dueDate?: string;
  items: SupplierInvoiceItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: SupplierInvoiceStatus;
  matchStatus: SupplierInvoiceMatchStatus;
  matchCheckedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CreateSupplierInvoiceItemRequest {
  purchaseOrderItemId: PurchaseOrderItem['id'];
  invoicedQuantity: number;
  unitPrice: number;
}

export interface CreateSupplierInvoiceRequest {
  purchaseOrderId: PurchaseOrder['id'];
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  items: CreateSupplierInvoiceItemRequest[];
  taxAmount: number;
  discountAmount: number;
  notes?: string;
}

export interface UpdateSupplierInvoiceRequest {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  items: CreateSupplierInvoiceItemRequest[];
  taxAmount: number;
  discountAmount: number;
  notes?: string;
}
