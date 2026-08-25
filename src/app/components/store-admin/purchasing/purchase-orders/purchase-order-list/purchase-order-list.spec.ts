import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import Swal from 'sweetalert2';

import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { PurchaseOrder } from '../models/purchase-order.model';
import { PurchaseOrderList } from './purchase-order-list';

const STORAGE_KEY = 'digishop_purchase_orders';

describe('PurchaseOrderList', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        purchaseOrderFixture(),
        purchaseOrderFixture({
          id: 'po-ordered',
          poNumber: 'PO-20260820-0002',
          supplierId: 102,
          supplierName: 'Global Traders',
          receivingLocationName: 'North Branch',
          receivingLocationId: 'branch:branch-north',
          receivingLocationType: 'branch',
          status: 'ordered',
        }),
        purchaseOrderFixture({
          id: 'po-partial',
          poNumber: 'PO-20260820-0003',
          status: 'partially_received',
          items: [purchaseOrderItemFixture({ receivedQuantity: 1 })],
        }),
        purchaseOrderFixture({
          id: 'po-received',
          poNumber: 'PO-20260820-0004',
          status: 'received',
          items: [purchaseOrderItemFixture({ receivedQuantity: 2 })],
        }),
        purchaseOrderFixture({
          id: 'po-cancelled',
          poNumber: 'PO-20260820-0005',
          status: 'cancelled',
        }),
        purchaseOrderFixture({
          id: 'po-other-store',
          storeId: 'store-002',
          poNumber: 'PO-20260820-0006',
          supplierId: 201,
          supplierName: 'Store Two Supplier',
          receivingLocationId: 'warehouse:warehouse-002',
          receivingLocationName: 'Store Two Warehouse',
          receivingLocationType: 'warehouse',
        }),
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps summary counts and purchase orders isolated to the selected store', () => {
    const { component, fixture, storeService } = createComponent();

    expect(component.totalPurchaseOrders()).toBe(5);
    expect(component.draftPurchaseOrders()).toBe(1);
    expect(component.orderedPurchaseOrders()).toBe(1);
    expect(component.partiallyReceivedPurchaseOrders()).toBe(1);
    expect(component.receivedPurchaseOrders()).toBe(1);
    expect(component.cancelledPurchaseOrders()).toBe(1);

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(component.totalPurchaseOrders()).toBe(1);
    expect(component.purchaseOrders()[0]?.id).toBe('po-other-store');
  });

  it('searches PO, supplier, and receiving-location snapshots and combines typed filters', () => {
    const { component } = createComponent();

    component.searchTerm.set('0002');
    expect(component.filteredPurchaseOrders().map((order) => order.id)).toEqual(['po-ordered']);

    component.searchTerm.set('global traders');
    expect(component.filteredPurchaseOrders().map((order) => order.id)).toEqual(['po-ordered']);

    component.searchTerm.set('north branch');
    expect(component.filteredPurchaseOrders().map((order) => order.id)).toEqual(['po-ordered']);

    component.searchTerm.set('');
    component.statusFilter.set('ordered');
    component.supplierFilter.set(102);
    expect(component.filteredPurchaseOrders().map((order) => order.id)).toEqual(['po-ordered']);
  });

  it('shows status-appropriate edit, submit, receive, and cancellation actions', () => {
    const { component, fixture } = createComponent();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('button[title="Edit purchase order"]')).toHaveLength(1);
    expect(element.querySelectorAll('button[title="Submit purchase order"]')).toHaveLength(1);
    expect(element.querySelectorAll('button[title="Receive goods"]')).toHaveLength(2);
    expect(element.textContent).toContain('Receive Goods');
    expect(element.textContent).toContain('Receive Remaining');
    expect(element.querySelectorAll('button[title="Cancel purchase order"]')).toHaveLength(2);
    expect(
      component.canCancel(component.purchaseOrders().find((order) => order.id === 'po-received')!),
    ).toBe(false);
  });

  it('confirms draft submission, updates summaries, persists status, and leaves stock untouched', async () => {
    const { component, purchaseOrderService, storeService } = createComponent();
    const showToast = vi.spyOn(storeService, 'showToast');
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });
    const draft = component.purchaseOrders().find((order) => order.id === 'po-draft');

    expect(draft).toBeDefined();
    await component.submitPurchaseOrder(draft as PurchaseOrder);

    expect(purchaseOrderService.getPurchaseOrderById('po-draft')?.status).toBe('ordered');
    expect(component.draftPurchaseOrders()).toBe(0);
    expect(component.orderedPurchaseOrders()).toBe(2);
    expect(readStoredPurchaseOrders().find((order) => order.id === 'po-draft')?.status).toBe(
      'ordered',
    );
    expect(showToast).toHaveBeenCalledWith('Purchase order submitted successfully.', 'success');
    expect(localStorage.getItem('digishop_inventory_balances_v1')).toBeNull();
    expect(localStorage.getItem('digishop_inventory_transactions_v1')).toBeNull();
    expect(localStorage.getItem('digishop_warehouse_stock_v1')).toBeNull();
  });

  it('does not cancel or persist changes when confirmation is dismissed', async () => {
    const { component, purchaseOrderService, storeService } = createComponent();
    const changeStatus = vi.spyOn(purchaseOrderService, 'changePurchaseOrderStatus');
    const showToast = vi.spyOn(storeService, 'showToast');
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: false,
      isDenied: false,
      isDismissed: true,
    });
    const ordered = component.purchaseOrders().find((order) => order.id === 'po-ordered');

    expect(ordered).toBeDefined();
    await component.cancelPurchaseOrder(ordered as PurchaseOrder);

    expect(changeStatus).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(readStoredPurchaseOrders().find((order) => order.id === 'po-ordered')?.status).toBe(
      'ordered',
    );
  });
});

function createComponent(): {
  component: PurchaseOrderList;
  fixture: ComponentFixture<PurchaseOrderList>;
  purchaseOrderService: PurchaseOrderService;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [PurchaseOrderList],
    providers: [provideRouter([])],
  });

  const fixture = TestBed.createComponent(PurchaseOrderList);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    purchaseOrderService: TestBed.inject(PurchaseOrderService),
    storeService: TestBed.inject(StoreService),
  };
}

function purchaseOrderFixture(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const items = overrides.items ?? [purchaseOrderItemFixture()];
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  return {
    id: 'po-draft',
    storeId: 'store-001',
    poNumber: 'PO-20260820-0001',
    supplierId: 101,
    supplierName: 'Tech Distribution Ltd.',
    receivingLocationId: 'warehouse:warehouse-001',
    receivingLocationName: 'Main Warehouse',
    receivingLocationType: 'warehouse',
    orderDate: '2026-08-20T00:00:00.000Z',
    expectedDeliveryDate: '2026-08-25T00:00:00.000Z',
    items,
    subtotal,
    taxAmount: 100,
    discountAmount: 50,
    totalAmount: subtotal + 50,
    status: 'draft',
    createdAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function purchaseOrderItemFixture(
  overrides: Partial<PurchaseOrder['items'][number]> = {},
): PurchaseOrder['items'][number] {
  return {
    id: 'po-item-001',
    productId: 'product-001',
    variantId: null,
    productName: 'Test Product',
    sku: 'SKU-001',
    quantity: 2,
    receivedQuantity: 0,
    purchasePrice: 1000,
    lineTotal: 2000,
    ...overrides,
  };
}

function readStoredPurchaseOrders(): PurchaseOrder[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as PurchaseOrder[];
}
