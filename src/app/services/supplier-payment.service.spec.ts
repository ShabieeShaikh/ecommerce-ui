import { TestBed } from '@angular/core/testing';

import { SupplierPayment } from '../components/store-admin/purchasing/supplier-payments/models/supplier-payment.model';
import { SupplierInvoice } from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import { LocalStorageService } from './local-storage.service';
import { StoreService } from './store.service';
import { SupplierInvoiceService } from './supplier-invoice.service';
import { SupplierPaymentService } from './supplier-payment.service';

const PAYMENT_KEY = 'digishop_supplier_payments_v1';
const INVOICE_KEY = 'digishop_supplier_invoices_v1';
const GUARDED_KEYS = ['digishop_purchase_orders', 'digishop_goods_receipts_v1', 'digishop_inventory_balances_v1', 'digishop_inventory_transactions_v1', 'digishop_warehouse_stock_v1'] as const;

describe('SupplierPaymentService', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(INVOICE_KEY, JSON.stringify([invoiceFixture()]));
    GUARDED_KEYS.forEach((key) => localStorage.setItem(key, JSON.stringify([{ unchanged: key }])));
    TestBed.configureTestingModule({});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); localStorage.clear(); TestBed.resetTestingModule(); });

  it('records a full payment with derived snapshots and no purchasing or inventory side effects', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const before = guardedSnapshot();
    const payment = TestBed.inject(SupplierPaymentService).recordPayment({
      supplierInvoiceId: 'invoice-1', paymentDate: '2026-08-25', amount: 100000,
      paymentMethod: 'bank_transfer', referenceNumber: ' HBL-TXN-88921 ', notes: ' Final settlement ',
    });
    const invoice = TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-1');
    expect(payment).toEqual(expect.objectContaining({
      paymentNumber: 'PAY-20260825-0001', storeId: 'store-001', supplierId: 101,
      supplierName: 'ABC Distributors', invoiceNumber: 'INV-100', amount: 100000,
      referenceNumber: 'HBL-TXN-88921', notes: 'Final settlement',
    }));
    expect(invoice).toEqual(expect.objectContaining({ paidAmount: 100000, balanceAmount: 0, status: 'paid' }));
    expect(guardedSnapshot()).toEqual(before);
  });

  it('supports multiple partial payments and returns newest-first histories', () => {
    const service = TestBed.inject(SupplierPaymentService);
    service.recordPayment(request(30000, '2026-08-23'));
    service.recordPayment(request(20000, '2026-08-24'));
    service.recordPayment(request(50000, '2026-08-25'));
    const invoice = TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-1');
    expect(invoice).toEqual(expect.objectContaining({ paidAmount: 100000, balanceAmount: 0, status: 'paid' }));
    expect(service.getSupplierPaymentsByInvoice('invoice-1').map((payment) => payment.amount)).toEqual([50000, 20000, 30000]);
    expect(service.getSupplierPaymentsBySupplier(101)).toHaveLength(3);
    expect(service.getSupplierPaymentsByStore('store-001')).toHaveLength(3);
  });

  it('normalizes cents safely across partial and final payments', () => {
    localStorage.setItem(INVOICE_KEY, JSON.stringify([invoiceFixture({
      items: [{ ...invoiceFixture().items[0], invoicedQuantity: 1, unitPrice: 0.3, lineTotal: 0.3 }],
      subtotal: 0.3, totalAmount: 0.3, balanceAmount: 0.3,
    })]));
    recreate();
    const service = TestBed.inject(SupplierPaymentService);
    service.recordPayment(request(0.1));
    service.recordPayment(request(0.2));
    expect(TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-1')).toEqual(expect.objectContaining({ paidAmount: 0.3, balanceAmount: 0, status: 'paid' }));
  });

  it.each([0, 0.001, -1, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid payment amount %s atomically', (amount) => {
    const beforeInvoice = localStorage.getItem(INVOICE_KEY);
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment(request(amount))).toThrowError(/greater than zero/);
    expect(TestBed.inject(SupplierPaymentService).payments()).toEqual([]);
    expect(localStorage.getItem(INVOICE_KEY)).toBe(beforeInvoice);
  });

  it('rejects overpayment instead of clamping or creating credit', () => {
    const service = TestBed.inject(SupplierPaymentService);
    service.recordPayment(request(70000));
    expect(() => service.recordPayment(request(40000))).toThrowError(/cannot exceed/);
    expect(service.payments()).toHaveLength(1);
    expect(TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById('invoice-1')).toEqual(expect.objectContaining({ paidAmount: 70000, balanceAmount: 30000, status: 'partially_paid' }));
  });

  it.each(['draft', 'pending_review', 'paid', 'cancelled'] as const)('rejects a %s invoice', (status) => {
    localStorage.setItem(INVOICE_KEY, JSON.stringify([invoiceFixture({ status, paidAmount: status === 'paid' ? 100000 : 0, balanceAmount: status === 'paid' ? 0 : 100000 })]));
    recreate();
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment(request(1000))).toThrowError();
    expect(TestBed.inject(SupplierPaymentService).payments()).toEqual([]);
  });

  it('rejects inconsistent approved-but-mismatched invoices, invalid dates, and invalid methods', () => {
    localStorage.setItem(INVOICE_KEY, JSON.stringify([invoiceFixture({ matchStatus: 'mismatch' })]));
    recreate();
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment(request(1000))).toThrowError(/matched/);
    localStorage.setItem(INVOICE_KEY, JSON.stringify([invoiceFixture()])); recreate();
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment({ ...request(1000), paymentDate: 'invalid' })).toThrowError(/date/);
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment({ ...request(1000), paymentMethod: 'card' as 'cash' })).toThrowError(/method/);
  });

  it('derives unique numbers from the highest same-day persisted sequence', () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-08-25T15:00:00.000Z'));
    localStorage.setItem(PAYMENT_KEY, JSON.stringify([paymentFixture({ paymentNumber: 'PAY-20260825-0007' }), paymentFixture({ id: 'old', paymentNumber: 'PAY-20260824-0099', createdAt: '2026-08-24T10:00:00.000Z' })]));
    recreate();
    expect(TestBed.inject(SupplierPaymentService).recordPayment(request(1000)).paymentNumber).toBe('PAY-20260825-0008');
  });

  it('isolates payment recording and queries by selected store', () => {
    localStorage.setItem(INVOICE_KEY, JSON.stringify([invoiceFixture(), invoiceFixture({ id: 'invoice-2', storeId: 'store-002', invoiceNumber: 'INV-200', supplierId: 202, supplierName: 'Store Two Supplier' })]));
    recreate();
    const service = TestBed.inject(SupplierPaymentService);
    expect(() => service.recordPayment({ ...request(1000), supplierInvoiceId: 'invoice-2' })).toThrowError(/selected store/);
    TestBed.inject(StoreService).changeSelectedStore('store-002', false);
    service.recordPayment({ ...request(1000), supplierInvoiceId: 'invoice-2' });
    expect(service.getSupplierPaymentsByStore('store-001')).toEqual([]);
    expect(service.getSupplierPaymentsByStore('store-002')).toHaveLength(1);
  });

  it('loads valid persistence, ignores corrupt records safely, and exposes immutable history', () => {
    localStorage.setItem(PAYMENT_KEY, JSON.stringify([paymentFixture()])); recreate();
    const service = TestBed.inject(SupplierPaymentService);
    expect(service.getSupplierPaymentById('payment-1')?.amount).toBe(1000);
    localStorage.setItem(PAYMENT_KEY, '{bad json'); recreate();
    expect(TestBed.inject(SupplierPaymentService).payments()).toEqual([]);
  });

  it('does not update the invoice when payment persistence fails', () => {
    const storage = TestBed.inject(LocalStorageService);
    const original = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === PAYMENT_KEY) throw new Error('Payment persistence failed.');
      original(key, value);
    });
    const beforeInvoice = localStorage.getItem(INVOICE_KEY);
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment(request(1000))).toThrowError(/persistence failed/);
    expect(localStorage.getItem(INVOICE_KEY)).toBe(beforeInvoice);
  });

  it('rolls payment history back when invoice persistence fails', () => {
    const storage = TestBed.inject(LocalStorageService);
    const original = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === INVOICE_KEY) throw new Error('Invoice persistence failed.');
      original(key, value);
    });
    expect(() => TestBed.inject(SupplierPaymentService).recordPayment(request(1000))).toThrowError(/Invoice persistence failed/);
    expect(TestBed.inject(SupplierPaymentService).payments()).toEqual([]);
    expect(JSON.parse(localStorage.getItem(PAYMENT_KEY) ?? '[]')).toEqual([]);
  });
});

function request(amount: number, paymentDate = '2026-08-25') {
  return { supplierInvoiceId: 'invoice-1', paymentDate, amount, paymentMethod: 'cash' as const };
}
function invoiceFixture(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return { id: 'invoice-1', storeId: 'store-001', invoiceNumber: 'INV-100', supplierId: 101, supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-100', invoiceDate: '2026-08-20', items: [{ id: 'line-1', purchaseOrderItemId: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', invoicedQuantity: 100, unitPrice: 1000, lineTotal: 100000 }], subtotal: 100000, taxAmount: 0, discountAmount: 0, totalAmount: 100000, paidAmount: 0, balanceAmount: 100000, status: 'approved', matchStatus: 'matched', matchCheckedAt: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T09:00:00.000Z', ...overrides };
}
function paymentFixture(overrides: Partial<SupplierPayment> = {}): SupplierPayment {
  return { id: 'payment-1', paymentNumber: 'PAY-20260825-0001', storeId: 'store-001', supplierId: 101, supplierName: 'ABC Distributors', supplierInvoiceId: 'invoice-1', invoiceNumber: 'INV-100', paymentDate: '2026-08-25', amount: 1000, paymentMethod: 'cash', createdAt: '2026-08-25T10:00:00.000Z', ...overrides };
}
function guardedSnapshot(): Map<string, string | null> { return new Map(GUARDED_KEYS.map((key) => [key, localStorage.getItem(key)])); }
function recreate(): void { TestBed.resetTestingModule(); TestBed.configureTestingModule({}); }
