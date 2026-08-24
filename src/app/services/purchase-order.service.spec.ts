import { TestBed } from '@angular/core/testing';

import {
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  UpdatePurchaseOrderRequest,
} from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { Supplier } from '../components/store-admin/purchasing/suppliers/models/supplier.model';
import { InventoryLocation } from '../models/inventory.models';
import { Warehouse } from '../models/warehouse.models';
import { InventoryLocationService } from './inventory-location.service';
import { PurchaseOrderService } from './purchase-order.service';
import { SupplierService } from './supplier.service';
import { WarehouseService } from './warehouse.service';

const STORAGE_KEY = 'digishop_purchase_orders';
const STOCK_STORAGE_KEYS = [
  'digishop_inventory_balances_v1',
  'digishop_inventory_transactions_v1',
  'digishop_inventory_orders_v1',
  'digishop_product_inventory_v1',
  'digishop_warehouse_stock_v1',
  'digishop_warehouses_v1',
] as const;

interface PurchaseOrderReferences {
  storeId: string;
  supplier: Supplier;
  warehouse: Warehouse;
  receivingLocation: InventoryLocation;
  productId: string;
  productName: string;
  sku: string;
}

describe('PurchaseOrderService', () => {
  let supplierIdSequence = 1000;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    vi.spyOn(Date, 'now').mockImplementation(() => ++supplierIdSequence);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('creates and persists a draft PO with generated fields and calculated totals', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);
    const created = service.createPurchaseOrder({
      ...createRequest(references),
      items: [
        {
          productId: 'prod-101',
          variantId: null,
          productName: 'Classic Leather Jacket',
          sku: 'FH-JKT-001',
          quantity: 2,
          purchasePrice: 1000,
        },
        {
          productId: 'prod-102',
          variantId: null,
          productName: 'Slim Fit Denim Jeans',
          sku: 'FH-JNS-002',
          quantity: 3,
          purchasePrice: 500,
        },
      ],
      taxAmount: 350,
      discountAmount: 100,
    });

    expect(created.status).toBe('draft');
    expect(created.poNumber).toMatch(/^PO-\d{8}-0001$/);
    expect(created.createdAt).toBeTruthy();
    expect(created.items.every((item) => item.receivedQuantity === 0)).toBe(true);
    expect(created.items.map((item) => item.lineTotal)).toEqual([2000, 1500]);
    expect(created.subtotal).toBe(3500);
    expect(created.totalAmount).toBe(3750);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([created]);
  });

  it('filters purchase orders by their string store ID', () => {
    const storeA = createReferences(
      'store-001',
      'prod-101',
      'Classic Leather Jacket',
      'FH-JKT-001',
    );
    const storeB = createReferences(
      'store-002',
      'prod-201',
      'Noise-Canceling Wireless Headphones',
      'TZ-HDP-101',
    );
    const service = TestBed.inject(PurchaseOrderService);
    const orderA = service.createPurchaseOrder(createRequest(storeA));
    const orderB = service.createPurchaseOrder(createRequest(storeB));

    expect(service.getPurchaseOrdersByStore('store-001').map((order) => order.id)).toEqual([
      orderA.id,
    ]);
    expect(service.getPurchaseOrdersByStore('store-002').map((order) => order.id)).toEqual([
      orderB.id,
    ]);
  });

  it('reloads persisted purchase orders and safely recalculates stored totals', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);
    const created = service.createPurchaseOrder(createRequest(references));
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PurchaseOrder[];
    stored[0] = { ...stored[0], subtotal: 999999, totalAmount: 999999 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const reloaded = recreateService().getPurchaseOrderById(created.id);

    expect(reloaded?.subtotal).toBe(2000);
    expect(reloaded?.totalAmount).toBe(2150);
  });

  it('updates only drafts while preserving identity and recalculating line totals', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);
    const created = service.createPurchaseOrder(createRequest(references));
    const update = createUpdateRequest(created, references);
    update.items[0] = { ...update.items[0], quantity: 4, purchasePrice: 750 };
    update.taxAmount = 200;
    update.discountAmount = 50;

    const updated = service.updatePurchaseOrder(created.id, update);

    expect(updated?.id).toBe(created.id);
    expect(updated?.poNumber).toBe(created.poNumber);
    expect(updated?.createdAt).toBe(created.createdAt);
    expect(updated?.items[0].id).toBe(created.items[0].id);
    expect(updated?.items[0].receivedQuantity).toBe(0);
    expect(updated?.items[0].lineTotal).toBe(3000);
    expect(updated?.subtotal).toBe(3000);
    expect(updated?.totalAmount).toBe(3150);
    expect(updated?.updatedAt).toBeTruthy();
    expect(recreateService().getPurchaseOrderById(created.id)).toEqual(updated);
  });

  it('prevents normal editing after a draft is marked as ordered', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);
    const created = service.createPurchaseOrder(createRequest(references));
    const ordered = service.changePurchaseOrderStatus(created.id, 'ordered');
    const storedBeforeUpdate = localStorage.getItem(STORAGE_KEY);

    expect(ordered?.status).toBe('ordered');
    expect(() =>
      service.updatePurchaseOrder(created.id, createUpdateRequest(created, references)),
    ).toThrowError('Only draft purchase orders can be edited.');
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedBeforeUpdate);
  });

  it('supports draft to ordered and ordered to cancelled without receiving stock', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);
    const created = service.createPurchaseOrder(createRequest(references));

    expect(service.changePurchaseOrderStatus(created.id, 'ordered')?.status).toBe('ordered');
    expect(service.changePurchaseOrderStatus(created.id, 'cancelled')?.status).toBe('cancelled');
    expect(recreateService().getPurchaseOrderById(created.id)?.status).toBe('cancelled');
  });

  it.each([
    ['zero quantity', { quantity: 0, purchasePrice: 1000 }],
    ['negative quantity', { quantity: -5, purchasePrice: 1000 }],
    ['fractional quantity', { quantity: 1.5, purchasePrice: 1000 }],
    ['negative purchase price', { quantity: 2, purchasePrice: -1 }],
  ])('rejects an item with %s', (_caseName, invalidValues) => {
    const references = createReferences();
    const request = createRequest(references);
    request.items[0] = { ...request.items[0], ...invalidValues };
    const service = TestBed.inject(PurchaseOrderService);

    expect(() => service.createPurchaseOrder(request)).toThrow();
    expect(service.purchaseOrders()).toEqual([]);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('rejects an empty item collection and prevents negative final totals', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);

    expect(() =>
      service.createPurchaseOrder({ ...createRequest(references), items: [] }),
    ).toThrowError('A purchase order must contain at least one item.');

    const created = service.createPurchaseOrder({
      ...createRequest(references),
      taxAmount: 0,
      discountAmount: 5000,
    });
    expect(created.totalAmount).toBe(0);
  });

  it('rejects cross-store supplier, receiving location, and product references', () => {
    const storeA = createReferences(
      'store-001',
      'prod-101',
      'Classic Leather Jacket',
      'FH-JKT-001',
    );
    const storeB = createReferences(
      'store-002',
      'prod-201',
      'Noise-Canceling Wireless Headphones',
      'TZ-HDP-101',
    );
    const service = TestBed.inject(PurchaseOrderService);

    expect(() =>
      service.createPurchaseOrder({
        ...createRequest(storeA),
        supplierId: storeB.supplier.id,
      }),
    ).toThrowError('The selected supplier does not belong to this store.');
    expect(() =>
      service.createPurchaseOrder({
        ...createRequest(storeA),
        receivingLocationId: storeB.receivingLocation.key,
        receivingLocationName: storeB.receivingLocation.name,
        receivingLocationType: storeB.receivingLocation.type,
      }),
    ).toThrowError('The selected receiving location is unavailable for this store.');
    expect(() =>
      service.createPurchaseOrder({
        ...createRequest(storeA),
        items: createRequest(storeB).items,
      }),
    ).toThrowError('The selected product does not belong to this store.');
  });

  it('does not mutate inventory balances, transactions, orders, or warehouse stock', () => {
    const references = createReferences();
    const service = TestBed.inject(PurchaseOrderService);
    const before = new Map(STOCK_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));

    service.createPurchaseOrder(createRequest(references));

    for (const key of STOCK_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBe(before.get(key));
    }
  });

  it('allows the store itself as the receiving location without requiring a warehouse', () => {
    const references = createReferences();
    const storeLocation = TestBed.inject(InventoryLocationService).getLocation(
      references.storeId,
      'store',
    );
    expect(storeLocation).toBeDefined();

    const created = TestBed.inject(PurchaseOrderService).createPurchaseOrder({
      ...createRequest(references),
      receivingLocationId: storeLocation!.key,
      receivingLocationName: storeLocation!.name,
      receivingLocationType: storeLocation!.type,
    });

    expect(created.receivingLocationId).toBe('store');
    expect(created.receivingLocationType).toBe('store');
    expect(created.receivingLocationName).toContain('Main Store');
  });

  it('migrates legacy warehouse snapshots to the canonical receiving location fields', () => {
    const references = createReferences();
    const created = TestBed.inject(PurchaseOrderService).createPurchaseOrder(
      createRequest(references),
    );
    const { receivingLocationId, receivingLocationName, receivingLocationType, ...core } = created;
    const legacy = {
      ...core,
      warehouseId: references.warehouse.id,
      warehouseName: references.warehouse.name,
    };
    expect(receivingLocationId).toBeTruthy();
    expect(receivingLocationName).toBeTruthy();
    expect(receivingLocationType).toBe('warehouse');
    localStorage.setItem(STORAGE_KEY, JSON.stringify([legacy]));

    const migrated = recreateService().getPurchaseOrderById(created.id);
    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Array<
      Record<string, unknown>
    >;

    expect(migrated).toEqual(
      expect.objectContaining({
        receivingLocationId: `warehouse:${references.warehouse.id}`,
        receivingLocationName: references.warehouse.name,
        receivingLocationType: 'warehouse',
      }),
    );
    expect(persisted[0]?.['warehouseId']).toBeUndefined();
    expect(persisted[0]?.['warehouseName']).toBeUndefined();
  });

  it('falls back to an empty state when Purchase Order storage is corrupted', () => {
    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEY, '{invalid json');
    TestBed.configureTestingModule({});

    expect(TestBed.inject(PurchaseOrderService).purchaseOrders()).toEqual([]);
  });
});

function recreateService(): PurchaseOrderService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(PurchaseOrderService);
}

function createReferences(
  storeId = 'store-001',
  productId = 'prod-101',
  productName = 'Classic Leather Jacket',
  sku = 'FH-JKT-001',
): PurchaseOrderReferences {
  const supplier = TestBed.inject(SupplierService).createSupplier({
    storeId,
    supplierCode: `SUP-${storeId}-${Date.now()}`,
    name: `${storeId} Supplier`,
    phone: '03001234567',
    status: 'active',
  });
  const warehouse = TestBed.inject(WarehouseService).createWarehouse({
    storeId,
    name: `${storeId} Warehouse`,
    code: `WH-${storeId}-${Date.now()}`,
    address: '1 Warehouse Road',
    city: 'Karachi',
    state: 'Sindh',
    country: 'Pakistan',
    managerKey: `manager-${storeId}`,
    managerName: 'Warehouse Manager',
    managerEmail: `manager-${storeId}@example.com`,
    status: 'active',
  });
  const receivingLocation = TestBed.inject(InventoryLocationService).getLocation(
    storeId,
    `warehouse:${warehouse.id}`,
  );
  if (!receivingLocation) throw new Error('Test receiving location was not created.');
  return { storeId, supplier, warehouse, receivingLocation, productId, productName, sku };
}

function createRequest(references: PurchaseOrderReferences): CreatePurchaseOrderRequest {
  return {
    storeId: references.storeId,
    supplierId: references.supplier.id,
    supplierName: references.supplier.name,
    receivingLocationId: references.receivingLocation.key,
    receivingLocationName: references.receivingLocation.name,
    receivingLocationType: references.receivingLocation.type,
    orderDate: '2026-08-20',
    expectedDeliveryDate: '2026-08-27',
    items: [
      {
        productId: references.productId,
        variantId: null,
        productName: references.productName,
        sku: references.sku,
        quantity: 2,
        purchasePrice: 1000,
      },
    ],
    taxAmount: 200,
    discountAmount: 50,
    notes: 'Deliver during business hours.',
  };
}

function createUpdateRequest(
  purchaseOrder: PurchaseOrder,
  references: PurchaseOrderReferences,
): UpdatePurchaseOrderRequest {
  return {
    supplierId: references.supplier.id,
    supplierName: references.supplier.name,
    receivingLocationId: references.receivingLocation.key,
    receivingLocationName: references.receivingLocation.name,
    receivingLocationType: references.receivingLocation.type,
    orderDate: purchaseOrder.orderDate,
    expectedDeliveryDate: purchaseOrder.expectedDeliveryDate,
    items: purchaseOrder.items.map((item) => ({
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.productName,
      variantName: item.variantName,
      sku: item.sku,
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
    })),
    taxAmount: purchaseOrder.taxAmount,
    discountAmount: purchaseOrder.discountAmount,
    notes: purchaseOrder.notes,
  };
}
