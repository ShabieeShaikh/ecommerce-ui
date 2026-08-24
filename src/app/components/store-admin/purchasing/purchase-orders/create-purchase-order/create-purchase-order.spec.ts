import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';

import { Branch, Product } from '../../../../../models/admin.models';
import { Warehouse } from '../../../../../models/warehouse.models';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { Supplier } from '../../suppliers/models/supplier.model';
import { CreatePurchaseOrder } from './create-purchase-order';

const SUPPLIER_STORAGE_KEY = 'digishop_suppliers';
const WAREHOUSE_STORAGE_KEY = 'digishop_warehouses_v1';
const BRANCH_STORAGE_KEY = 'digishop_branches_v1';
const PRODUCT_STORAGE_KEY = 'digishop_products_v1';
const PURCHASE_ORDER_STORAGE_KEY = 'digishop_purchase_orders';
const STOCK_STORAGE_KEYS = [
  'digishop_inventory_balances_v1',
  'digishop_inventory_transactions_v1',
  'digishop_inventory_orders_v1',
  'digishop_product_inventory_v1',
  'digishop_warehouse_stock_v1',
] as const;

describe('CreatePurchaseOrder', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      SUPPLIER_STORAGE_KEY,
      JSON.stringify([
        supplierFixture(),
        supplierFixture({ id: 102, supplierCode: 'SUP-INACTIVE', status: 'inactive' }),
        supplierFixture({
          id: 201,
          storeId: 'store-002',
          supplierCode: 'SUP-201',
          name: 'Store Two Supplier',
        }),
      ]),
    );
    localStorage.setItem(
      WAREHOUSE_STORAGE_KEY,
      JSON.stringify([
        warehouseFixture(),
        warehouseFixture({ id: 'warehouse-inactive', code: 'WH-INACTIVE', status: 'inactive' }),
        warehouseFixture({
          id: 'warehouse-002',
          storeId: 'store-002',
          code: 'WH-002',
          name: 'Store Two Warehouse',
        }),
      ]),
    );
    localStorage.setItem(
      BRANCH_STORAGE_KEY,
      JSON.stringify([
        branchFixture(),
        branchFixture({ id: 'branch-inactive', code: 'BR-INACTIVE', status: 'inactive' }),
        branchFixture({
          id: 'branch-002',
          storeId: 'store-002',
          code: 'BR-002',
          name: 'Store Two Branch',
        }),
      ]),
    );
    localStorage.setItem(
      PRODUCT_STORAGE_KEY,
      JSON.stringify([
        productFixture(),
        variantProductFixture(),
        productFixture({ id: 'product-archived', sku: 'ARCH-001', status: 'archived' }),
        productFixture({
          id: 'product-002',
          storeId: 'store-002',
          name: 'Store Two Product',
          sku: 'STORE2-001',
        }),
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('offers only active same-store warehouses when a warehouse exists', () => {
    const { component } = createComponent();

    expect(component.activeSuppliers().map((supplier) => supplier.id)).toEqual([101]);
    expect(component.receivingLocations().map((location) => location.key)).toEqual([
      'warehouse:warehouse-001',
    ]);
    expect(component.activeProducts().map((product) => product.id)).toEqual([
      'product-simple',
      'product-variant',
    ]);
  });

  it('handles simple and variant products, clears stale variants, and resolves SKU snapshots', () => {
    const { component } = createComponent();
    const item = component.items.at(0);

    item.controls.productId.setValue('product-simple');
    component.onProductChange(0);
    expect(component.productRequiresVariant(0)).toBe(false);
    expect(item.controls.variantId.hasError('required')).toBe(false);
    expect(component.itemSku(0)).toBe('SIMPLE-001');

    item.controls.productId.setValue('product-variant');
    component.onProductChange(0);
    expect(component.productRequiresVariant(0)).toBe(true);
    expect(item.controls.variantId.hasError('required')).toBe(true);

    item.controls.variantId.setValue('variant-black');
    component.onVariantChange(0);
    expect(component.itemSku(0)).toBe('PHONE-BLK-128');
    expect(component.variantLabel(component.selectedVariant(0)!)).toBe('Black / 128GB');

    item.controls.productId.setValue('product-simple');
    component.onProductChange(0);
    expect(item.controls.variantId.value).toBe('');
    expect(item.controls.variantId.hasError('required')).toBe(false);
  });

  it('manages independent item rows, live totals, removal, and exact duplicate prevention', () => {
    const { component } = createComponent();
    const first = component.items.at(0);
    first.controls.productId.setValue('product-simple');
    component.onProductChange(0);
    first.controls.quantity.setValue(2);
    first.controls.purchasePrice.setValue(1000);

    component.addItem();
    const second = component.items.at(1);
    second.controls.productId.setValue('product-variant');
    component.onProductChange(1);
    second.controls.variantId.setValue('variant-black');
    component.onVariantChange(1);
    second.controls.quantity.setValue(3);
    second.controls.purchasePrice.setValue(500);
    component.purchaseOrderForm.patchValue({ taxAmount: 350, discountAmount: 100 });

    expect(component.lineTotal(0)).toBe(2000);
    expect(component.lineTotal(1)).toBe(1500);
    expect(component.subtotal()).toBe(3500);
    expect(component.grandTotal()).toBe(3750);

    component.removeItem(1);
    expect(component.items.length).toBe(1);
    expect(component.subtotal()).toBe(2000);

    component.addItem();
    const duplicate = component.items.at(1);
    duplicate.controls.productId.setValue('product-simple');
    component.onProductChange(1);
    expect(duplicate.controls.productId.hasError('duplicateItem')).toBe(true);
  });

  it('rejects invalid quantities, prices, and an expected date before the order date', () => {
    const { component } = createComponent();
    const item = component.items.at(0);

    item.controls.quantity.setValue(0);
    item.controls.purchasePrice.setValue(-1);
    component.purchaseOrderForm.patchValue({
      orderDate: '2026-08-20',
      expectedDeliveryDate: '2026-08-19',
    });

    expect(item.controls.quantity.hasError('min')).toBe(true);
    expect(item.controls.purchasePrice.hasError('min')).toBe(true);
    expect(component.purchaseOrderForm.hasError('deliveryBeforeOrder')).toBe(true);
  });

  it('resets store-dependent selections and rows when the global store changes', () => {
    const { component, fixture, storeService } = createComponent();
    component.purchaseOrderForm.patchValue({
      supplierId: 101,
      receivingLocationId: 'warehouse:warehouse-001',
      notes: 'Store A note',
    });
    component.items.at(0).controls.productId.setValue('product-simple');
    component.onProductChange(0);
    component.addItem();

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(component.activeSuppliers().map((supplier) => supplier.id)).toEqual([201]);
    expect(component.purchaseOrderForm.controls.supplierId.value).toBe(0);
    expect(component.purchaseOrderForm.controls.receivingLocationId.value).toBe('');
    expect(component.items.length).toBe(1);
    expect(component.items.at(0).controls.productId.value).toBe('');
    expect(component.storeContextMessage()).toContain('selected store changed');
  });

  it('saves a service-generated draft with snapshots and does not mutate inventory or stock', () => {
    const { component, purchaseOrderService, router } = createComponent();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const stockBefore = new Map(STOCK_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));

    component.purchaseOrderForm.patchValue({
      supplierId: 101,
      receivingLocationId: 'warehouse:warehouse-001',
      orderDate: '2026-08-21',
      expectedDeliveryDate: '2026-08-28',
      taxAmount: 350,
      discountAmount: 100,
      notes: 'Deliver during business hours.',
    });
    const first = component.items.at(0);
    first.controls.productId.setValue('product-simple');
    component.onProductChange(0);
    first.controls.quantity.setValue(2);
    first.controls.purchasePrice.setValue(1000);

    component.addItem();
    const second = component.items.at(1);
    second.controls.productId.setValue('product-variant');
    component.onProductChange(1);
    second.controls.variantId.setValue('variant-black');
    component.onVariantChange(1);
    second.controls.quantity.setValue(3);
    second.controls.purchasePrice.setValue(500);

    component.saveDraft();

    const created = purchaseOrderService.purchaseOrders()[0];
    expect(created).toBeDefined();
    expect(created.status).toBe('draft');
    expect(created.poNumber).toMatch(/^PO-\d{8}-\d{4}$/);
    expect(created.supplierName).toBe('Tech Distribution Ltd.');
    expect(created.receivingLocationName).toBe('Main Warehouse');
    expect(created.receivingLocationType).toBe('warehouse');
    expect(created.items[0]).toEqual(
      expect.objectContaining({
        productName: 'Simple Product',
        variantId: null,
        sku: 'SIMPLE-001',
        receivedQuantity: 0,
      }),
    );
    expect(created.items[1]).toEqual(
      expect.objectContaining({
        productName: 'Variant Phone',
        variantName: 'Black / 128GB',
        sku: 'PHONE-BLK-128',
        receivedQuantity: 0,
      }),
    );
    expect(created.subtotal).toBe(3500);
    expect(created.totalAmount).toBe(3750);
    expect(JSON.parse(localStorage.getItem(PURCHASE_ORDER_STORAGE_KEY) ?? '[]')).toEqual([created]);
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/purchase-orders']);
    for (const key of STOCK_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBe(stockBefore.get(key));
    }
  });

  it('offers only the store and creates a store-destination PO when no warehouse exists', () => {
    localStorage.setItem(WAREHOUSE_STORAGE_KEY, JSON.stringify([]));
    const { component, purchaseOrderService, router } = createComponent();
    vi.spyOn(router, 'navigate').mockResolvedValue(true);

    expect(component.receivingLocations().map((location) => location.key)).toEqual(['store']);
    component.purchaseOrderForm.patchValue({
      supplierId: 101,
      receivingLocationId: 'store',
      orderDate: '2026-08-21',
    });
    const item = component.items.at(0);
    item.controls.productId.setValue('product-simple');
    component.onProductChange(0);
    item.controls.quantity.setValue(1);
    item.controls.purchasePrice.setValue(100);

    component.saveDraft();

    expect(purchaseOrderService.purchaseOrders()[0]).toEqual(
      expect.objectContaining({
        receivingLocationId: 'store',
        receivingLocationType: 'store',
      }),
    );
    expect(purchaseOrderService.purchaseOrders()[0]?.receivingLocationName).toContain('Main Store');
  });

  it('does not offer branches as purchase order receiving destinations', () => {
    const { component } = createComponent();

    expect(component.receivingLocations().some((location) => location.type === 'branch')).toBe(false);
  });

  it('cancels without creating a purchase order', () => {
    const { component, purchaseOrderService, router } = createComponent();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.cancel();

    expect(purchaseOrderService.purchaseOrders()).toEqual([]);
    expect(localStorage.getItem(PURCHASE_ORDER_STORAGE_KEY)).toBeNull();
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/purchase-orders']);
  });
});

function createComponent(): {
  component: CreatePurchaseOrder;
  fixture: ComponentFixture<CreatePurchaseOrder>;
  purchaseOrderService: PurchaseOrderService;
  router: Router;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [CreatePurchaseOrder],
    providers: [provideRouter([])],
  });

  const fixture = TestBed.createComponent(CreatePurchaseOrder);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    purchaseOrderService: TestBed.inject(PurchaseOrderService),
    router: TestBed.inject(Router),
    storeService: TestBed.inject(StoreService),
  };
}

function supplierFixture(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 101,
    storeId: 'store-001',
    supplierCode: 'SUP-101',
    name: 'Tech Distribution Ltd.',
    contactPerson: 'Ali Khan',
    email: 'ali@example.com',
    phone: '03001234567',
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function warehouseFixture(overrides: Partial<Warehouse> = {}): Warehouse {
  return {
    id: 'warehouse-001',
    storeId: 'store-001',
    name: 'Main Warehouse',
    code: 'WH-001',
    address: '1 Warehouse Road',
    city: 'Karachi',
    state: 'Sindh',
    country: 'Pakistan',
    managerKey: 'manager-001',
    managerName: 'Warehouse Manager',
    managerEmail: 'warehouse@example.com',
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    updatedAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function branchFixture(overrides: Partial<Branch> = {}): Branch {
  return {
    id: 'branch-001',
    storeId: 'store-001',
    addressScope: 'international',
    name: 'Main Branch',
    code: 'BR-001',
    description: 'Main retail branch',
    country: 'Pakistan',
    state: 'Sindh',
    city: 'Karachi',
    address: '2 Branch Road',
    postalCode: '74000',
    managerName: 'Branch Manager',
    managerEmail: 'branch@example.com',
    managerPhone: '03001234567',
    operatingHours: [],
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    updatedAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function productFixture(overrides: Partial<Product> = {}): Product {
  return {
    id: 'product-simple',
    storeId: 'store-001',
    name: 'Simple Product',
    sku: 'SIMPLE-001',
    category: 'Test',
    categoryId: 'test-category',
    price: 100,
    stock: 0,
    status: 'active',
    imageUrl: '',
    imageUrls: [],
    description: 'Test product',
    tags: [],
    attributes: [],
    variants: [],
    rating: 5,
    salesCount: 0,
    ...overrides,
  };
}

function variantProductFixture(): Product {
  return productFixture({
    id: 'product-variant',
    name: 'Variant Phone',
    sku: 'PHONE-001',
    variants: [
      {
        id: 'variant-black',
        productId: 'product-variant',
        sku: 'PHONE-BLK-128',
        status: 'active',
        attributes: [
          { attributeDefinitionId: 'color', attributeKey: 'color', value: 'Black' },
          { attributeDefinitionId: 'storage', attributeKey: 'storage', value: '128GB' },
        ],
      },
      {
        id: 202,
        productId: 'product-variant',
        sku: 'PHONE-BLU-256',
        status: 'active',
        attributes: [
          { attributeDefinitionId: 'color', attributeKey: 'color', value: 'Blue' },
          { attributeDefinitionId: 'storage', attributeKey: 'storage', value: '256GB' },
        ],
      },
      {
        id: 'variant-inactive',
        productId: 'product-variant',
        sku: 'PHONE-OLD',
        status: 'inactive',
        attributes: [{ attributeDefinitionId: 'color', attributeKey: 'color', value: 'Silver' }],
      },
    ],
  });
}
