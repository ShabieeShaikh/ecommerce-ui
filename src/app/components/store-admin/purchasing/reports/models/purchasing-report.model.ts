import type { GoodsReceipt } from '../../goods-receipts/models/goods-receipt.model';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../../purchase-orders/models/purchase-order.model';
import type {
  PurchaseReturn,
  PurchaseReturnReason,
} from '../../purchase-returns/models/purchase-return.model';
import type {
  SupplierInvoice,
  SupplierInvoiceMatchStatus,
  SupplierInvoiceStatus,
} from '../../supplier-invoices/models/supplier-invoice.model';
import type {
  SupplierPayment,
  SupplierPaymentMethod,
} from '../../supplier-payments/models/supplier-payment.model';
import type { Supplier } from '../../suppliers/models/supplier.model';

export type PurchasingReportPreset =
  | 'last_7_days'
  | 'last_30_days'
  | 'this_month'
  | 'last_month'
  | 'this_year'
  | 'custom';

export interface PurchasingReportFilters {
  storeId: string;
  fromDate?: string;
  toDate?: string;
  supplierId: Supplier['id'] | null;
  purchaseOrderStatus: PurchaseOrderStatus | 'all';
  invoiceStatus: SupplierInvoiceStatus | 'all';
}

export interface PurchasingReportSourceData {
  suppliers: readonly Supplier[];
  purchaseOrders: readonly PurchaseOrder[];
  goodsReceipts: readonly GoodsReceipt[];
  invoices: readonly SupplierInvoice[];
  payments: readonly SupplierPayment[];
  purchaseReturns: readonly PurchaseReturn[];
}

export interface PurchasingOverviewReport {
  totalPurchaseOrders: number;
  totalPurchaseValue: number;
  unitsReceived: number;
  outstandingPayables: number;
  totalPaid: number;
  unitsReturned: number;
  returnDocuments: number;
  netRetainedUnits: number;
}

export interface BreakdownRow<T extends string> {
  key: T;
  label: string;
  count: number;
  amount?: number;
  percentage: number;
}

export interface TrendPoint {
  key: string;
  label: string;
  value: number;
}

export interface PurchaseOrderReportRow {
  id: string;
  poNumber: string;
  supplierName: string;
  orderDate: string;
  status: PurchaseOrderStatus;
  itemCount: number;
  orderedUnits: number;
  receivedUnits: number;
  totalAmount: number;
}

export interface SupplierPurchaseRow {
  supplierId: number;
  supplierName: string;
  purchaseOrderCount: number;
  purchaseValue: number;
}

export interface ReceivingPerformanceRow {
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  orderedUnits: number;
  receivedUnits: number;
  remainingUnits: number;
  status: PurchaseOrderStatus;
  lastReceiptDate?: string;
}

export interface GoodsReceiptReportRow {
  id: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  receivingLocationName: string;
  receivedDate: string;
  unitsReceived: number;
}

export interface SupplierPerformanceRow {
  supplierId: number;
  supplierName: string;
  purchaseOrderCount: number;
  purchaseValue: number;
  unitsReceived: number;
  invoicedAmount: number;
  amountPaid: number;
  outstandingAmount: number;
  returnedUnits: number;
  returnRate: number;
}

export interface InvoiceReportRow {
  id: string;
  invoiceNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  invoiceDate: string;
  dueDate?: string;
  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;
  status: SupplierInvoiceStatus;
  matchStatus: SupplierInvoiceMatchStatus;
  overdue: boolean;
}

export interface PaymentReportRow {
  id: string;
  paymentNumber: string;
  supplierInvoiceId: string;
  invoiceNumber: string;
  supplierName: string;
  paymentDate: string;
  paymentMethod: SupplierPaymentMethod;
  amount: number;
}

export interface PurchaseReturnReportRow {
  id: string;
  returnNumber: string;
  goodsReceiptId: string;
  grnNumber: string;
  purchaseOrderId: string;
  poNumber: string;
  supplierName: string;
  returnDate: string;
  reason: PurchaseReturnReason;
  returnedUnits: number;
}

export interface PurchasingReport {
  overview: PurchasingOverviewReport;
  purchaseOrders: {
    statusBreakdown: BreakdownRow<PurchaseOrderStatus>[];
    valueTrend: TrendPoint[];
    topSuppliers: SupplierPurchaseRow[];
    rows: PurchaseOrderReportRow[];
  };
  receiving: {
    totalGrns: number;
    unitsReceived: number;
    partiallyReceivedPurchaseOrders: number;
    fullyReceivedPurchaseOrders: number;
    orderedUnits: number;
    lifecycleReceivedUnits: number;
    outstandingUnits: number;
    trend: TrendPoint[];
    performanceRows: ReceivingPerformanceRow[];
    rows: GoodsReceiptReportRow[];
  };
  suppliers: SupplierPerformanceRow[];
  invoices: {
    totalInvoices: number;
    outstandingAmount: number;
    statusBreakdown: BreakdownRow<SupplierInvoiceStatus>[];
    matchBreakdown: BreakdownRow<SupplierInvoiceMatchStatus>[];
    mismatchRows: InvoiceReportRow[];
    rows: InvoiceReportRow[];
  };
  accountsPayable: {
    totalApprovedPayable: number;
    totalPaid: number;
    outstandingBalance: number;
    partiallyPaidInvoices: number;
    paidInvoices: number;
    overdueInvoices: number;
    overdueAmount: number;
    outstandingRows: InvoiceReportRow[];
  };
  payments: {
    totalPayments: number;
    totalPaid: number;
    trend: TrendPoint[];
    methodBreakdown: BreakdownRow<SupplierPaymentMethod>[];
    rows: PaymentReportRow[];
  };
  returns: {
    totalDocuments: number;
    unitsReturned: number;
    suppliersWithReturns: number;
    topReason?: PurchaseReturnReason;
    reasonBreakdown: BreakdownRow<PurchaseReturnReason>[];
    rows: PurchaseReturnReportRow[];
  };
  hasActivity: boolean;
}
