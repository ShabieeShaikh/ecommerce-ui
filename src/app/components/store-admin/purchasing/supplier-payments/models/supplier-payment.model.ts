import type { SupplierInvoice } from '../../supplier-invoices/models/supplier-invoice.model';

export type SupplierPaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other';

export interface SupplierPayment {
  id: string;
  paymentNumber: string;
  storeId: SupplierInvoice['storeId'];
  supplierId: SupplierInvoice['supplierId'];
  supplierName: string;
  supplierInvoiceId: SupplierInvoice['id'];
  invoiceNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: SupplierPaymentMethod;
  referenceNumber?: string;
  notes?: string;
  createdAt: string;
}

export interface CreateSupplierPaymentRequest {
  supplierInvoiceId: SupplierInvoice['id'];
  paymentDate: string;
  amount: number;
  paymentMethod: SupplierPaymentMethod;
  referenceNumber?: string;
  notes?: string;
}
