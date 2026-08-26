import { Injectable, inject } from '@angular/core';

import type { GoodsReceipt } from '../components/store-admin/purchasing/goods-receipts/models/goods-receipt.model';
import type {
  BreakdownRow,
  GoodsReceiptReportRow,
  InvoiceReportRow,
  PaymentReportRow,
  PurchaseOrderReportRow,
  PurchaseReturnReportRow,
  PurchasingReport,
  PurchasingReportFilters,
  PurchasingReportSourceData,
  ReceivingPerformanceRow,
  SupplierPerformanceRow,
  SupplierPurchaseRow,
  TrendPoint,
} from '../components/store-admin/purchasing/reports/models/purchasing-report.model';
import type {
  PurchaseOrder,
  PurchaseOrderStatus,
} from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import type {
  PurchaseReturn,
  PurchaseReturnReason,
} from '../components/store-admin/purchasing/purchase-returns/models/purchase-return.model';
import type {
  SupplierInvoice,
  SupplierInvoiceMatchStatus,
  SupplierInvoiceStatus,
} from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import type {
  SupplierPayment,
  SupplierPaymentMethod,
} from '../components/store-admin/purchasing/supplier-payments/models/supplier-payment.model';
import { GoodsReceiptService } from './goods-receipt.service';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseReturnService } from './purchase-return.service';
import { SupplierInvoiceService } from './supplier-invoice.service';
import { SupplierPaymentService } from './supplier-payment.service';
import { SupplierService } from './supplier.service';

const PO_STATUSES: readonly PurchaseOrderStatus[] = [
  'draft', 'ordered', 'partially_received', 'received', 'cancelled',
];
const INVOICE_STATUSES: readonly SupplierInvoiceStatus[] = [
  'draft', 'pending_review', 'approved', 'partially_paid', 'paid', 'cancelled',
];
const MATCH_STATUSES: readonly SupplierInvoiceMatchStatus[] = [
  'matched', 'mismatch', 'not_checked',
];
const PAYMENT_METHODS: readonly SupplierPaymentMethod[] = [
  'cash', 'bank_transfer', 'cheque', 'other',
];
const RETURN_REASONS: readonly PurchaseReturnReason[] = [
  'damaged', 'defective', 'wrong_item', 'quality_issue', 'excess', 'other',
];
const COMMITTED_PO_STATUSES = new Set<PurchaseOrderStatus>([
  'ordered', 'partially_received', 'received',
]);
const OUTSTANDING_INVOICE_STATUSES = new Set<SupplierInvoiceStatus>([
  'pending_review', 'approved', 'partially_paid',
]);
const APPROVED_PAYABLE_STATUSES = new Set<SupplierInvoiceStatus>([
  'approved', 'partially_paid', 'paid',
]);

@Injectable({ providedIn: 'root' })
export class PurchasingReportService {
  private readonly supplierService = inject(SupplierService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly invoiceService = inject(SupplierInvoiceService);
  private readonly paymentService = inject(SupplierPaymentService);
  private readonly returnService = inject(PurchaseReturnService);

  suppliersForStore(storeId: string) {
    return this.supplierService.getSuppliersByStore(storeId);
  }

  buildReport(filters: PurchasingReportFilters, now = new Date()): PurchasingReport {
    return this.calculateReport(
      {
        suppliers: this.supplierService.getSuppliersByStore(filters.storeId),
        purchaseOrders: this.purchaseOrderService.getPurchaseOrdersByStore(filters.storeId),
        goodsReceipts: this.goodsReceiptService.getGoodsReceiptsByStore(filters.storeId),
        invoices: this.invoiceService.getSupplierInvoicesByStore(filters.storeId),
        payments: this.paymentService.getSupplierPaymentsByStore(filters.storeId),
        purchaseReturns: this.returnService.getPurchaseReturnsByStore(filters.storeId),
      },
      filters,
      now,
    );
  }

  calculateReport(
    source: PurchasingReportSourceData,
    filters: PurchasingReportFilters,
    now = new Date(),
  ): PurchasingReport {
    const supplierMatches = (supplierId: number) =>
      filters.supplierId === null || supplierId === filters.supplierId;
    const purchaseOrders = source.purchaseOrders.filter(
      (item) =>
        item.storeId === filters.storeId &&
        supplierMatches(item.supplierId) &&
        this.inRange(item.orderDate, filters) &&
        (filters.purchaseOrderStatus === 'all' || item.status === filters.purchaseOrderStatus),
    );
    const receipts = source.goodsReceipts.filter(
      (item) => item.storeId === filters.storeId && supplierMatches(item.supplierId) && this.inRange(item.receivedDate, filters),
    );
    const invoices = source.invoices.filter(
      (item) =>
        item.storeId === filters.storeId &&
        supplierMatches(item.supplierId) &&
        this.inRange(item.invoiceDate, filters) &&
        (filters.invoiceStatus === 'all' || item.status === filters.invoiceStatus),
    );
    const payments = source.payments.filter(
      (item) => item.storeId === filters.storeId && supplierMatches(item.supplierId) && this.inRange(item.paymentDate, filters),
    );
    const returns = source.purchaseReturns.filter(
      (item) => item.storeId === filters.storeId && supplierMatches(item.supplierId) && this.inRange(item.returnDate, filters),
    );

    const committedPurchaseOrders = purchaseOrders.filter((item) => COMMITTED_PO_STATUSES.has(item.status));
    const payableInvoices = invoices.filter(
      (item) => OUTSTANDING_INVOICE_STATUSES.has(item.status) && item.balanceAmount > 0,
    );
    const purchaseOrderRows = this.purchaseOrderRows(purchaseOrders);
    const receiptRows = this.receiptRows(receipts);
    const invoiceRows = this.invoiceRows(invoices, now);
    const paymentRows = this.paymentRows(payments);
    const returnRows = this.returnRows(returns);
    const unitsReceived = this.sum(receipts, (receipt) => this.receiptUnits(receipt));
    const unitsReturned = this.sum(returns, (item) => this.returnUnits(item));
    const totalPaid = this.sum(payments, (payment) => payment.amount);
    const outstandingPayables = this.sum(payableInvoices, (invoice) => invoice.balanceAmount);
    const supplierRows = this.supplierRows(
      source,
      filters,
      purchaseOrders,
      receipts,
      invoices,
      payments,
      returns,
    );
    const receivingRows = this.receivingRows(purchaseOrders, source.goodsReceipts, filters);
    const orderedUnits = this.sum(receivingRows, (row) => row.orderedUnits);
    const lifecycleReceivedUnits = this.sum(receivingRows, (row) => row.receivedUnits);
    const overdueRows = invoiceRows.filter((invoice) => invoice.overdue);
    const outstandingRows = invoiceRows
      .filter((invoice) => invoice.balanceAmount > 0 && !['paid', 'cancelled'].includes(invoice.status))
      .sort((left, right) =>
        Number(right.overdue) - Number(left.overdue) ||
        (left.dueDate ?? '9999-12-31').localeCompare(right.dueDate ?? '9999-12-31') ||
        right.balanceAmount - left.balanceAmount,
      );
    const reasonBreakdown = this.breakdown(
      RETURN_REASONS,
      returns,
      (item) => item.reason,
      (item) => this.returnUnits(item),
    );

    return {
      overview: {
        totalPurchaseOrders: purchaseOrders.length,
        totalPurchaseValue: this.sum(committedPurchaseOrders, (item) => item.totalAmount),
        unitsReceived,
        outstandingPayables,
        totalPaid,
        unitsReturned,
        returnDocuments: returns.length,
        netRetainedUnits: Math.max(0, unitsReceived - unitsReturned),
      },
      purchaseOrders: {
        statusBreakdown: this.breakdown(PO_STATUSES, purchaseOrders, (item) => item.status),
        valueTrend: this.trend(committedPurchaseOrders, (item) => item.orderDate, (item) => item.totalAmount, filters),
        topSuppliers: this.topSuppliers(committedPurchaseOrders),
        rows: purchaseOrderRows,
      },
      receiving: {
        totalGrns: receipts.length,
        unitsReceived,
        partiallyReceivedPurchaseOrders: purchaseOrders.filter((item) => item.status === 'partially_received').length,
        fullyReceivedPurchaseOrders: purchaseOrders.filter((item) => item.status === 'received').length,
        orderedUnits,
        lifecycleReceivedUnits,
        outstandingUnits: Math.max(0, orderedUnits - lifecycleReceivedUnits),
        trend: this.trend(receipts, (item) => item.receivedDate, (item) => this.receiptUnits(item), filters),
        performanceRows: receivingRows,
        rows: receiptRows,
      },
      suppliers: supplierRows,
      invoices: {
        totalInvoices: invoices.length,
        outstandingAmount: outstandingPayables,
        statusBreakdown: this.breakdown(INVOICE_STATUSES, invoices, (item) => item.status),
        matchBreakdown: this.breakdown(MATCH_STATUSES, invoices, (item) => item.matchStatus),
        mismatchRows: invoiceRows.filter((item) => item.matchStatus === 'mismatch'),
        rows: invoiceRows,
      },
      accountsPayable: {
        totalApprovedPayable: this.sum(
          invoices.filter((item) => APPROVED_PAYABLE_STATUSES.has(item.status)),
          (item) => item.totalAmount,
        ),
        totalPaid,
        outstandingBalance: outstandingPayables,
        partiallyPaidInvoices: invoices.filter((item) => item.status === 'partially_paid').length,
        paidInvoices: invoices.filter((item) => item.status === 'paid').length,
        overdueInvoices: overdueRows.length,
        overdueAmount: this.sum(overdueRows, (item) => item.balanceAmount),
        outstandingRows,
      },
      payments: {
        totalPayments: payments.length,
        totalPaid,
        trend: this.trend(payments, (item) => item.paymentDate, (item) => item.amount, filters),
        methodBreakdown: this.breakdown(PAYMENT_METHODS, payments, (item) => item.paymentMethod, (item) => item.amount),
        rows: paymentRows,
      },
      returns: {
        totalDocuments: returns.length,
        unitsReturned,
        suppliersWithReturns: new Set(returns.map((item) => item.supplierId)).size,
        topReason: unitsReturned > 0
          ? [...reasonBreakdown].sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))[0]?.key
          : undefined,
        reasonBreakdown,
        rows: returnRows,
      },
      hasActivity: purchaseOrders.length + receipts.length + invoices.length + payments.length + returns.length > 0,
    };
  }

  private purchaseOrderRows(items: readonly PurchaseOrder[]): PurchaseOrderReportRow[] {
    return [...items]
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate))
      .map((item) => ({
        id: item.id,
        poNumber: item.poNumber,
        supplierName: item.supplierName,
        orderDate: item.orderDate,
        status: item.status,
        itemCount: item.items.length,
        orderedUnits: this.sum(item.items, (line) => line.quantity),
        receivedUnits: this.sum(item.items, (line) => line.receivedQuantity),
        totalAmount: item.totalAmount,
      }));
  }

  private receiptRows(items: readonly GoodsReceipt[]): GoodsReceiptReportRow[] {
    return [...items]
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
      .map((item) => ({
        id: item.id,
        grnNumber: item.grnNumber,
        purchaseOrderId: item.purchaseOrderId,
        poNumber: item.poNumber,
        supplierName: item.supplierName,
        receivingLocationName: item.receivingLocationName,
        receivedDate: item.receivedDate,
        unitsReceived: this.receiptUnits(item),
      }));
  }

  private invoiceRows(items: readonly SupplierInvoice[], now: Date): InvoiceReportRow[] {
    const today = this.localDate(now);
    return [...items]
      .sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))
      .map((item) => ({
        id: item.id,
        invoiceNumber: item.invoiceNumber,
        purchaseOrderId: item.purchaseOrderId,
        poNumber: item.poNumber,
        supplierName: item.supplierName,
        invoiceDate: item.invoiceDate,
        dueDate: item.dueDate,
        totalAmount: item.totalAmount,
        paidAmount: item.paidAmount,
        balanceAmount: item.balanceAmount,
        status: item.status,
        matchStatus: item.matchStatus,
        overdue:
          Boolean(item.dueDate) &&
          item.dueDate! < today &&
          item.balanceAmount > 0 &&
          item.status !== 'paid' &&
          item.status !== 'cancelled',
      }));
  }

  private paymentRows(items: readonly SupplierPayment[]): PaymentReportRow[] {
    return [...items]
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate))
      .map((item) => ({
        id: item.id,
        paymentNumber: item.paymentNumber,
        supplierInvoiceId: item.supplierInvoiceId,
        invoiceNumber: item.invoiceNumber,
        supplierName: item.supplierName,
        paymentDate: item.paymentDate,
        paymentMethod: item.paymentMethod,
        amount: item.amount,
      }));
  }

  private returnRows(items: readonly PurchaseReturn[]): PurchaseReturnReportRow[] {
    return [...items]
      .sort((a, b) => b.returnDate.localeCompare(a.returnDate))
      .map((item) => ({
        id: item.id,
        returnNumber: item.returnNumber,
        goodsReceiptId: item.goodsReceiptId,
        grnNumber: item.grnNumber,
        purchaseOrderId: item.purchaseOrderId,
        poNumber: item.poNumber,
        supplierName: item.supplierName,
        returnDate: item.returnDate,
        reason: item.reason,
        returnedUnits: this.returnUnits(item),
      }));
  }

  private receivingRows(
    purchaseOrders: readonly PurchaseOrder[],
    allReceipts: readonly GoodsReceipt[],
    filters: PurchasingReportFilters,
  ): ReceivingPerformanceRow[] {
    return purchaseOrders.map((purchaseOrder) => {
      const orderedUnits = this.sum(purchaseOrder.items, (item) => item.quantity);
      const receivedUnits = this.sum(purchaseOrder.items, (item) => item.receivedQuantity);
      const lastReceiptDate = allReceipts
        .filter(
          (receipt) =>
            receipt.storeId === filters.storeId && receipt.purchaseOrderId === purchaseOrder.id,
        )
        .map((receipt) => receipt.receivedDate)
        .sort()
        .at(-1);
      return {
        purchaseOrderId: purchaseOrder.id,
        poNumber: purchaseOrder.poNumber,
        supplierName: purchaseOrder.supplierName,
        orderedUnits,
        receivedUnits,
        remainingUnits: Math.max(0, orderedUnits - receivedUnits),
        status: purchaseOrder.status,
        lastReceiptDate,
      };
    });
  }

  private supplierRows(
    source: PurchasingReportSourceData,
    filters: PurchasingReportFilters,
    purchaseOrders: readonly PurchaseOrder[],
    receipts: readonly GoodsReceipt[],
    invoices: readonly SupplierInvoice[],
    payments: readonly SupplierPayment[],
    returns: readonly PurchaseReturn[],
  ): SupplierPerformanceRow[] {
    return source.suppliers
      .filter((item) => item.storeId === filters.storeId && (filters.supplierId === null || item.id === filters.supplierId))
      .map((supplier) => {
        const supplierOrders = purchaseOrders.filter((item) => item.supplierId === supplier.id);
        const supplierReceipts = receipts.filter((item) => item.supplierId === supplier.id);
        const supplierInvoices = invoices.filter((item) => item.supplierId === supplier.id);
        const supplierPayments = payments.filter((item) => item.supplierId === supplier.id);
        const supplierReturns = returns.filter((item) => item.supplierId === supplier.id);
        const unitsReceived = this.sum(supplierReceipts, (item) => this.receiptUnits(item));
        const returnedUnits = this.sum(supplierReturns, (item) => this.returnUnits(item));
        return {
          supplierId: supplier.id,
          supplierName: supplier.name,
          purchaseOrderCount: supplierOrders.length,
          purchaseValue: this.sum(
            supplierOrders.filter((item) => COMMITTED_PO_STATUSES.has(item.status)),
            (item) => item.totalAmount,
          ),
          unitsReceived,
          invoicedAmount: this.sum(supplierInvoices, (item) => item.totalAmount),
          amountPaid: this.sum(supplierPayments, (item) => item.amount),
          outstandingAmount: this.sum(
            supplierInvoices.filter((item) => OUTSTANDING_INVOICE_STATUSES.has(item.status)),
            (item) => item.balanceAmount,
          ),
          returnedUnits,
          returnRate: unitsReceived > 0 ? (returnedUnits / unitsReceived) * 100 : 0,
        };
      })
      .filter((item) =>
        item.purchaseOrderCount > 0 || item.unitsReceived > 0 || item.invoicedAmount > 0 || item.amountPaid > 0 || item.returnedUnits > 0,
      )
      .sort((a, b) => b.purchaseValue - a.purchaseValue);
  }

  private topSuppliers(purchaseOrders: readonly PurchaseOrder[]): SupplierPurchaseRow[] {
    const rows = new Map<number, SupplierPurchaseRow>();
    for (const purchaseOrder of purchaseOrders) {
      const current = rows.get(purchaseOrder.supplierId) ?? {
        supplierId: purchaseOrder.supplierId,
        supplierName: purchaseOrder.supplierName,
        purchaseOrderCount: 0,
        purchaseValue: 0,
      };
      current.purchaseOrderCount += 1;
      current.purchaseValue += purchaseOrder.totalAmount;
      rows.set(purchaseOrder.supplierId, current);
    }
    return [...rows.values()].sort((a, b) => b.purchaseValue - a.purchaseValue).slice(0, 5);
  }

  private breakdown<TItem, TKey extends string>(
    keys: readonly TKey[],
    items: readonly TItem[],
    keyOf: (item: TItem) => TKey,
    amountOf?: (item: TItem) => number,
  ): BreakdownRow<TKey>[] {
    const counts = new Map<TKey, { count: number; amount: number }>();
    for (const key of keys) counts.set(key, { count: 0, amount: 0 });
    for (const item of items) {
      const key = keyOf(item);
      const current = counts.get(key) ?? { count: 0, amount: 0 };
      current.count += 1;
      current.amount += amountOf?.(item) ?? 0;
      counts.set(key, current);
    }
    const percentageTotal = amountOf
      ? this.sum([...counts.values()], (item) => item.amount)
      : items.length;
    return keys.map((key) => {
      const value = counts.get(key) ?? { count: 0, amount: 0 };
      const measure = amountOf ? value.amount : value.count;
      return {
        key,
        label: this.label(key),
        count: value.count,
        ...(amountOf ? { amount: value.amount } : {}),
        percentage: percentageTotal > 0 ? (measure / percentageTotal) * 100 : 0,
      };
    });
  }

  private trend<TItem>(
    items: readonly TItem[],
    dateOf: (item: TItem) => string,
    valueOf: (item: TItem) => number,
    filters: PurchasingReportFilters,
  ): TrendPoint[] {
    const useMonths = this.rangeDays(filters) > 62;
    const values = new Map<string, number>();
    for (const item of items) {
      const date = dateOf(item);
      const key = useMonths ? date.slice(0, 7) : date.slice(0, 10);
      values.set(key, (values.get(key) ?? 0) + valueOf(item));
    }
    return [...values.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ key, label: this.periodLabel(key, useMonths), value }));
  }

  private rangeDays(filters: PurchasingReportFilters): number {
    if (!filters.fromDate || !filters.toDate) return 0;
    return Math.max(
      0,
      Math.round((Date.parse(`${filters.toDate}T00:00:00`) - Date.parse(`${filters.fromDate}T00:00:00`)) / 86_400_000),
    );
  }

  private periodLabel(key: string, monthly: boolean): string {
    const value = new Date(`${monthly ? `${key}-01` : key}T00:00:00`);
    return new Intl.DateTimeFormat('en-US', monthly
      ? { month: 'short', year: '2-digit' }
      : { month: 'short', day: 'numeric' }).format(value);
  }

  private inRange(date: string, filters: PurchasingReportFilters): boolean {
    const value = date.slice(0, 10);
    return (!filters.fromDate || value >= filters.fromDate) && (!filters.toDate || value <= filters.toDate);
  }

  private receiptUnits(receipt: GoodsReceipt): number {
    return this.sum(receipt.items, (item) => item.receivedNowQuantity);
  }

  private returnUnits(purchaseReturn: PurchaseReturn): number {
    return this.sum(purchaseReturn.items, (item) => item.returnNowQuantity);
  }

  private sum<T>(items: readonly T[], valueOf: (item: T) => number): number {
    return items.reduce((total, item) => total + valueOf(item), 0);
  }

  private label(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
