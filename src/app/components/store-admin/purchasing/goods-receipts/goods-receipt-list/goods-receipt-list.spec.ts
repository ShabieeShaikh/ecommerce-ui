import { provideHttpClient } from '@angular/common/http';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';

import { GoodsReceipt } from '../models/goods-receipt.model';
import { GoodsReceiptList } from './goods-receipt-list';

const RECEIPTS_KEY = 'digishop_goods_receipts_v1';

describe('GoodsReceiptList', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      RECEIPTS_KEY,
      JSON.stringify([
        receiptFixture(),
        receiptFixture({
          id: 'grn-store-2',
          grnNumber: 'GRN-20260824-0002',
          storeId: 'store-002',
          supplierName: 'Other Store Supplier',
        }),
      ]),
    );
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('shows only selected-store receipts and calculates accurate summaries', () => {
    const { component } = createComponent();

    expect(component.receipts().map((receipt) => receipt.id)).toEqual(['grn-1']);
    expect(component.totalUnitsReceived()).toBe(30);
    expect(component.distinctPurchaseOrders()).toBe(1);
  });

  it('searches snapshots and filters by receiving location', () => {
    const { component } = createComponent();

    component.searchTerm.set('phone');
    expect(component.filteredReceipts()).toHaveLength(1);
    component.searchTerm.set('missing');
    expect(component.filteredReceipts()).toHaveLength(0);
    component.searchTerm.set('');
    component.locationFilter.set('warehouse:warehouse-001');
    expect(component.filteredReceipts()).toHaveLength(1);
    component.locationFilter.set('store:store-001');
    expect(component.filteredReceipts()).toHaveLength(0);
  });

  it('navigates to GRN details without changing inventory persistence', () => {
    const { component, router } = createComponent();
    const navigate = vi.spyOn(router, 'navigate');
    const balancesBefore = localStorage.getItem('digishop_inventory_balances_v1');
    const transactionsBefore = localStorage.getItem('digishop_inventory_transactions_v1');

    component.viewReceipt('grn-1');

    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/goods-receipts', 'grn-1']);
    expect(localStorage.getItem('digishop_inventory_balances_v1')).toBe(balancesBefore);
    expect(localStorage.getItem('digishop_inventory_transactions_v1')).toBe(transactionsBefore);
  });
});

function createComponent(): {
  component: GoodsReceiptList;
  fixture: ComponentFixture<GoodsReceiptList>;
  router: Router;
} {
  TestBed.configureTestingModule({
    imports: [GoodsReceiptList],
    providers: [provideHttpClient(), provideRouter([])],
  });
  const fixture = TestBed.createComponent(GoodsReceiptList);
  fixture.detectChanges();
  return { component: fixture.componentInstance, fixture, router: TestBed.inject(Router) };
}

function receiptFixture(overrides: Partial<GoodsReceipt> = {}): GoodsReceipt {
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
        previouslyReceivedQuantity: 0,
        receivedNowQuantity: 30,
        totalReceivedQuantity: 30,
        remainingQuantity: 20,
      },
    ],
    notes: 'Received in good condition.',
    createdAt: '2026-08-24T10:00:00.000Z',
    ...overrides,
  };
}
