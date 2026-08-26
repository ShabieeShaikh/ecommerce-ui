import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import Swal from 'sweetalert2';

import { GoodsReceiptService } from '../../../../services/goods-receipt.service';
import { InventoryService } from '../../../../services/inventory.service';
import { PurchaseReturnService } from '../../../../services/purchase-return.service';
import { StoreService } from '../../../../services/store.service';
import { GoodsReceipt } from '../goods-receipts/models/goods-receipt.model';
import { PurchaseReturn } from './models/purchase-return.model';
import { CreatePurchaseReturn } from './create-purchase-return/create-purchase-return';
import { PurchaseReturnList } from './purchase-return-list/purchase-return-list';
import { ViewPurchaseReturn } from './view-purchase-return/view-purchase-return';

describe('Purchase Return UI', () => {
  afterEach(() => { vi.restoreAllMocks(); TestBed.resetTestingModule(); });

  it('shows selected-store metrics and filters by search, reason, supplier, and location', () => {
    const selectedStoreId = signal('store-001');
    const values = [returnFixture(), returnFixture({ id: 'return-2', returnNumber: 'PR-002', goodsReceiptId: 'grn-2', grnNumber: 'GRN-002', purchaseOrderId: 'po-2', poNumber: 'PO-002', supplierId: 202, supplierName: 'Other Supplier', reason: 'damaged', returnLocationId: 'store', returnLocationName: 'Main Store' }), returnFixture({ id: 'cross-store', storeId: 'store-002', returnNumber: 'PR-CROSS' })];
    TestBed.configureTestingModule({
      imports: [PurchaseReturnList], providers: [provideRouter([]),
        { provide: StoreService, useValue: { selectedStoreId } },
        { provide: PurchaseReturnService, useValue: { getPurchaseReturnsByStore: (storeId: string) => values.filter((item) => item.storeId === storeId) } },
      ],
    });
    const fixture = TestBed.createComponent(PurchaseReturnList); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.returns()).toHaveLength(2);
    expect(component.unitsReturned()).toBe(10);
    for (const query of ['PR-001', 'GRN-001', 'PO-001', 'ABC Distributors']) {
      component.searchTerm.set(query); expect(component.filteredReturns().map((item) => item.id)).toEqual(['return-1']);
    }
    component.searchTerm.set(''); component.reasonFilter.set('damaged'); expect(component.filteredReturns().map((item) => item.id)).toEqual(['return-2']);
    component.reasonFilter.set('all'); component.supplierFilter.set('101'); component.locationFilter.set('warehouse:one');
    expect(component.filteredReturns().map((item) => item.id)).toEqual(['return-1']);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('PR-CROSS');
  });

  it('preselects a GRN, displays both quantity limits, validates input, and posts through the return service only', async () => {
    const receipt = receiptFixture();
    const selectedStoreId = signal('store-001');
    const createPurchaseReturn = vi.fn().mockReturnValue(returnFixture());
    const showToast = vi.fn();
    TestBed.configureTestingModule({
      imports: [CreatePurchaseReturn], providers: [provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ goodsReceiptId: receipt.id }) } } },
        { provide: StoreService, useValue: { selectedStoreId, showToast } },
        { provide: GoodsReceiptService, useValue: { getGoodsReceiptById: (id: string) => id === receipt.id ? receipt : undefined, getGoodsReceiptsByStore: () => [receipt] } },
        { provide: PurchaseReturnService, useValue: { getPreviouslyReturnedQuantity: () => 20, getRemainingReturnableQuantity: () => 80, createPurchaseReturn } },
        { provide: InventoryService, useValue: { getBalance: () => ({ availableQuantity: 30 }) } },
      ],
    });
    const fixture = TestBed.createComponent(CreatePurchaseReturn); fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.selectedReceipt()?.supplierName).toBe('ABC Distributors');
    expect(component.previouslyReturned(receipt.items[0])).toBe(20);
    expect(component.remainingReturnable(receipt, receipt.items[0])).toBe(80);
    expect(component.currentAvailable(receipt, receipt.items[0])).toBe(30);
    expect(component.maximumReturn(receipt, receipt.items[0])).toBe(30);
    component.form.controls.items.at(0).controls.returnNowQuantity.setValue(31);
    expect(component.quantityError(0)).toContain('available stock of 30');
    expect(component.canSubmit()).toBe(false);
    component.form.controls.items.at(0).controls.returnNowQuantity.setValue(5);
    expect(component.expectedAvailableAfter(receipt, receipt.items[0])).toBe(25);
    vi.spyOn(Swal, 'fire').mockResolvedValue({ isConfirmed: true } as never);
    const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await component.submit();
    expect(createPurchaseReturn).toHaveBeenCalledWith({ goodsReceiptId: receipt.id, returnDate: component.form.controls.returnDate.value, reason: 'defective', items: [{ goodsReceiptItemId: 'grn-item-1', returnNowQuantity: 5 }], notes: undefined });
    expect(vi.mocked(Swal.fire).mock.calls[0][0]).toEqual(expect.objectContaining({ html: expect.stringContaining('original GRN remains unchanged') }));
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/purchase-returns', 'return-1']);
  });

  it('resets stale GRN and item quantities when the selected store changes', () => {
    const receipt = receiptFixture(); const selectedStoreId = signal('store-001');
    TestBed.configureTestingModule({ imports: [CreatePurchaseReturn], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ goodsReceiptId: receipt.id }) } } },
      { provide: StoreService, useValue: { selectedStoreId, showToast: vi.fn() } },
      { provide: GoodsReceiptService, useValue: { getGoodsReceiptById: () => receipt, getGoodsReceiptsByStore: (storeId: string) => storeId === 'store-001' ? [receipt] : [] } },
      { provide: PurchaseReturnService, useValue: { getPreviouslyReturnedQuantity: () => 0, getRemainingReturnableQuantity: () => 100 } },
      { provide: InventoryService, useValue: { getBalance: () => ({ availableQuantity: 100 }) } },
    ] });
    const fixture = TestBed.createComponent(CreatePurchaseReturn); fixture.detectChanges();
    fixture.componentInstance.form.controls.items.at(0).controls.returnNowQuantity.setValue(10);
    selectedStoreId.set('store-002'); fixture.detectChanges(); TestBed.flushEffects();
    expect(fixture.componentInstance.selectedReceipt()).toBeUndefined();
    expect(fixture.componentInstance.form.controls.items.length).toBe(0);
    expect(fixture.componentInstance.contextMessage()).toContain('selected store changed');
  });

  it('renders immutable return details and links to the structured inventory transaction, GRN, and PO', () => {
    const item = returnFixture(); const selectedStoreId = signal('store-001');
    TestBed.configureTestingModule({ imports: [ViewPurchaseReturn], providers: [provideRouter([]),
      { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id: item.id }) } } },
      { provide: StoreService, useValue: { selectedStoreId } },
      { provide: PurchaseReturnService, useValue: { getPurchaseReturnById: () => item } },
      { provide: InventoryService, useValue: { getTransactionsByStore: () => [{ id: 'tx-return', purchaseReturnId: item.id, referenceNumber: item.returnNumber, quantity: -5, occurredAt: item.returnDate }] } },
    ] });
    const fixture = TestBed.createComponent(ViewPurchaseReturn); fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('PR-001'); expect(text).toContain('ABC Distributors'); expect(text).toContain('Inventory Impact');
    expect(text).not.toContain('Edit Return'); expect(text).not.toContain('Delete Return');
    const router = TestBed.inject(Router); const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.viewReceipt(); expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/goods-receipts', 'grn-1']);
    fixture.componentInstance.viewPurchaseOrder(); expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/purchase-orders', 'po-1']);
    selectedStoreId.set('store-002'); fixture.detectChanges(); expect(fixture.componentInstance.purchaseReturn()).toBeUndefined();
  });
});

function receiptFixture(): GoodsReceipt {
  return { id: 'grn-1', grnNumber: 'GRN-001', purchaseOrderId: 'po-1', poNumber: 'PO-001', storeId: 'store-001', supplierId: 101, supplierName: 'ABC Distributors', receivingLocationId: 'warehouse:one', receivingLocationName: 'Karachi Warehouse', receivingLocationType: 'warehouse', receivedDate: '2026-08-20', items: [{ id: 'grn-item-1', purchaseOrderItemId: 'po-item-1', inventoryTransactionId: 'tx-receive', productId: 'prod-101', variantId: null, productName: 'Phone', sku: 'PHONE-1', orderedQuantity: 100, previouslyReceivedQuantity: 0, receivedNowQuantity: 100, totalReceivedQuantity: 100, remainingQuantity: 0 }], createdAt: '2026-08-20T10:00:00.000Z' };
}

function returnFixture(overrides: Partial<PurchaseReturn> = {}): PurchaseReturn {
  return { id: 'return-1', returnNumber: 'PR-001', storeId: 'store-001', supplierId: 101, supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-001', goodsReceiptId: 'grn-1', grnNumber: 'GRN-001', returnLocationId: 'warehouse:one', returnLocationName: 'Karachi Warehouse', returnLocationType: 'warehouse', returnDate: '2026-08-25', reason: 'defective', items: [{ id: 'return-item-1', goodsReceiptItemId: 'grn-item-1', inventoryTransactionId: 'tx-return', purchaseOrderItemId: 'po-item-1', productId: 'prod-101', variantId: null, productName: 'Phone', sku: 'PHONE-1', receivedQuantity: 100, previouslyReturnedQuantity: 0, returnNowQuantity: 5, totalReturnedQuantity: 5, remainingReturnableQuantity: 95 }], createdAt: '2026-08-25T10:00:00.000Z', ...overrides };
}
