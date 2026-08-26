import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';

import { SupplierInvoice } from '../models/supplier-invoice.model';
import { EditSupplierInvoice } from './edit-supplier-invoice';

describe('EditSupplierInvoice', () => {
  afterEach(() => { localStorage.clear(); TestBed.resetTestingModule(); });

  it('blocks a direct edit URL for a non-draft invoice', () => {
    localStorage.setItem('digishop_supplier_invoices_v1', JSON.stringify([invoiceFixture()]));
    TestBed.configureTestingModule({
      imports: [EditSupplierInvoice],
      providers: [
        provideHttpClient(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (name: string) => name === 'id' ? 'invoice-locked' : null } } } },
      ],
    });
    const fixture = TestBed.createComponent(EditSupplierInvoice);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Supplier invoice cannot be edited');
    expect(fixture.nativeElement.querySelector('form')).toBeNull();
  });
});

function invoiceFixture(): SupplierInvoice {
  return {
    id: 'invoice-locked', storeId: 'store-001', invoiceNumber: 'INV-LOCKED', supplierId: 101,
    supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-100', invoiceDate: '2026-08-25',
    items: [{ id: 'line-1', purchaseOrderItemId: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', invoicedQuantity: 2, unitPrice: 500, lineTotal: 1000 }],
    subtotal: 1000, taxAmount: 0, discountAmount: 0, totalAmount: 1000, paidAmount: 0,
    balanceAmount: 1000, status: 'pending_review', matchStatus: 'not_checked', createdAt: '2026-08-25T10:00:00.000Z',
  };
}
