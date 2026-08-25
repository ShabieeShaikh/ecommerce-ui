import { TestBed } from '@angular/core/testing';

import {
  CreateSupplierInvoiceRequest,
  SupplierInvoice,
  UpdateSupplierInvoiceRequest,
} from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import { PurchaseOrder } from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { LocalStorageService } from './local-storage.service';
import { StoreService } from './store.service';
import { SupplierInvoiceService } from './supplier-invoice.service';

const INVOICES_KEY = 'digishop_supplier_invoices_v1';
const PURCHASE_ORDERS_KEY = 'digishop_purchase_orders';
const GUARDED_KEYS = [
  PURCHASE_ORDERS_KEY,
  'digishop_goods_receipts_v1',
  'digishop_inventory_balances_v1',
  'digishop_inventory_transactions_v1',
  'digishop_warehouse_stock_v1',
] as const;

describe('SupplierInvoiceService', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      PURCHASE_ORDERS_KEY,
      JSON.stringify([
        purchaseOrderFixture(),
        purchaseOrderFixture({
          id: 'po-2',
          poNumber: 'PO-20260820-0002',
          supplierId: 202,
          supplierName: 'Second Supplier',
        }),
        purchaseOrderFixture({
          id: 'po-store-2',
          poNumber: 'PO-20260820-0003',
          storeId: 'store-002',
          supplierId: 303,
          supplierName: 'Store Two Supplier',
          receivingLocationId: 'store',
          receivingLocationName: 'Store Two Main Store',
          receivingLocationType: 'store',
        }),
      ]),
    );
    localStorage.setItem('digishop_goods_receipts_v1', JSON.stringify([{ audit: 'unchanged' }]));
    localStorage.setItem('digishop_inventory_balances_v1', JSON.stringify([{ quantity: 60 }]));
    localStorage.setItem(
      'digishop_inventory_transactions_v1',
      JSON.stringify([{ id: 'existing-transaction' }]),
    );
    localStorage.setItem('digishop_warehouse_stock_v1', JSON.stringify([{ quantity: 60 }]));
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('creates a draft invoice with PO-derived snapshots, calculated totals, and no stock changes', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const guardedBefore = storageSnapshot();
    const invoice = service.createSupplierInvoice(
      createRequest({
        items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 100, unitPrice: 1000 }],
        taxAmount: 5000,
        discountAmount: 0,
      }),
    );

    expect(invoice).toEqual(
      expect.objectContaining({
        storeId: 'store-001',
        supplierId: 101,
        supplierName: 'ABC Distributors',
        purchaseOrderId: 'po-1',
        poNumber: 'PO-20260820-0001',
        invoiceNumber: 'INV-ABC-001',
        subtotal: 100000,
        taxAmount: 5000,
        discountAmount: 0,
        totalAmount: 105000,
        paidAmount: 0,
        balanceAmount: 105000,
        status: 'draft',
        matchStatus: 'not_checked',
      }),
    );
    expect(invoice.items[0]).toEqual(
      expect.objectContaining({
        purchaseOrderItemId: 'po-item-1',
        productId: 'product-1',
        variantId: null,
        productName: 'Test Phone',
        sku: 'PHONE-001',
        lineTotal: 100000,
      }),
    );
    expect(storageSnapshot()).toEqual(guardedBefore);
    expect(JSON.parse(localStorage.getItem(INVOICES_KEY) ?? '[]')).toEqual([invoice]);
  });

  it('enforces invoice-number uniqueness per store and supplier, case-insensitively', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    service.createSupplierInvoice(createRequest({ invoiceNumber: 'INV-100' }));

    expect(() =>
      service.createSupplierInvoice(createRequest({ invoiceNumber: '  inv-100  ' })),
    ).toThrowError(/already exists/);

    const otherSupplierInvoice = service.createSupplierInvoice(
      createRequest({
        purchaseOrderId: 'po-2',
        invoiceNumber: 'INV-100',
        items: [
          { purchaseOrderItemId: 'po-2-item-1', invoicedQuantity: 100, unitPrice: 1000 },
        ],
      }),
    );
    expect(otherSupplierInvoice.supplierId).toBe(202);
  });

  it('allows multiple invoices against the same purchase order', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const first = service.createSupplierInvoice(
      createRequest({
        invoiceNumber: 'INV-PART-1',
        items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 40, unitPrice: 1000 }],
      }),
    );
    const second = service.createSupplierInvoice(
      createRequest({
        invoiceNumber: 'INV-PART-2',
        items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 60, unitPrice: 1000 }],
      }),
    );

    expect(service.getSupplierInvoicesByPurchaseOrder('po-1').map((item) => item.id)).toEqual([
      second.id,
      first.id,
    ]);
  });

  it('rejects missing, draft, cancelled, and cross-store purchase orders', () => {
    const orders = readPurchaseOrders();
    orders.push(
      purchaseOrderFixture({ id: 'po-draft', poNumber: 'PO-DRAFT', status: 'draft' }),
      purchaseOrderFixture({ id: 'po-cancelled', poNumber: 'PO-CANCEL', status: 'cancelled' }),
    );
    localStorage.setItem(PURCHASE_ORDERS_KEY, JSON.stringify(orders));
    recreateTestingModule();
    const service = TestBed.inject(SupplierInvoiceService);

    expect(() =>
      service.createSupplierInvoice(createRequest({ purchaseOrderId: 'missing' })),
    ).toThrowError('Purchase order not found.');
    expect(() =>
      service.createSupplierInvoice(createRequest({ purchaseOrderId: 'po-draft' })),
    ).toThrowError(/ordered or received/);
    expect(() =>
      service.createSupplierInvoice(createRequest({ purchaseOrderId: 'po-cancelled' })),
    ).toThrowError(/ordered or received/);
    expect(() =>
      service.createSupplierInvoice(
        createRequest({ purchaseOrderId: 'po-store-2', invoiceNumber: 'INV-STORE-2' }),
      ),
    ).toThrowError(/selected store/);
    expect(service.invoices()).toEqual([]);
  });

  it.each(['ordered', 'partially_received', 'received'] as const)(
    'allows invoices for a %s purchase order',
    (status) => {
      const orders = readPurchaseOrders();
      orders[0] = { ...orders[0], status };
      localStorage.setItem(PURCHASE_ORDERS_KEY, JSON.stringify(orders));
      recreateTestingModule();

      const invoice = TestBed.inject(SupplierInvoiceService).createSupplierInvoice(createRequest());
      expect(invoice.status).toBe('draft');
      expect(invoice.matchStatus).toBe('not_checked');
    },
  );

  it('records quantity and price mismatches for later matching instead of rejecting them', () => {
    const orders = readPurchaseOrders();
    orders[0] = {
      ...orders[0],
      status: 'partially_received',
      items: [{ ...orders[0].items[0], quantity: 10, receivedQuantity: 4 }],
    };
    localStorage.setItem(PURCHASE_ORDERS_KEY, JSON.stringify(orders));
    recreateTestingModule();

    const invoice = TestBed.inject(SupplierInvoiceService).createSupplierInvoice(
      createRequest({
        items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 100, unitPrice: 1250 }],
      }),
    );
    expect(invoice.items[0].invoicedQuantity).toBe(100);
    expect(invoice.items[0].unitPrice).toBe(1250);
    expect(invoice.matchStatus).toBe('not_checked');
  });

  it('rejects empty, duplicate, and foreign PO item lines atomically', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const valid = { purchaseOrderItemId: 'po-item-1', invoicedQuantity: 1, unitPrice: 1000 };

    expect(() => service.createSupplierInvoice(createRequest({ items: [] }))).toThrowError(
      /at least one item/,
    );
    expect(() =>
      service.createSupplierInvoice(createRequest({ items: [valid, valid] })),
    ).toThrowError(/more than once/);
    expect(() =>
      service.createSupplierInvoice(
        createRequest({
          items: [{ purchaseOrderItemId: 'po-2-item-1', invoicedQuantity: 1, unitPrice: 1000 }],
        }),
      ),
    ).toThrowError(/item could not be found/);
    expect(service.invoices()).toEqual([]);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid invoiced quantity %s',
    (invoicedQuantity) => {
      expect(() =>
        TestBed.inject(SupplierInvoiceService).createSupplierInvoice(
          createRequest({
            items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity, unitPrice: 1000 }],
          }),
        ),
      ).toThrowError(/quantity must be greater than zero/);
    },
  );

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid unit price %s',
    (unitPrice) => {
      expect(() =>
        TestBed.inject(SupplierInvoiceService).createSupplierInvoice(
          createRequest({
            items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 1, unitPrice }],
          }),
        ),
      ).toThrowError(/Unit price cannot be negative/);
    },
  );

  it('validates dates and financial inputs and clamps a negative total to zero', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    expect(() =>
      service.createSupplierInvoice(createRequest({ invoiceDate: 'invalid' })),
    ).toThrowError(/Invoice date/);
    expect(() =>
      service.createSupplierInvoice(
        createRequest({ invoiceDate: '2026-08-25', dueDate: '2026-08-24' }),
      ),
    ).toThrowError(/earlier/);
    expect(() => service.createSupplierInvoice(createRequest({ taxAmount: -1 }))).toThrowError(
      /Tax amount/,
    );
    expect(() =>
      service.createSupplierInvoice(createRequest({ discountAmount: Number.NaN })),
    ).toThrowError(/Discount amount/);

    const zeroTotal = service.createSupplierInvoice(
      createRequest({ invoiceNumber: 'INV-ZERO', discountAmount: 500000 }),
    );
    expect(zeroTotal.totalAmount).toBe(0);
    expect(zeroTotal.balanceAmount).toBe(0);
  });

  it('updates only a draft while preserving system identity and recalculating totals', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T10:00:00.000Z'));
    const service = TestBed.inject(SupplierInvoiceService);
    const created = service.createSupplierInvoice(createRequest());
    vi.setSystemTime(new Date('2026-08-25T11:00:00.000Z'));

    const update: UpdateSupplierInvoiceRequest = {
      invoiceNumber: 'INV-ABC-UPDATED',
      invoiceDate: '2026-08-26',
      dueDate: '2026-09-10',
      items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 2, unitPrice: 750 }],
      taxAmount: 200,
      discountAmount: 50,
      notes: ' Updated draft invoice. ',
    };
    const updated = service.updateSupplierInvoice(created.id, update)!;

    expect(updated.id).toBe(created.id);
    expect(updated.storeId).toBe(created.storeId);
    expect(updated.supplierId).toBe(created.supplierId);
    expect(updated.purchaseOrderId).toBe(created.purchaseOrderId);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.paidAmount).toBe(0);
    expect(updated.status).toBe('draft');
    expect(updated.matchStatus).toBe('not_checked');
    expect(updated.subtotal).toBe(1500);
    expect(updated.totalAmount).toBe(1650);
    expect(updated.balanceAmount).toBe(1650);
    expect(updated.notes).toBe('Updated draft invoice.');
    expect(updated.updatedAt).toBe('2026-08-25T11:00:00.000Z');
  });

  it('submits for review, blocks normal updates, and leaves PO, GRN, and inventory state unchanged', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const created = service.createSupplierInvoice(createRequest());
    const guardedBefore = storageSnapshot();
    const submitted = service.submitForReview(created.id)!;

    expect(submitted.status).toBe('pending_review');
    expect(submitted.matchStatus).toBe('not_checked');
    expect(() => service.updateSupplierInvoice(created.id, updateRequest())).toThrowError(
      /Only draft/,
    );
    expect(storageSnapshot()).toEqual(guardedBefore);
  });

  it('isolates queries by store and supports supplier and PO relationships', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const storeOne = service.createSupplierInvoice(createRequest());
    TestBed.inject(StoreService).changeSelectedStore('store-002', false);
    const storeTwo = service.createSupplierInvoice(
      createRequest({ purchaseOrderId: 'po-store-2', invoiceNumber: 'INV-STORE-2' }),
    );

    expect(service.getSupplierInvoicesByStore('store-001').map((item) => item.id)).toEqual([
      storeOne.id,
    ]);
    expect(service.getSupplierInvoicesByStore('store-002').map((item) => item.id)).toEqual([
      storeTwo.id,
    ]);
    expect(service.getSupplierInvoicesBySupplier(101).map((item) => item.id)).toEqual([
      storeOne.id,
    ]);
    expect(service.getSupplierInvoicesByPurchaseOrder('po-store-2').map((item) => item.id)).toEqual(
      [storeTwo.id],
    );
  });

  it('reloads valid persistence, safely ignores corrupt data, and recalculates stored totals', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const created = service.createSupplierInvoice(createRequest());
    const stored = JSON.parse(localStorage.getItem(INVOICES_KEY) ?? '[]') as SupplierInvoice[];
    stored[0] = { ...stored[0], subtotal: 1, totalAmount: 1, balanceAmount: 1 };
    localStorage.setItem(INVOICES_KEY, JSON.stringify(stored));

    recreateTestingModule();
    expect(
      TestBed.inject(SupplierInvoiceService).getSupplierInvoiceById(created.id)?.totalAmount,
    ).toBe(100150);

    TestBed.resetTestingModule();
    localStorage.setItem(INVOICES_KEY, '{invalid json');
    TestBed.configureTestingModule({});
    expect(TestBed.inject(SupplierInvoiceService).invoices()).toEqual([]);
  });

  it('rolls state back when invoice persistence fails', () => {
    const service = TestBed.inject(SupplierInvoiceService);
    const storage = TestBed.inject(LocalStorageService);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('Simulated invoice persistence failure.');
    });

    expect(() => service.createSupplierInvoice(createRequest())).toThrowError(
      'Simulated invoice persistence failure.',
    );
    expect(service.invoices()).toEqual([]);
  });
});

function createRequest(
  overrides: Partial<CreateSupplierInvoiceRequest> = {},
): CreateSupplierInvoiceRequest {
  return {
    purchaseOrderId: 'po-1',
    invoiceNumber: 'INV-ABC-001',
    invoiceDate: '2026-08-25',
    dueDate: '2026-09-10',
    items: [{ purchaseOrderItemId: 'po-item-1', invoicedQuantity: 100, unitPrice: 1000 }],
    taxAmount: 200,
    discountAmount: 50,
    notes: 'Supplier invoice received.',
    ...overrides,
  };
}

function updateRequest(): UpdateSupplierInvoiceRequest {
  const { purchaseOrderId: _purchaseOrderId, ...request } = createRequest();
  return request;
}

function purchaseOrderFixture(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const id = overrides.id ?? 'po-1';
  const itemId = id === 'po-2' ? 'po-2-item-1' : 'po-item-1';
  return {
    id,
    storeId: 'store-001',
    poNumber: 'PO-20260820-0001',
    supplierId: 101,
    supplierName: 'ABC Distributors',
    receivingLocationId: 'warehouse:warehouse-001',
    receivingLocationName: 'Main Warehouse',
    receivingLocationType: 'warehouse',
    orderDate: '2026-08-20',
    expectedDeliveryDate: '2026-08-27',
    items: [
      {
        id: itemId,
        productId: 'product-1',
        variantId: null,
        productName: 'Test Phone',
        sku: 'PHONE-001',
        quantity: 100,
        receivedQuantity: 0,
        purchasePrice: 1000,
        lineTotal: 100000,
      },
    ],
    subtotal: 100000,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: 100000,
    status: 'ordered',
    createdAt: '2026-08-20T08:00:00.000Z',
    ...overrides,
  };
}

function readPurchaseOrders(): PurchaseOrder[] {
  return JSON.parse(localStorage.getItem(PURCHASE_ORDERS_KEY) ?? '[]') as PurchaseOrder[];
}

function storageSnapshot(): Map<string, string | null> {
  return new Map(GUARDED_KEYS.map((key) => [key, localStorage.getItem(key)]));
}

function recreateTestingModule(): void {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
}
