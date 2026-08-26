import { provideHttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { GoodsReceiptService } from '../../../../../services/goods-receipt.service';
import { InventoryService } from '../../../../../services/inventory.service';
import { PurchaseReturnService } from '../../../../../services/purchase-return.service';
import { StoreService } from '../../../../../services/store.service';
import { PurchaseReturn } from '../../purchase-returns/models/purchase-return.model';
import { GoodsReceipt } from '../models/goods-receipt.model';
import { ViewGoodsReceipt } from './view-goods-receipt';

describe('ViewGoodsReceipt', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('digishop_goods_receipts_v1', JSON.stringify([receiptFixture()]));
    localStorage.setItem(
      'digishop_inventory_transactions_v1',
      JSON.stringify([
        transactionFixture(),
        transactionFixture({ id: 'tx-other', goodsReceiptId: 'grn-other' }),
      ]),
    );
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders immutable quantity snapshots and reliably linked inventory movements', () => {
    const { component, fixture } = createComponent('grn-1');
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(component.receipt()?.grnNumber).toBe('GRN-20260824-0001');
    expect(component.totalUnits()).toBe(30);
    expect(component.inventoryMovements().map((movement) => movement.id)).toEqual(['tx-1']);
    expect(text).toContain('Previously Received');
    expect(text).toContain('+30');
    expect(text).toContain('40 / 50');
    expect(text).toContain('10');
    expect(text).not.toContain('Edit GRN');
    expect(text).not.toContain('Delete GRN');
  });

  it('does not expose a receipt after switching to another store', () => {
    const { component, fixture } = createComponent('grn-1');

    TestBed.inject(StoreService).changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(component.receipt()).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Goods Receipt not found');
  });

  it('handles an invalid route id without crashing', () => {
    const { component, fixture } = createComponent('missing');

    expect(component.receipt()).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Goods Receipt not found');
  });

  it('shows return history separately and opens Create Return with the GRN preselected', () => {
    TestBed.configureTestingModule({
      imports: [ViewGoodsReceipt],
      providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: 'grn-1' }) } } },
        { provide: StoreService, useValue: { selectedStoreId: signal('store-001') } },
        { provide: GoodsReceiptService, useValue: { getGoodsReceiptById: () => receiptFixture() } },
        { provide: InventoryService, useValue: { getTransactionsByStore: () => [], getBalance: () => ({ availableQuantity: 30 }) } },
        { provide: PurchaseReturnService, useValue: { getPurchaseReturnsByGoodsReceipt: () => [purchaseReturnFixture()], getRemainingReturnableQuantity: () => 25 } },
      ],
    });
    const fixture = TestBed.createComponent(ViewGoodsReceipt); fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Purchase Return History');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('PR-20260825-0001');
    expect(fixture.componentInstance.totalUnits()).toBe(30);
    expect(fixture.componentInstance.totalReturned()).toBe(5);
    const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.return-btn')?.click();
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/purchase-returns/add'], { queryParams: { goodsReceiptId: 'grn-1' } });
  });
});

function createComponent(id: string): {
  component: ViewGoodsReceipt;
  fixture: ComponentFixture<ViewGoodsReceipt>;
} {
  TestBed.configureTestingModule({
    imports: [ViewGoodsReceipt],
    providers: [
      provideHttpClient(),
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { paramMap: convertToParamMap({ id }) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(ViewGoodsReceipt);
  fixture.detectChanges();
  return { component: fixture.componentInstance, fixture };
}

function receiptFixture(): GoodsReceipt {
  return {
    id: 'grn-1',
    grnNumber: 'GRN-20260824-0001',
    purchaseOrderId: 'po-1',
    poNumber: 'PO-20260820-0001',
    storeId: 'store-001',
    supplierId: 101,
    supplierName: 'Tech Distribution Ltd.',
    receivingLocationId: 'warehouse:warehouse-001',
    receivingLocationName: 'Main Warehouse',
    receivingLocationType: 'warehouse',
    receivedDate: '2026-08-24',
    items: [
      {
        id: 'grn-item-1',
        purchaseOrderItemId: 'po-item-1',
        inventoryTransactionId: 'tx-1',
        productId: 'product-1',
        variantId: null,
        productName: 'Phone',
        sku: 'PHONE-001',
        orderedQuantity: 50,
        previouslyReceivedQuantity: 10,
        receivedNowQuantity: 30,
        totalReceivedQuantity: 40,
        remainingQuantity: 10,
      },
    ],
    createdAt: '2026-08-24T10:00:00.000Z',
  };
}

function transactionFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'tx-1',
    storeId: 'store-001',
    productId: 'product-1',
    variantId: null,
    type: 'receive',
    quantity: 30,
    unitCost: 100,
    sourceLocationKey: null,
    destinationLocationKey: 'warehouse:warehouse-001',
    sourceBeforeQuantity: null,
    sourceAfterQuantity: null,
    destinationBeforeQuantity: 10,
    destinationAfterQuantity: 40,
    referenceNumber: 'GRN-20260824-0001',
    goodsReceiptId: 'grn-1',
    purchaseOrderId: 'po-1',
    purchaseOrderNumber: 'PO-20260820-0001',
    supplierName: 'Tech Distribution Ltd.',
    reason: 'Purchase order receipt',
    note: 'Received stock.',
    occurredAt: '2026-08-24',
    createdBy: 'Store Admin',
    createdAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}

function purchaseReturnFixture(): PurchaseReturn {
  return { id: 'return-1', returnNumber: 'PR-20260825-0001', storeId: 'store-001', supplierId: 101, supplierName: 'Tech Distribution Ltd.', purchaseOrderId: 'po-1', poNumber: 'PO-20260820-0001', goodsReceiptId: 'grn-1', grnNumber: 'GRN-20260824-0001', returnLocationId: 'warehouse:warehouse-001', returnLocationName: 'Main Warehouse', returnLocationType: 'warehouse', returnDate: '2026-08-25', reason: 'defective', items: [{ id: 'return-item-1', goodsReceiptItemId: 'grn-item-1', inventoryTransactionId: 'return-tx-1', purchaseOrderItemId: 'po-item-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-001', receivedQuantity: 30, previouslyReturnedQuantity: 0, returnNowQuantity: 5, totalReturnedQuantity: 5, remainingReturnableQuantity: 25 }], createdAt: '2026-08-25T10:00:00.000Z' };
}
