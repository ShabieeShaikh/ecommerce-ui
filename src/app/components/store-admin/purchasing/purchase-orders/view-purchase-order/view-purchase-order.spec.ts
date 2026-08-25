import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { GoodsReceipt } from '../../goods-receipts/models/goods-receipt.model';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { Supplier } from '../../suppliers/models/supplier.model';
import { PurchaseOrder } from '../models/purchase-order.model';
import { ViewPurchaseOrder } from './view-purchase-order';

const PURCHASE_ORDER_STORAGE_KEY = 'digishop_purchase_orders';
const SUPPLIER_STORAGE_KEY = 'digishop_suppliers';
const GOODS_RECEIPT_STORAGE_KEY = 'digishop_goods_receipts_v1';
const STOCK_STORAGE_KEYS = [
  'digishop_inventory_balances_v1',
  'digishop_inventory_transactions_v1',
  'digishop_inventory_orders_v1',
  'digishop_product_inventory_v1',
  'digishop_warehouse_stock_v1',
] as const;

describe('ViewPurchaseOrder', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SUPPLIER_STORAGE_KEY, JSON.stringify([supplierFixture()]));
    localStorage.setItem(PURCHASE_ORDER_STORAGE_KEY, JSON.stringify([purchaseOrderFixture()]));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders a draft PO with supplier, store destination, snapshots, totals, and draft actions', () => {
    const { component, fixture } = createComponent();
    const content = fixture.nativeElement.textContent as string;

    expect(component.purchaseOrder()?.poNumber).toBe('PO-20260821-0001');
    expect(content).toContain('Tech Distribution Ltd.');
    expect(content).toContain('SUP-101');
    expect(content).toContain('DigiShop Main Store');
    expect(content).toContain('Store');
    expect(content).toContain('Test Product');
    expect(content).toContain('SKU-001');
    expect(content).toContain('$2,050.00');
    expect(buttonLabels(fixture)).toEqual(
      expect.arrayContaining([
        'Back to Purchase Orders',
        'Edit Draft',
        'Submit Order',
        'Cancel Purchase Order',
      ]),
    );
  });

  it.each([
    ['store', 'store', 'DigiShop Main Store', 'Store'],
    ['branch', 'branch:branch-001', 'Clifton Branch', 'Branch'],
    ['warehouse', 'warehouse:warehouse-001', 'Karachi Main Warehouse', 'Warehouse'],
  ] as const)(
    'shows a %s receiving destination with its user-facing type',
    (type, id, name, label) => {
      localStorage.setItem(
        PURCHASE_ORDER_STORAGE_KEY,
        JSON.stringify([
          purchaseOrderFixture({
            receivingLocationId: id,
            receivingLocationName: name,
            receivingLocationType: type,
          }),
        ]),
      );

      const { component, fixture } = createComponent();

      expect(component.purchaseOrder()?.receivingLocationName).toBe(name);
      expect(component.locationTypeLabel(type)).toBe(label);
      expect(fixture.nativeElement.textContent).toContain(name);
    },
  );

  it('derives ordered, received, and non-negative remaining quantities', () => {
    const partialItem = purchaseOrderItemFixture({ quantity: 100, receivedQuantity: 40 });
    const overReceivedDisplayGuard = purchaseOrderItemFixture({
      id: 'po-item-guard',
      quantity: 5,
      receivedQuantity: 5,
    });
    localStorage.setItem(
      PURCHASE_ORDER_STORAGE_KEY,
      JSON.stringify([
        purchaseOrderFixture({
          status: 'partially_received',
          items: [partialItem, overReceivedDisplayGuard],
        }),
      ]),
    );
    const { component } = createComponent();

    expect(component.remainingQuantity(partialItem)).toBe(60);
    expect(component.remainingQuantity(overReceivedDisplayGuard)).toBe(0);
    expect(component.totalOrderedQuantity()).toBe(105);
    expect(component.totalReceivedQuantity()).toBe(45);
    expect(component.totalRemainingQuantity()).toBe(60);
  });

  it('hides a PO immediately when the selected store changes', () => {
    const { component, fixture, storeService } = createComponent();
    expect(component.purchaseOrder()).toBeDefined();

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(component.purchaseOrder()).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Purchase Order not found');
  });

  it('shows a clean not-found state for an invalid or missing route ID', () => {
    const { component, fixture } = createComponent('missing-po-id');

    expect(component.purchaseOrder()).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Purchase Order not found');
    expect(buttonLabels(fixture)).toContain('Back to Purchase Orders');
  });

  it('navigates back and prepares the draft edit route', () => {
    const { component, router } = createComponent();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const purchaseOrder = component.purchaseOrder();

    component.backToPurchaseOrders();
    component.editPurchaseOrder(purchaseOrder!);

    expect(navigate).toHaveBeenNthCalledWith(1, ['/store-admin/purchasing/purchase-orders']);
    expect(navigate).toHaveBeenNthCalledWith(2, [
      '/store-admin/purchasing/purchase-orders',
      'po-draft',
      'edit',
    ]);
  });

  it('shows and navigates the Receive Goods action only for ordered POs', () => {
    localStorage.setItem(
      PURCHASE_ORDER_STORAGE_KEY,
      JSON.stringify([purchaseOrderFixture({ status: 'ordered' })]),
    );
    const { component, fixture, router } = createComponent();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    expect(buttonLabels(fixture)).toContain('Receive Goods');
    component.receiveGoods(component.purchaseOrder()!);

    expect(navigate).toHaveBeenCalledWith([
      '/store-admin/purchasing/purchase-orders',
      'po-draft',
      'receive',
    ]);
  });

  it('shows Receive Remaining Goods for partial POs and hides receiving after completion', () => {
    localStorage.setItem(
      PURCHASE_ORDER_STORAGE_KEY,
      JSON.stringify([purchaseOrderFixture({ status: 'partially_received' })]),
    );
    const partial = createComponent();
    expect(buttonLabels(partial.fixture)).toContain('Receive Remaining Goods');

    TestBed.resetTestingModule();
    localStorage.setItem(
      PURCHASE_ORDER_STORAGE_KEY,
      JSON.stringify([purchaseOrderFixture({ status: 'received' })]),
    );
    const received = createComponent();
    expect(buttonLabels(received.fixture)).not.toContain('Receive Goods');
    expect(buttonLabels(received.fixture)).not.toContain('Receive Remaining Goods');
  });

  it('shows persisted GRN receiving history and receipt quantities', () => {
    const purchaseOrder = purchaseOrderFixture({ status: 'partially_received' });
    localStorage.setItem(PURCHASE_ORDER_STORAGE_KEY, JSON.stringify([purchaseOrder]));
    localStorage.setItem(
      GOODS_RECEIPT_STORAGE_KEY,
      JSON.stringify([goodsReceiptFixture(purchaseOrder)]),
    );

    const { component, fixture, router } = createComponent();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const content = fixture.nativeElement.textContent as string;

    expect(component.receivingHistory()).toHaveLength(1);
    expect(content).toContain('Receiving History');
    expect(content).toContain('GRN-20260824-0001');
    expect(content).toContain('40');
    expect(content).toContain('DigiShop Main Store');
    expect(buttonLabels(fixture)).toContain('View GRN');

    component.viewGoodsReceipt('grn-1');
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/goods-receipts', 'grn-1']);
  });

  it('keeps Draft when submit is dismissed, then submits reactively and persists without stock changes', async () => {
    const { component, fixture, purchaseOrderService, storeService } = createComponent();
    const showToast = vi.spyOn(storeService, 'showToast');
    const stockBefore = new Map(STOCK_STORAGE_KEYS.map((key) => [key, localStorage.getItem(key)]));
    vi.spyOn(Swal, 'fire')
      .mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true })
      .mockResolvedValueOnce({ isConfirmed: true, isDenied: false, isDismissed: false });

    await component.submitPurchaseOrder(component.purchaseOrder()!);
    expect(component.purchaseOrder()?.status).toBe('draft');

    await component.submitPurchaseOrder(component.purchaseOrder()!);
    fixture.detectChanges();

    expect(component.purchaseOrder()?.status).toBe('ordered');
    expect(purchaseOrderService.getPurchaseOrderById('po-draft')?.status).toBe('ordered');
    expect(readStoredPurchaseOrder()?.status).toBe('ordered');
    expect(buttonLabels(fixture)).not.toContain('Edit Draft');
    expect(buttonLabels(fixture)).not.toContain('Submit Order');
    expect(showToast).toHaveBeenCalledWith('Purchase order submitted successfully.', 'success');
    for (const key of STOCK_STORAGE_KEYS) {
      expect(localStorage.getItem(key)).toBe(stockBefore.get(key));
    }
  });

  it('only offers cancellation when the service business rules allow it', () => {
    const { component } = createComponent();
    const draft = component.purchaseOrder()!;

    expect(component.canCancel(draft)).toBe(true);
    expect(component.canCancel({ ...draft, status: 'received' })).toBe(false);
    expect(
      component.canCancel({
        ...draft,
        status: 'ordered',
        items: [purchaseOrderItemFixture({ receivedQuantity: 1 })],
      }),
    ).toBe(false);
  });

  it('does not cancel when confirmation is dismissed and persists cancellation when confirmed', async () => {
    const { component, fixture } = createComponent();
    vi.spyOn(Swal, 'fire')
      .mockResolvedValueOnce({ isConfirmed: false, isDenied: false, isDismissed: true })
      .mockResolvedValueOnce({ isConfirmed: true, isDenied: false, isDismissed: false });

    await component.cancelPurchaseOrder(component.purchaseOrder()!);
    expect(component.purchaseOrder()?.status).toBe('draft');

    await component.cancelPurchaseOrder(component.purchaseOrder()!);
    fixture.detectChanges();

    expect(component.purchaseOrder()?.status).toBe('cancelled');
    expect(readStoredPurchaseOrder()?.status).toBe('cancelled');
    expect(buttonLabels(fixture)).not.toContain('Edit Draft');
    expect(buttonLabels(fixture)).not.toContain('Submit Order');
    expect(buttonLabels(fixture)).not.toContain('Cancel Purchase Order');
  });
});

function createComponent(id = 'po-draft'): {
  component: ViewPurchaseOrder;
  fixture: ComponentFixture<ViewPurchaseOrder>;
  purchaseOrderService: PurchaseOrderService;
  router: Router;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [ViewPurchaseOrder],
    providers: [
      provideHttpClient(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
      },
    ],
  });

  const storeService = TestBed.inject(StoreService);
  storeService.changeSelectedStore('store-001', false);
  const fixture = TestBed.createComponent(ViewPurchaseOrder);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    purchaseOrderService: TestBed.inject(PurchaseOrderService),
    router: TestBed.inject(Router),
    storeService,
  };
}

function purchaseOrderFixture(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const items = overrides.items ?? [purchaseOrderItemFixture()];
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  return {
    id: 'po-draft',
    storeId: 'store-001',
    poNumber: 'PO-20260821-0001',
    supplierId: 101,
    supplierName: 'Tech Distribution Ltd.',
    receivingLocationId: 'store',
    receivingLocationName: 'DigiShop Main Store',
    receivingLocationType: 'store',
    orderDate: '2026-08-21T00:00:00.000Z',
    expectedDeliveryDate: '2026-08-28T00:00:00.000Z',
    items,
    subtotal,
    taxAmount: 100,
    discountAmount: 50,
    totalAmount: subtotal + 50,
    notes: 'Deliver during business hours.',
    status: 'draft',
    createdAt: '2026-08-21T06:30:00.000Z',
    ...overrides,
  };
}

function purchaseOrderItemFixture(
  overrides: Partial<PurchaseOrder['items'][number]> = {},
): PurchaseOrder['items'][number] {
  const quantity = overrides.quantity ?? 2;
  const purchasePrice = overrides.purchasePrice ?? 1000;
  return {
    id: 'po-item-001',
    productId: 'product-001',
    variantId: null,
    productName: 'Test Product',
    sku: 'SKU-001',
    quantity,
    receivedQuantity: 0,
    purchasePrice,
    lineTotal: quantity * purchasePrice,
    ...overrides,
  };
}

function supplierFixture(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 101,
    storeId: 'store-001',
    supplierCode: 'SUP-101',
    name: 'Current Supplier Name',
    contactPerson: 'Ali Khan',
    email: 'ali@example.com',
    phone: '03001234567',
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function goodsReceiptFixture(purchaseOrder: PurchaseOrder): GoodsReceipt {
  const item = purchaseOrder.items[0];
  return {
    id: 'goods-receipt-001',
    grnNumber: 'GRN-20260824-0001',
    purchaseOrderId: purchaseOrder.id,
    poNumber: purchaseOrder.poNumber,
    storeId: purchaseOrder.storeId,
    supplierId: purchaseOrder.supplierId,
    supplierName: purchaseOrder.supplierName,
    receivingLocationId: purchaseOrder.receivingLocationId,
    receivingLocationName: purchaseOrder.receivingLocationName,
    receivingLocationType: purchaseOrder.receivingLocationType,
    receivedDate: '2026-08-24',
    items: [
      {
        id: 'goods-receipt-item-001',
        purchaseOrderItemId: item.id,
        inventoryTransactionId: 'inventory-transaction-001',
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        variantName: item.variantName,
        sku: item.sku,
        orderedQuantity: item.quantity,
        previouslyReceivedQuantity: 0,
        receivedNowQuantity: 40,
        totalReceivedQuantity: 40,
        remainingQuantity: Math.max(0, item.quantity - 40),
      },
    ],
    createdAt: '2026-08-24T08:00:00.000Z',
  };
}

function buttonLabels(fixture: ComponentFixture<ViewPurchaseOrder>): string[] {
  const element = fixture.nativeElement as HTMLElement;
  return Array.from(element.querySelectorAll('button')).map((button) =>
    (button.textContent ?? '').trim().replace(/\s+/g, ' '),
  );
}

function readStoredPurchaseOrder(): PurchaseOrder | undefined {
  const purchaseOrders = JSON.parse(
    localStorage.getItem(PURCHASE_ORDER_STORAGE_KEY) ?? '[]',
  ) as PurchaseOrder[];
  return purchaseOrders[0];
}
