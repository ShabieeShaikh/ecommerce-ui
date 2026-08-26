import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { PurchaseOrder } from '../../purchase-orders/models/purchase-order.model';
import { CreateSupplierInvoice } from './create-supplier-invoice';

describe('CreateSupplierInvoice', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('digishop_purchase_orders', JSON.stringify([
      purchaseOrderFixture(),
      purchaseOrderFixture({ id: 'po-draft', poNumber: 'PO-DRAFT', status: 'draft' }),
      purchaseOrderFixture({ id: 'po-cancelled', poNumber: 'PO-CANCELLED', status: 'cancelled' }),
      purchaseOrderFixture({ id: 'po-other', poNumber: 'PO-OTHER', storeId: 'store-002' }),
    ]));
  });
  afterEach(() => { localStorage.clear(); TestBed.resetTestingModule(); });

  it('offers only eligible current-store POs and derives supplier and PO lines', () => {
    const component = createComponent();
    expect(component.eligiblePurchaseOrders().map((order) => order.id)).toEqual(['po-eligible']);
    component.form.controls.purchaseOrderId.setValue('po-eligible');
    component.onPurchaseOrderChange();
    expect(component.selectedPurchaseOrder()?.supplierName).toBe('ABC Distributors');
    expect(component.items.length).toBe(1);
    expect(component.itemContext(0)?.receivedQuantity).toBe(3);
  });

  it('allows billed quantity and price differences and calculates live totals', () => {
    const component = createComponent();
    component.form.controls.purchaseOrderId.setValue('po-eligible');
    component.onPurchaseOrderChange();
    component.items.at(0).patchValue({ invoicedQuantity: 10, unitPrice: 110 });
    component.form.patchValue({ taxAmount: 25, discountAmount: 5 });
    expect(component.subtotal()).toBe(1100);
    expect(component.total()).toBe(1120);
  });

  it('rejects a due date before the invoice date and invalid item values', () => {
    const component = createComponent();
    component.form.controls.purchaseOrderId.setValue('po-eligible');
    component.onPurchaseOrderChange();
    component.form.patchValue({ invoiceDate: '2026-08-25', dueDate: '2026-08-24' });
    component.items.at(0).patchValue({ invoicedQuantity: 0, unitPrice: -1 });
    expect(component.form.hasError('dueBeforeInvoice')).toBe(true);
    expect(component.items.at(0).controls.invoicedQuantity.hasError('min')).toBe(true);
    expect(component.items.at(0).controls.unitPrice.hasError('min')).toBe(true);
  });
});

function createComponent(): CreateSupplierInvoice {
  TestBed.configureTestingModule({ imports: [CreateSupplierInvoice], providers: [provideHttpClient(), provideRouter([])] });
  const fixture = TestBed.createComponent(CreateSupplierInvoice);
  fixture.detectChanges();
  return fixture.componentInstance;
}

function purchaseOrderFixture(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
  return {
    id: 'po-eligible', storeId: 'store-001', poNumber: 'PO-100', supplierId: 101,
    supplierName: 'ABC Distributors', receivingLocationId: 'warehouse:warehouse-001',
    receivingLocationName: 'Main Warehouse', receivingLocationType: 'warehouse', orderDate: '2026-08-20',
    items: [{ id: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', quantity: 10, receivedQuantity: 3, purchasePrice: 100, lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 0, discountAmount: 0, totalAmount: 1000,
    status: 'ordered', createdAt: '2026-08-20T10:00:00.000Z', ...overrides,
  };
}
