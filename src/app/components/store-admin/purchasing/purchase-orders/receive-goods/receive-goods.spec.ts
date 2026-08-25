import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import Swal from 'sweetalert2';

import { GoodsReceipt } from '../../goods-receipts/models/goods-receipt.model';
import { PurchaseOrder, PurchaseOrderItem } from '../models/purchase-order.model';
import { GoodsReceiptService } from '../../../../../services/goods-receipt.service';
import { InventoryService } from '../../../../../services/inventory.service';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { ReceiveGoods } from './receive-goods';

const PURCHASE_ORDER_STORAGE_KEY = 'digishop_purchase_orders';

describe('ReceiveGoods', () => {
  beforeEach(() => localStorage.clear());

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders ordered PO snapshots, a read-only destination, and zeroed receiving controls', () => {
    seedPurchaseOrder(purchaseOrderFixture());
    const { component, fixture } = createComponent();
    const content = fixture.nativeElement.textContent as string;

    expect(component.canReceivePurchaseOrder()).toBe(true);
    expect(component.items.length).toBe(2);
    expect(
      component.receiptForm.getRawValue().items.map((item) => item.receivedNowQuantity),
    ).toEqual([0, 0]);
    expect(content).toContain('PO-20260821-0001');
    expect(content).toContain('Tech Distribution Ltd.');
    expect(content).toContain('DigiShop Main Store');
    expect(content).toContain('Store');
    expect(content).toContain('Test Product');
    expect(content).toContain('Blue / Large');
    expect(content).toContain('Enter a quantity for at least one item to receive.');
    expect(findButton(fixture, 'Post Goods Receipt').disabled).toBe(true);
  });

  it('shows partial quantities and disables a fully received line', () => {
    seedPurchaseOrder(
      purchaseOrderFixture({
        status: 'partially_received',
        items: [
          purchaseOrderItemFixture({ quantity: 100, receivedQuantity: 40 }),
          purchaseOrderItemFixture({
            id: 'po-item-complete',
            productId: 'prod-102',
            productName: 'Slim Fit Denim Jeans',
            sku: 'FH-JNS-002',
            variantName: undefined,
            quantity: 50,
            receivedQuantity: 50,
          }),
        ],
      }),
    );
    const { component, fixture } = createComponent();
    const content = fixture.nativeElement.textContent as string;

    expect(component.remainingQuantity(component.purchaseOrder()!.items[0])).toBe(60);
    expect(component.items.at(1).controls.receivedNowQuantity.disabled).toBe(true);
    expect(content).toContain('Previously Received');
    expect(content).toContain('Fully Received');
    expect(content).toContain('Partially Received');
  });

  it('fills one or all remaining lines without submitting and can clear quantities', () => {
    seedPurchaseOrder(purchaseOrderFixture());
    const { component } = createComponent();
    const receiveGoods = vi.spyOn(TestBed.inject(GoodsReceiptService), 'receiveGoods');

    component.receiveAllForItem(0);
    expect(
      component.receiptForm.getRawValue().items.map((item) => item.receivedNowQuantity),
    ).toEqual([60, 0]);
    expect(component.receivingNowQuantity()).toBe(60);
    expect(receiveGoods).not.toHaveBeenCalled();

    component.receiveAllRemaining();
    expect(
      component.receiptForm.getRawValue().items.map((item) => item.receivedNowQuantity),
    ).toEqual([60, 30]);
    expect(component.itemsInReceipt()).toBe(2);
    expect(component.afterReceiptQuantity()).toBe(130);
    expect(receiveGoods).not.toHaveBeenCalled();

    component.clearQuantities();
    expect(
      component.receiptForm.getRawValue().items.map((item) => item.receivedNowQuantity),
    ).toEqual([0, 0]);
  });

  it('shows and clears over-receipt validation while preventing service submission', async () => {
    seedPurchaseOrder(purchaseOrderFixture());
    const { component, fixture } = createComponent();
    const service = TestBed.inject(GoodsReceiptService);
    const receiveGoods = vi.spyOn(service, 'receiveGoods');
    const control = component.items.at(0).controls.receivedNowQuantity;

    control.setValue(61);
    control.markAsTouched();
    fixture.detectChanges();

    expect(control.hasError('max')).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'Cannot receive more than the remaining quantity (60).',
    );
    expect(component.canSubmit()).toBe(false);
    await component.postGoodsReceipt();
    expect(receiveGoods).not.toHaveBeenCalled();

    control.setValue(50);
    fixture.detectChanges();
    expect(control.valid).toBe(true);
    expect(fixture.nativeElement.textContent).not.toContain(
      'Cannot receive more than the remaining quantity (60).',
    );
    expect(component.canSubmit()).toBe(true);
  });

  it('does nothing when confirmation is cancelled', async () => {
    seedPurchaseOrder(purchaseOrderFixture());
    const { component } = createComponent();
    component.items.at(0).controls.receivedNowQuantity.setValue(20);
    const service = TestBed.inject(GoodsReceiptService);
    const receiveGoods = vi.spyOn(service, 'receiveGoods');
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: false,
      isDenied: false,
      isDismissed: true,
    });

    await component.postGoodsReceipt();

    expect(receiveGoods).not.toHaveBeenCalled();
    expect(component.isSubmitting()).toBe(false);
    expect(component.items.at(0).controls.receivedNowQuantity.value).toBe(20);
  });

  it('filters zero rows, calls GoodsReceiptService once, and navigates after confirmation', async () => {
    const purchaseOrder = purchaseOrderFixture();
    seedPurchaseOrder(purchaseOrder);
    const { component, router, storeService } = createComponent();
    component.receiptForm.controls.receivedDate.setValue('2026-08-24');
    component.receiptForm.controls.notes.setValue('Delivery inspected.');
    component.items.at(0).controls.receivedNowQuantity.setValue(20);
    component.items.at(1).controls.receivedNowQuantity.setValue(0);
    const service = TestBed.inject(GoodsReceiptService);
    const receiveGoods = vi
      .spyOn(service, 'receiveGoods')
      .mockReturnValue(goodsReceiptFixture(purchaseOrder));
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const toast = vi.spyOn(storeService, 'showToast').mockImplementation(() => undefined);
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });

    await component.postGoodsReceipt();

    expect(receiveGoods).toHaveBeenCalledTimes(1);
    expect(receiveGoods).toHaveBeenCalledWith({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-24',
      items: [
        {
          purchaseOrderItemId: purchaseOrder.items[0].id,
          receivedNowQuantity: 20,
        },
      ],
      notes: 'Delivery inspected.',
    });
    expect(toast).toHaveBeenCalledWith(expect.stringContaining('GRN-20260824-0001'), 'success');
    expect(navigate).toHaveBeenCalledWith([
      '/store-admin/purchasing/purchase-orders',
      purchaseOrder.id,
    ]);
  });

  it('preserves form values and displays a service failure without navigating', async () => {
    seedPurchaseOrder(purchaseOrderFixture());
    const { component, fixture, router, storeService } = createComponent();
    component.items.at(0).controls.receivedNowQuantity.setValue(20);
    vi.spyOn(TestBed.inject(GoodsReceiptService), 'receiveGoods').mockImplementation(() => {
      throw new Error('Inventory limit exceeded.');
    });
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(storeService, 'showToast').mockImplementation(() => undefined);

    await component.postGoodsReceipt();
    fixture.detectChanges();

    expect(component.submissionError()).toBe('Inventory limit exceeded.');
    expect(component.items.at(0).controls.receivedNowQuantity.value).toBe(20);
    expect(fixture.nativeElement.textContent).toContain('Inventory limit exceeded.');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('posts through the real service and updates PO, inventory, and GRN history only once', async () => {
    const purchaseOrder = purchaseOrderFixture({
      items: [purchaseOrderItemFixture({ quantity: 100, receivedQuantity: 40 })],
      status: 'partially_received',
    });
    seedPurchaseOrder(purchaseOrder);
    const { component, router, storeService } = createComponent();
    const inventory = TestBed.inject(InventoryService);
    const stockBefore = inventory.getBalance('store-001', 'prod-101', 'store').quantity;
    component.items.at(0).controls.receivedNowQuantity.setValue(20);
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    vi.spyOn(storeService, 'showToast').mockImplementation(() => undefined);

    await component.postGoodsReceipt();

    expect(
      TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)?.items[0]
        .receivedQuantity,
    ).toBe(60);
    expect(inventory.getBalance('store-001', 'prod-101', 'store').quantity).toBe(stockBefore + 20);
    expect(
      TestBed.inject(GoodsReceiptService).getGoodsReceiptsByPurchaseOrder(purchaseOrder.id),
    ).toHaveLength(1);
    expect(inventory.getTransactionsByStore('store-001')).toHaveLength(1);
  });

  it.each(['draft', 'received', 'cancelled'] as const)(
    'blocks the active form for a %s PO opened by direct URL',
    (status) => {
      seedPurchaseOrder(purchaseOrderFixture({ status }));
      const { component, fixture } = createComponent();

      expect(component.canReceivePurchaseOrder()).toBe(false);
      expect(component.items.length).toBe(0);
      expect(fixture.nativeElement.textContent).toContain('Purchase order cannot receive goods');
      expect(fixture.nativeElement.querySelector('form')).toBeNull();
    },
  );

  it('hides the active form immediately when the selected store changes', () => {
    seedPurchaseOrder(purchaseOrderFixture());
    const { component, fixture, storeService } = createComponent();
    expect(component.purchaseOrder()).toBeDefined();

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(component.purchaseOrder()).toBeUndefined();
    expect(component.hasStoreMismatch()).toBe(true);
    expect(fixture.nativeElement.textContent).toContain(
      'does not belong to the currently selected store',
    );
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });

  it('shows a not-found state for a missing route ID', () => {
    const { component, fixture } = createComponent('missing-po');

    expect(component.sourcePurchaseOrder()).toBeUndefined();
    expect(fixture.nativeElement.textContent).toContain('Purchase Order not found');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});

function createComponent(id = 'po-ordered'): {
  component: ReceiveGoods;
  fixture: ComponentFixture<ReceiveGoods>;
  router: Router;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [ReceiveGoods],
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
  const fixture = TestBed.createComponent(ReceiveGoods);
  fixture.detectChanges();
  return {
    component: fixture.componentInstance,
    fixture,
    router: TestBed.inject(Router),
    storeService,
  };
}

function seedPurchaseOrder(purchaseOrder: PurchaseOrder): void {
  localStorage.setItem(PURCHASE_ORDER_STORAGE_KEY, JSON.stringify([purchaseOrder]));
}

function purchaseOrderFixture(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  const items = overrides.items ?? [
    purchaseOrderItemFixture(),
    purchaseOrderItemFixture({
      id: 'po-item-002',
      productId: 'prod-102',
      productName: 'Slim Fit Denim Jeans',
      variantName: undefined,
      sku: 'FH-JNS-002',
      quantity: 30,
      receivedQuantity: 0,
      purchasePrice: 50,
    }),
  ];
  const subtotal = items.reduce((total, item) => total + item.lineTotal, 0);
  return {
    id: 'po-ordered',
    storeId: 'store-001',
    poNumber: 'PO-20260821-0001',
    supplierId: 101,
    supplierName: 'Tech Distribution Ltd.',
    receivingLocationId: 'store',
    receivingLocationName: 'DigiShop Main Store',
    receivingLocationType: 'store',
    orderDate: '2026-08-21',
    expectedDeliveryDate: '2026-08-28',
    items,
    subtotal,
    taxAmount: 0,
    discountAmount: 0,
    totalAmount: subtotal,
    status: 'ordered',
    createdAt: '2026-08-21T06:30:00.000Z',
    ...overrides,
  };
}

function purchaseOrderItemFixture(overrides: Partial<PurchaseOrderItem> = {}): PurchaseOrderItem {
  const quantity = overrides.quantity ?? 100;
  const purchasePrice = overrides.purchasePrice ?? 100;
  return {
    id: 'po-item-001',
    productId: 'prod-101',
    variantId: null,
    productName: 'Test Product',
    variantName: 'Blue / Large',
    sku: 'FH-JKT-001',
    quantity,
    receivedQuantity: 40,
    purchasePrice,
    lineTotal: quantity * purchasePrice,
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
        previouslyReceivedQuantity: item.receivedQuantity,
        receivedNowQuantity: 20,
        totalReceivedQuantity: item.receivedQuantity + 20,
        remainingQuantity: item.quantity - item.receivedQuantity - 20,
      },
    ],
    notes: 'Delivery inspected.',
    createdAt: '2026-08-24T08:00:00.000Z',
  };
}

function findButton(fixture: ComponentFixture<ReceiveGoods>, label: string): HTMLButtonElement {
  const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
  const button = buttons.find((candidate) =>
    (candidate.textContent ?? '').replace(/\s+/g, ' ').trim().includes(label),
  );
  if (!button) throw new Error(`Button "${label}" was not found.`);
  return button;
}
