import { TestBed } from '@angular/core/testing';

import { GoodsReceipt } from '../components/store-admin/purchasing/goods-receipts/models/goods-receipt.model';
import { PurchaseOrder } from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { SupplierInvoice } from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import { SupplierInvoiceMatchingService } from './supplier-invoice-matching.service';
import { SupplierInvoiceService } from './supplier-invoice.service';

const PO_KEY = 'digishop_purchase_orders';
const GRN_KEY = 'digishop_goods_receipts_v1';
const INVOICE_KEY = 'digishop_supplier_invoices_v1';
const GUARDED_KEYS = [PO_KEY, GRN_KEY, 'digishop_inventory_balances_v1', 'digishop_inventory_transactions_v1'] as const;

describe('SupplierInvoiceMatchingService', () => {
  beforeEach(() => { localStorage.clear(); TestBed.configureTestingModule({}); });
  afterEach(() => { vi.useRealTimers(); localStorage.clear(); TestBed.resetTestingModule(); });

  it('matches a fully received invoice and persists status and check time', () => {
    seed();
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-25T10:30:00.000Z'));
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    const stored = TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-current');
    expect(result.matched).toBe(true);
    expect(result.itemResults[0]).toEqual(expect.objectContaining({ receivedQuantity: 100, availableToInvoice: 100, quantityMatched: true, priceMatched: true }));
    expect(result.issues).toEqual([]);
    expect(stored?.matchStatus).toBe('matched');
    expect(stored?.matchCheckedAt).toBe('2026-08-25T10:30:00.000Z');
  });

  it('accepts a partial invoice and does not require every PO line', () => {
    seed({
      purchaseOrder: purchaseOrderFixture({ items: [poItem(), poItem({ id: 'po-line-2', productId: 'product-2', productName: 'Earbuds', sku: 'EAR-1', quantity: 50, receivedQuantity: 50 })] }),
      invoice: invoiceFixture({ items: [invoiceLine({ invoicedQuantity: 40 })] }),
    });
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    expect(result.matched).toBe(true);
    expect(result.itemResults).toHaveLength(1);
    expect(result.itemResults[0].availableToInvoice).toBe(100);
  });

  it('reports receipt shortage without changing the supplier-entered quantity', () => {
    seed({
      purchaseOrder: purchaseOrderFixture({ status: 'partially_received', items: [poItem({ receivedQuantity: 40 })] }),
      receipt: receiptFixture({ items: [receiptItem({ receivedNowQuantity: 40, totalReceivedQuantity: 40, remainingQuantity: 60 })] }),
      invoice: invoiceFixture({ items: [invoiceLine({ invoicedQuantity: 100 })] }),
    });
    const before = snapshot();
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    expect(result.matched).toBe(false);
    expect(result.itemResults[0].quantityDifference).toBe(60);
    expect(result.issues.some((issue) => issue.type === 'invoice_quantity_exceeds_received')).toBe(true);
    expect(TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-current')?.items[0].invoicedQuantity).toBe(100);
    expectUnchangedExceptInvoice(before);
  });

  it.each([[1100, 100], [900, -100]])('flags both higher and lower invoice prices', (unitPrice, difference) => {
    seed({ invoice: invoiceFixture({ items: [invoiceLine({ unitPrice })] }) });
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    expect(result.matched).toBe(false);
    expect(result.itemResults[0].priceDifference).toBe(difference);
    expect(result.issues.some((issue) => issue.type === 'price_mismatch')).toBe(true);
  });

  it('uses committed other invoices cumulatively and excludes cancelled invoices', () => {
    seed({
      invoice: invoiceFixture({ items: [invoiceLine({ invoicedQuantity: 50 })] }),
      otherInvoices: [
        invoiceFixture({ id: 'invoice-approved', invoiceNumber: 'INV-A', status: 'approved', matchStatus: 'matched', items: [invoiceLine({ id: 'line-a', invoicedQuantity: 60 })] }),
        invoiceFixture({ id: 'invoice-cancelled', invoiceNumber: 'INV-X', status: 'cancelled', items: [invoiceLine({ id: 'line-x', invoicedQuantity: 90 })] }),
      ],
    });
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    expect(result.itemResults[0]).toEqual(expect.objectContaining({ previouslyInvoicedQuantity: 60, availableToInvoice: 40, quantityDifference: 10, quantityMatched: false }));
    expect(result.matched).toBe(false);
  });

  it('detects GRN/PO received-quantity integrity disagreement', () => {
    seed({ receipt: receiptFixture({ items: [receiptItem({ receivedNowQuantity: 80, totalReceivedQuantity: 80, remainingQuantity: 20 })] }) });
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    expect(result.issues.some((issue) => issue.type === 'received_quantity_integrity')).toBe(true);
    expect(result.matched).toBe(false);
  });

  it('fails safely when an invoice line does not belong to the linked PO', () => {
    seed({ invoice: invoiceFixture({ items: [invoiceLine({ purchaseOrderItemId: 'foreign-line' })] }) });
    const result = TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    expect(result.matched).toBe(false);
    expect(result.itemResults).toEqual([]);
    expect(result.issues.some((issue) => issue.type === 'missing_po_item')).toBe(true);
    expect(TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-current')?.matchStatus).toBe('mismatch');
  });

  it('rejects a cross-store matching request without exposing or changing the invoice', () => {
    seed({ invoice: invoiceFixture({ storeId: 'store-002' }) });
    const before = localStorage.getItem(INVOICE_KEY);
    expect(() => TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current')).toThrowError(/selected store/);
    expect(localStorage.getItem(INVOICE_KEY)).toBe(before);
  });

  it('rechecks a mismatch after later receipt data and then permits approval without side effects', () => {
    seed({
      purchaseOrder: purchaseOrderFixture({ status: 'partially_received', items: [poItem({ receivedQuantity: 40 })] }),
      receipt: receiptFixture({ items: [receiptItem({ receivedNowQuantity: 40, totalReceivedQuantity: 40, remainingQuantity: 60 })] }),
    });
    expect(TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current').matched).toBe(false);
    const invoices = JSON.parse(localStorage.getItem(INVOICE_KEY) ?? '[]') as SupplierInvoice[];
    localStorage.setItem(PO_KEY, JSON.stringify([purchaseOrderFixture()]));
    localStorage.setItem(GRN_KEY, JSON.stringify([receiptFixture()]));
    localStorage.setItem(INVOICE_KEY, JSON.stringify(invoices));
    TestBed.resetTestingModule(); TestBed.configureTestingModule({});
    const before = snapshot();
    expect(TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current').matched).toBe(true);
    const approved = TestBed.inject(SupplierInvoiceService).approveSupplierInvoice('invoice-current');
    expect(approved.status).toBe('approved');
    expectUnchangedExceptInvoice(before);
  });

  it('blocks approval for not-checked and mismatched invoices', () => {
    seed();
    const service = TestBed.inject(SupplierInvoiceService);
    expect(() => service.approveSupplierInvoice('invoice-current')).toThrowError(/must pass/);
    TestBed.inject(SupplierInvoiceMatchingService).performThreeWayMatch('invoice-current');
    const stored = JSON.parse(localStorage.getItem(INVOICE_KEY) ?? '[]') as SupplierInvoice[];
    stored[0] = { ...stored[0], matchStatus: 'mismatch' };
    localStorage.setItem(INVOICE_KEY, JSON.stringify(stored));
    TestBed.resetTestingModule(); TestBed.configureTestingModule({});
    expect(() => TestBed.inject(SupplierInvoiceService).approveSupplierInvoice('invoice-current')).toThrowError(/must pass/);
  });
});

interface Scenario { purchaseOrder?: PurchaseOrder; receipt?: GoodsReceipt; invoice?: SupplierInvoice; otherInvoices?: SupplierInvoice[]; }
function seed(scenario: Scenario = {}): void {
  localStorage.setItem(PO_KEY, JSON.stringify([scenario.purchaseOrder ?? purchaseOrderFixture()]));
  localStorage.setItem(GRN_KEY, JSON.stringify([scenario.receipt ?? receiptFixture()]));
  localStorage.setItem(INVOICE_KEY, JSON.stringify([scenario.invoice ?? invoiceFixture(), ...(scenario.otherInvoices ?? [])]));
  localStorage.setItem('digishop_inventory_balances_v1', JSON.stringify([{ quantity: 100 }]));
  localStorage.setItem('digishop_inventory_transactions_v1', JSON.stringify([{ id: 'tx-existing' }]));
  TestBed.resetTestingModule(); TestBed.configureTestingModule({});
}
function poItem(overrides: Partial<PurchaseOrder['items'][number]> = {}): PurchaseOrder['items'][number] {
  return { id: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Test Phone', sku: 'PHONE-1', quantity: 100, receivedQuantity: 100, purchasePrice: 1000, lineTotal: 100000, ...overrides };
}
function purchaseOrderFixture(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return { id: 'po-1', storeId: 'store-001', poNumber: 'PO-100', supplierId: 101, supplierName: 'ABC Distributors', receivingLocationId: 'warehouse:warehouse-001', receivingLocationName: 'Main Warehouse', receivingLocationType: 'warehouse', orderDate: '2026-08-20', items: [poItem()], subtotal: 100000, taxAmount: 0, discountAmount: 0, totalAmount: 100000, status: 'received', createdAt: '2026-08-20T08:00:00.000Z', ...overrides };
}
function invoiceLine(overrides: Partial<SupplierInvoice['items'][number]> = {}): SupplierInvoice['items'][number] {
  return { id: 'invoice-line-1', purchaseOrderItemId: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Test Phone', sku: 'PHONE-1', invoicedQuantity: 100, unitPrice: 1000, lineTotal: 100000, ...overrides };
}
function invoiceFixture(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return { id: 'invoice-current', storeId: 'store-001', invoiceNumber: 'INV-100', supplierId: 101, supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-100', invoiceDate: '2026-08-25', items: [invoiceLine()], subtotal: 100000, taxAmount: 0, discountAmount: 0, totalAmount: 100000, paidAmount: 0, balanceAmount: 100000, status: 'pending_review', matchStatus: 'not_checked', createdAt: '2026-08-25T09:00:00.000Z', ...overrides };
}
function receiptItem(overrides: Partial<GoodsReceipt['items'][number]> = {}): GoodsReceipt['items'][number] {
  return { id: 'grn-line-1', purchaseOrderItemId: 'po-line-1', inventoryTransactionId: 'tx-grn', productId: 'product-1', variantId: null, productName: 'Test Phone', sku: 'PHONE-1', orderedQuantity: 100, previouslyReceivedQuantity: 0, receivedNowQuantity: 100, totalReceivedQuantity: 100, remainingQuantity: 0, ...overrides };
}
function receiptFixture(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
  return { id: 'grn-1', grnNumber: 'GRN-100', purchaseOrderId: 'po-1', poNumber: 'PO-100', storeId: 'store-001', supplierId: 101, supplierName: 'ABC Distributors', receivingLocationId: 'warehouse:warehouse-001', receivingLocationName: 'Main Warehouse', receivingLocationType: 'warehouse', receivedDate: '2026-08-24', items: [receiptItem()], createdAt: '2026-08-24T10:00:00.000Z', ...overrides };
}
function snapshot(): Map<string, string | null> { return new Map(GUARDED_KEYS.map((key) => [key, localStorage.getItem(key)])); }
function expectUnchangedExceptInvoice(before: Map<string, string | null>): void { for (const [key, value] of before) expect(localStorage.getItem(key)).toBe(value); }
