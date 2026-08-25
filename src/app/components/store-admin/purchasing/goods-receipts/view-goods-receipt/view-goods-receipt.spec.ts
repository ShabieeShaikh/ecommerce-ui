import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';

import { StoreService } from '../../../../../services/store.service';
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
