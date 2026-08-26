import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import type { Store } from '../../../../models/admin.models';
import { GoodsReceiptService } from '../../../../services/goods-receipt.service';
import { PurchaseOrderService } from '../../../../services/purchase-order.service';
import { PurchaseReturnService } from '../../../../services/purchase-return.service';
import { SupplierInvoiceService } from '../../../../services/supplier-invoice.service';
import { SupplierPaymentService } from '../../../../services/supplier-payment.service';
import { SupplierService } from '../../../../services/supplier.service';
import { StoreService } from '../../../../services/store.service';
import { PurchasingReports } from './purchasing-reports';

describe('PurchasingReports', () => {
  const selectedStoreId = signal('store-1');
  const stores = [store('store-1', 'Digital Store'), store('store-2', 'Outlet Store')];

  beforeEach(() => {
    selectedStoreId.set('store-1');
    TestBed.configureTestingModule({
      imports: [PurchasingReports],
      providers: [
        provideRouter([]),
        {
          provide: StoreService,
          useValue: {
            selectedStoreId: selectedStoreId.asReadonly(),
            selectedStore: computed(() => stores.find((item) => item.id === selectedStoreId()) ?? stores[0]),
          },
        },
        {
          provide: SupplierService,
          useValue: {
            getSuppliersByStore: (storeId: string) =>
              storeId === 'store-1'
                ? [{ id: 1, storeId, supplierCode: 'SUP-1', name: 'Alpha', phone: '1', status: 'active', createdAt: '2026-01-01' }]
                : [{ id: 2, storeId, supplierCode: 'SUP-2', name: 'Beta', phone: '2', status: 'active', createdAt: '2026-01-01' }],
          },
        },
        { provide: PurchaseOrderService, useValue: { getPurchaseOrdersByStore: () => [] } },
        { provide: GoodsReceiptService, useValue: { getGoodsReceiptsByStore: () => [] } },
        { provide: SupplierInvoiceService, useValue: { getSupplierInvoicesByStore: () => [] } },
        { provide: SupplierPaymentService, useValue: { getSupplierPaymentsByStore: () => [] } },
        { provide: PurchaseReturnService, useValue: { getPurchaseReturnsByStore: () => [] } },
      ],
    });
  });

  it('renders selected-store context and a clean empty report state', () => {
    const fixture = TestBed.createComponent(PurchasingReports);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Purchasing Reports');
    expect(text).toContain('Digital Store');
    expect(text).toContain('No purchasing activity for this store yet');
    expect(fixture.componentInstance.filters().preset).toBe('this_month');
  });

  it('resets all report filters to the default range and all statuses', () => {
    const fixture = TestBed.createComponent(PurchasingReports);
    const component = fixture.componentInstance;
    component.filters.update((value) => ({
      ...value,
      preset: 'custom',
      fromDate: '2025-01-01',
      toDate: '2025-01-31',
      supplierId: 1,
      purchaseOrderStatus: 'received',
      invoiceStatus: 'paid',
    }));

    component.resetFilters();

    expect(component.filters()).toEqual(expect.objectContaining({
      preset: 'this_month',
      supplierId: null,
      purchaseOrderStatus: 'all',
      invoiceStatus: 'all',
    }));
  });

  it('clears a supplier filter that does not belong to the newly selected store', () => {
    const fixture = TestBed.createComponent(PurchasingReports);
    fixture.componentInstance.filters.update((value) => ({ ...value, supplierId: 1 }));
    fixture.detectChanges();

    selectedStoreId.set('store-2');
    fixture.detectChanges();
    TestBed.flushEffects();

    expect(fixture.componentInstance.filters().supplierId).toBeNull();
    expect(fixture.componentInstance.suppliers().map((supplier) => supplier.id)).toEqual([2]);
  });
});

function store(id: string, name: string): Store {
  return {
    id,
    name,
    category: 'General',
    status: 'active',
    owner: 'Owner',
    email: 'store@example.com',
    phone: '1',
    city: 'City',
    country: 'Country',
    revenue: 0,
    orders: 0,
    visitors: 0,
    rating: 5,
    createdAt: 'Jan 01, 2026',
    accentColor: '#7c3aed',
    inventoryAllocationLimit: 1000,
  };
}
