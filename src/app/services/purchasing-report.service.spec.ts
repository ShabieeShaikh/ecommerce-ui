import { TestBed } from '@angular/core/testing';

import type { GoodsReceipt } from '../components/store-admin/purchasing/goods-receipts/models/goods-receipt.model';
import type { PurchaseOrder } from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import type { PurchaseReturn } from '../components/store-admin/purchasing/purchase-returns/models/purchase-return.model';
import type {
  PurchasingReportFilters,
  PurchasingReportSourceData,
} from '../components/store-admin/purchasing/reports/models/purchasing-report.model';
import type { SupplierInvoice } from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import type { SupplierPayment } from '../components/store-admin/purchasing/supplier-payments/models/supplier-payment.model';
import type { Supplier } from '../components/store-admin/purchasing/suppliers/models/supplier.model';
import { GoodsReceiptService } from './goods-receipt.service';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseReturnService } from './purchase-return.service';
import { PurchasingReportService } from './purchasing-report.service';
import { SupplierInvoiceService } from './supplier-invoice.service';
import { SupplierPaymentService } from './supplier-payment.service';
import { SupplierService } from './supplier.service';

describe('PurchasingReportService', () => {
  let service: PurchasingReportService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PurchasingReportService,
        { provide: SupplierService, useValue: {} },
        { provide: PurchaseOrderService, useValue: {} },
        { provide: GoodsReceiptService, useValue: {} },
        { provide: SupplierInvoiceService, useValue: {} },
        { provide: SupplierPaymentService, useValue: {} },
        { provide: PurchaseReturnService, useValue: {} },
      ],
    });
    service = TestBed.inject(PurchasingReportService);
  });

  it('isolates the selected store and excludes draft and cancelled POs from committed value', () => {
    const source = data({
      purchaseOrders: [
        po({ id: 'po-1', totalAmount: 100_000, status: 'ordered' }),
        po({ id: 'po-2', totalAmount: 200_000, status: 'received' }),
        po({ id: 'po-3', totalAmount: 50_000, status: 'cancelled' }),
        po({ id: 'po-4', totalAmount: 25_000, status: 'draft' }),
        po({ id: 'other-po', storeId: 'store-2', totalAmount: 999_000 }),
      ],
    });

    const report = service.calculateReport(source, filters());

    expect(report.overview.totalPurchaseOrders).toBe(4);
    expect(report.overview.totalPurchaseValue).toBe(300_000);
    expect(report.purchaseOrders.statusBreakdown.find((item) => item.key === 'cancelled')?.count).toBe(1);
  });

  it('calculates received, payable, paid, and returned KPIs from their source records', () => {
    const source = data({
      goodsReceipts: [receipt({ id: 'grn-1', quantity: 40 }), receipt({ id: 'grn-2', quantity: 60 })],
      invoices: [
        invoice({ id: 'inv-1', status: 'approved', balanceAmount: 70_000, totalAmount: 70_000 }),
        invoice({ id: 'inv-2', status: 'partially_paid', balanceAmount: 30_000, totalAmount: 60_000, paidAmount: 30_000 }),
        invoice({ id: 'inv-3', status: 'paid', balanceAmount: 0, totalAmount: 50_000, paidAmount: 50_000 }),
        invoice({ id: 'inv-4', status: 'draft', balanceAmount: 20_000, totalAmount: 20_000 }),
      ],
      payments: [payment({ id: 'pay-1', amount: 30_000 }), payment({ id: 'pay-2', amount: 20_000 }), payment({ id: 'pay-3', amount: 50_000 })],
      purchaseReturns: [purchaseReturn({ id: 'ret-1', quantity: 5 }), purchaseReturn({ id: 'ret-2', quantity: 3 })],
    });

    const report = service.calculateReport(source, filters());

    expect(report.overview).toEqual(expect.objectContaining({
      unitsReceived: 100,
      outstandingPayables: 100_000,
      totalPaid: 100_000,
      unitsReturned: 8,
      netRetainedUnits: 92,
    }));
  });

  it('uses business dates and supplier filtering consistently', () => {
    const source = data({
      purchaseOrders: [
        po({ id: 'inside', orderDate: '2026-08-15', supplierId: 1 }),
        po({ id: 'outside-date', orderDate: '2026-07-31', supplierId: 1 }),
        po({ id: 'other-supplier', orderDate: '2026-08-15', supplierId: 2, supplierName: 'Beta' }),
      ],
      goodsReceipts: [
        receipt({ id: 'inside-grn', receivedDate: '2026-08-20', supplierId: 1 }),
        receipt({ id: 'outside-grn', receivedDate: '2026-09-01', supplierId: 1 }),
      ],
      payments: [
        payment({ id: 'inside-pay', paymentDate: '2026-08-10', supplierId: 1 }),
        payment({ id: 'other-pay', paymentDate: '2026-08-10', supplierId: 2 }),
      ],
    });
    const report = service.calculateReport(source, filters({ supplierId: 1 }));

    expect(report.purchaseOrders.rows.map((item) => item.id)).toEqual(['inside']);
    expect(report.receiving.rows.map((item) => item.id)).toEqual(['inside-grn']);
    expect(report.payments.rows.map((item) => item.id)).toEqual(['inside-pay']);
  });

  it('reports workflow, matching, payment method, and return reason breakdowns', () => {
    const source = data({
      purchaseOrders: [po({ id: 'draft', status: 'draft' }), po({ id: 'ordered', status: 'ordered' })],
      invoices: [
        invoice({ id: 'matched', matchStatus: 'matched' }),
        invoice({ id: 'mismatch-1', matchStatus: 'mismatch' }),
        invoice({ id: 'mismatch-2', matchStatus: 'mismatch' }),
        invoice({ id: 'unchecked', matchStatus: 'not_checked' }),
      ],
      payments: [
        payment({ id: 'cash-1', paymentMethod: 'cash', amount: 20 }),
        payment({ id: 'cash-2', paymentMethod: 'cash', amount: 30 }),
        payment({ id: 'bank-1', paymentMethod: 'bank_transfer', amount: 50 }),
      ],
      purchaseReturns: [
        purchaseReturn({ id: 'damage', reason: 'damaged', quantity: 5 }),
        purchaseReturn({ id: 'defect', reason: 'defective', quantity: 10 }),
      ],
    });
    const report = service.calculateReport(source, filters());

    expect(report.invoices.matchBreakdown.map(({ key, count }) => ({ key, count }))).toEqual([
      { key: 'matched', count: 1 }, { key: 'mismatch', count: 2 }, { key: 'not_checked', count: 1 },
    ]);
    expect(report.payments.methodBreakdown.find((item) => item.key === 'cash')).toEqual(expect.objectContaining({ count: 2, amount: 50 }));
    expect(report.returns.reasonBreakdown.find((item) => item.key === 'defective')).toEqual(expect.objectContaining({ count: 1, amount: 10 }));
    expect(report.returns.topReason).toBe('defective');
  });

  it('keeps lifecycle receiving and historical GRN quantities separate from returns', () => {
    const source = data({
      purchaseOrders: [po({ quantity: 100, receivedQuantity: 40, status: 'partially_received' })],
      goodsReceipts: [receipt({ quantity: 40 })],
      purchaseReturns: [purchaseReturn({ quantity: 10 })],
    });
    const report = service.calculateReport(source, filters());

    expect(report.receiving.performanceRows[0]).toEqual(expect.objectContaining({
      orderedUnits: 100,
      receivedUnits: 40,
      remainingUnits: 60,
    }));
    expect(report.overview.unitsReceived).toBe(40);
    expect(report.overview.unitsReturned).toBe(10);
    expect(report.overview.netRetainedUnits).toBe(30);
  });

  it('counts only open past-due invoices as overdue', () => {
    const source = data({
      invoices: [
        invoice({ id: 'overdue', dueDate: '2026-08-01', status: 'approved', balanceAmount: 70 }),
        invoice({ id: 'paid', dueDate: '2026-08-01', status: 'paid', balanceAmount: 0 }),
        invoice({ id: 'future', dueDate: '2026-09-01', status: 'approved', balanceAmount: 30 }),
        invoice({ id: 'no-due', dueDate: undefined, status: 'approved', balanceAmount: 20 }),
      ],
    });
    const report = service.calculateReport(source, filters(), new Date('2026-08-25T12:00:00'));

    expect(report.accountsPayable.overdueInvoices).toBe(1);
    expect(report.accountsPayable.overdueAmount).toBe(70);
    expect(report.accountsPayable.outstandingRows[0]?.id).toBe('overdue');
  });

  it('returns clean zero states without mutating source records', () => {
    const source = data();
    const before = structuredClone(source);
    const report = service.calculateReport(source, filters());

    expect(report.hasActivity).toBe(false);
    expect(report.overview).toEqual({
      totalPurchaseOrders: 0,
      totalPurchaseValue: 0,
      unitsReceived: 0,
      outstandingPayables: 0,
      totalPaid: 0,
      unitsReturned: 0,
      returnDocuments: 0,
      netRetainedUnits: 0,
    });
    expect(report.returns.topReason).toBeUndefined();
    expect(source).toEqual(before);
  });
});

function filters(overrides: Partial<PurchasingReportFilters> = {}): PurchasingReportFilters {
  return {
    storeId: 'store-1',
    fromDate: '2026-08-01',
    toDate: '2026-08-31',
    supplierId: null,
    purchaseOrderStatus: 'all',
    invoiceStatus: 'all',
    ...overrides,
  };
}

function data(overrides: Partial<PurchasingReportSourceData> = {}): PurchasingReportSourceData {
  return {
    suppliers: [supplier({ id: 1, name: 'Alpha' }), supplier({ id: 2, name: 'Beta' })],
    purchaseOrders: [],
    goodsReceipts: [],
    invoices: [],
    payments: [],
    purchaseReturns: [],
    ...overrides,
  };
}

function supplier(overrides: Partial<Supplier> = {}): Supplier {
  return { id: 1, storeId: 'store-1', supplierCode: 'SUP-1', name: 'Alpha', phone: '1', status: 'active', createdAt: '2026-01-01', ...overrides };
}

function po(overrides: Partial<PurchaseOrder> & { quantity?: number; receivedQuantity?: number } = {}): PurchaseOrder {
  const { quantity = 10, receivedQuantity = 0, ...fields } = overrides;
  return {
    id: 'po-1', storeId: 'store-1', poNumber: 'PO-1', supplierId: 1, supplierName: 'Alpha',
    receivingLocationId: 'warehouse:w1', receivingLocationName: 'Main', receivingLocationType: 'warehouse',
    orderDate: '2026-08-10', items: [{ id: 'line-1', productId: 'product-1', variantId: null, productName: 'Item', sku: 'SKU', quantity, receivedQuantity, purchasePrice: 10, lineTotal: quantity * 10 }],
    subtotal: quantity * 10, taxAmount: 0, discountAmount: 0, totalAmount: quantity * 10,
    status: 'ordered', createdAt: '2026-08-10T00:00:00.000Z', ...fields,
  };
}

function receipt(overrides: Partial<GoodsReceipt> & { quantity?: number } = {}): GoodsReceipt {
  const { quantity = 10, ...fields } = overrides;
  return {
    id: 'grn-1', grnNumber: 'GRN-1', purchaseOrderId: 'po-1', poNumber: 'PO-1', storeId: 'store-1', supplierId: 1, supplierName: 'Alpha',
    receivingLocationId: 'warehouse:w1', receivingLocationName: 'Main', receivingLocationType: 'warehouse', receivedDate: '2026-08-15',
    items: [{ id: 'grn-line-1', purchaseOrderItemId: 'line-1', inventoryTransactionId: 'tx-1', productId: 'product-1', variantId: null, productName: 'Item', sku: 'SKU', orderedQuantity: 100, previouslyReceivedQuantity: 0, receivedNowQuantity: quantity, totalReceivedQuantity: quantity, remainingQuantity: 100 - quantity }],
    createdAt: '2026-08-15T00:00:00.000Z', ...fields,
  };
}

function invoice(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'inv-1', storeId: 'store-1', invoiceNumber: 'INV-1', supplierId: 1, supplierName: 'Alpha', purchaseOrderId: 'po-1', poNumber: 'PO-1', invoiceDate: '2026-08-16',
    items: [], subtotal: 100, taxAmount: 0, discountAmount: 0, totalAmount: 100, paidAmount: 0, balanceAmount: 100,
    status: 'approved', matchStatus: 'matched', createdAt: '2026-08-16T00:00:00.000Z', ...overrides,
  };
}

function payment(overrides: Partial<SupplierPayment> = {}): SupplierPayment {
  return {
    id: 'pay-1', paymentNumber: 'PAY-1', storeId: 'store-1', supplierId: 1, supplierName: 'Alpha', supplierInvoiceId: 'inv-1', invoiceNumber: 'INV-1', paymentDate: '2026-08-20', amount: 100, paymentMethod: 'cash', createdAt: '2026-08-20T00:00:00.000Z', ...overrides,
  };
}

function purchaseReturn(overrides: Partial<PurchaseReturn> & { quantity?: number } = {}): PurchaseReturn {
  const { quantity = 1, ...fields } = overrides;
  return {
    id: 'ret-1', returnNumber: 'RET-1', storeId: 'store-1', supplierId: 1, supplierName: 'Alpha', purchaseOrderId: 'po-1', poNumber: 'PO-1', goodsReceiptId: 'grn-1', grnNumber: 'GRN-1',
    returnLocationId: 'warehouse:w1', returnLocationName: 'Main', returnLocationType: 'warehouse', returnDate: '2026-08-22', reason: 'damaged',
    items: [{ id: 'return-line-1', goodsReceiptItemId: 'grn-line-1', inventoryTransactionId: 'tx-return', purchaseOrderItemId: 'line-1', productId: 'product-1', variantId: null, productName: 'Item', sku: 'SKU', receivedQuantity: 100, previouslyReturnedQuantity: 0, returnNowQuantity: quantity, totalReturnedQuantity: quantity, remainingReturnableQuantity: 100 - quantity }],
    createdAt: '2026-08-22T00:00:00.000Z', ...fields,
  };
}
