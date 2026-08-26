import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { SupplierInvoice } from '../models/supplier-invoice.model';
import { SupplierInvoiceList } from './supplier-invoice-list';

describe('SupplierInvoiceList', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('digishop_supplier_invoices_v1', JSON.stringify([
      invoiceFixture(),
      invoiceFixture({ id: 'invoice-2', invoiceNumber: 'VENDOR-200', status: 'pending_review' }),
      invoiceFixture({ id: 'other-store', storeId: 'store-002', supplierName: 'Hidden Supplier' }),
    ]));
  });
  afterEach(() => { localStorage.clear(); TestBed.resetTestingModule(); });

  it('isolates the selected store and calculates summaries from stored values', () => {
    const component = createComponent();
    expect(component.invoices().map((item) => item.id)).toEqual(['invoice-1', 'invoice-2']);
    expect(component.draftCount()).toBe(1);
    expect(component.pendingCount()).toBe(1);
    expect(component.outstandingBalance()).toBe(2200);
  });

  it('searches invoice, PO and supplier snapshots and applies status and match filters', () => {
    const component = createComponent();
    component.searchTerm.set('vendor-200');
    expect(component.filteredInvoices().map((item) => item.id)).toEqual(['invoice-2']);
    component.searchTerm.set('abc distributors');
    expect(component.filteredInvoices()).toHaveLength(2);
    component.searchTerm.set('');
    component.statusFilter.set('draft');
    component.matchFilter.set('not_checked');
    expect(component.filteredInvoices().map((item) => item.id)).toEqual(['invoice-1']);
  });
});

function createComponent(): SupplierInvoiceList {
  TestBed.configureTestingModule({ imports: [SupplierInvoiceList], providers: [provideHttpClient(), provideRouter([])] });
  const fixture = TestBed.createComponent(SupplierInvoiceList);
  fixture.detectChanges();
  return fixture.componentInstance;
}

function invoiceFixture(overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return {
    id: 'invoice-1', storeId: 'store-001', invoiceNumber: 'INV-100', supplierId: 101,
    supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-100',
    invoiceDate: '2026-08-25', dueDate: '2026-09-25',
    items: [{ id: 'line-1', purchaseOrderItemId: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', invoicedQuantity: 2, unitPrice: 500, lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 100, discountAmount: 0, totalAmount: 1100,
    paidAmount: 0, balanceAmount: 1100, status: 'draft', matchStatus: 'not_checked', createdAt: '2026-08-25T10:00:00.000Z',
    ...overrides,
  };
}
