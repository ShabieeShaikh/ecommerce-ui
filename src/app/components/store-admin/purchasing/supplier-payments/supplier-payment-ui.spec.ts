import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import Swal from 'sweetalert2';

import { StoreService } from '../../../../services/store.service';
import { SupplierInvoice } from '../supplier-invoices/models/supplier-invoice.model';
import { RecordSupplierPayment } from './record-supplier-payment/record-supplier-payment';
import { SupplierPaymentList } from './supplier-payment-list/supplier-payment-list';
import { ViewSupplierPayment } from './view-supplier-payment/view-supplier-payment';

describe('Supplier payment UI', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('renders current-store metrics and filters payment history', () => {
    localStorage.setItem('digishop_supplier_payments_v1', JSON.stringify([
      paymentFixture(),
      paymentFixture({ id: 'payment-2', paymentNumber: 'PAY-20260825-0002', supplierId: 202, supplierName: 'Second Supplier', paymentMethod: 'cash', amount: 250 }),
      paymentFixture({ id: 'other-store', paymentNumber: 'PAY-20260825-0003', storeId: 'store-002', amount: 999 }),
    ]));
    TestBed.configureTestingModule({ imports: [SupplierPaymentList], providers: [provideHttpClient(), provideRouter([])] });
    const fixture = TestBed.createComponent(SupplierPaymentList);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.payments()).toHaveLength(2);
    expect(component.totalAmountPaid()).toBe(1250);
    expect(component.suppliersPaid()).toBe(2);
    component.searchTerm.set('second');
    expect(component.filteredPayments().map((payment) => payment.id)).toEqual(['payment-2']);
    component.searchTerm.set('');
    component.methodFilter.set('bank_transfer');
    expect(component.filteredPayments().map((payment) => payment.id)).toEqual(['payment-1']);
    expect(fixture.nativeElement.textContent).toContain('Total Amount Paid');
  });

  it('preselects an eligible invoice, previews full payment, and records after confirmation', async () => {
    localStorage.setItem('digishop_supplier_invoices_v1', JSON.stringify([invoiceFixture()]));
    TestBed.configureTestingModule({
      imports: [RecordSupplierPayment],
      providers: [
        provideHttpClient(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: (name: string) => name === 'invoiceId' ? 'invoice-1' : null } } } },
      ],
    });
    const fixture = TestBed.createComponent(RecordSupplierPayment);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.selectedInvoice()?.id).toBe('invoice-1');
    component.payFullBalance();
    expect(component.form.controls.amount.value).toBe(1000);
    expect(component.isFullPayment()).toBe(true);
    component.form.controls.amount.setValue(1000.01);
    expect(component.amountExceedsBalance()).toBe(true);
    fixture.detectChanges();
    expect((fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    component.form.controls.amount.setValue(400);
    vi.spyOn(Swal, 'fire').mockResolvedValue({ isConfirmed: true } as never);
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await component.submit();
    expect(Swal.fire).toHaveBeenCalled();
    expect(vi.mocked(Swal.fire).mock.calls[0][0]).toEqual(expect.objectContaining({ html: expect.stringContaining('does not change inventory') }));
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/supplier-payments', expect.any(String)]);
    const updated = JSON.parse(localStorage.getItem('digishop_supplier_invoices_v1') ?? '[]')[0];
    expect(updated).toEqual(expect.objectContaining({ paidAmount: 400, balanceAmount: 600, status: 'partially_paid' }));
  });

  it('excludes non-payable invoices and resets stale payment data after a store switch', () => {
    localStorage.setItem('digishop_supplier_invoices_v1', JSON.stringify([
      invoiceFixture(),
      { ...invoiceFixture(), id: 'paid', invoiceNumber: 'INV-PAID', status: 'paid', paidAmount: 1000, balanceAmount: 0 },
      { ...invoiceFixture(), id: 'draft', invoiceNumber: 'INV-DRAFT', status: 'draft' },
      { ...invoiceFixture(), id: 'pending', invoiceNumber: 'INV-PENDING', status: 'pending_review' },
      { ...invoiceFixture(), id: 'cancelled', invoiceNumber: 'INV-CANCELLED', status: 'cancelled' },
    ]));
    TestBed.configureTestingModule({
      imports: [RecordSupplierPayment],
      providers: [provideHttpClient(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: () => null } } } }],
    });
    const fixture = TestBed.createComponent(RecordSupplierPayment);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    expect(component.eligibleInvoices().map((invoice) => invoice.id)).toEqual(['invoice-1']);
    component.form.patchValue({ supplierInvoiceId: 'invoice-1', amount: 300 });
    TestBed.inject(StoreService).changeSelectedStore('store-002', false);
    fixture.detectChanges();
    expect(component.form.controls.supplierInvoiceId.value).toBe('');
    expect(component.form.controls.amount.value).toBe(0);
    expect(component.contextMessage()).toContain('selected store changed');
  });

  it('keeps payment details isolated to the selected store and links to the invoice', () => {
    localStorage.setItem('digishop_supplier_payments_v1', JSON.stringify([paymentFixture()]));
    TestBed.configureTestingModule({
      imports: [ViewSupplierPayment],
      providers: [
        provideHttpClient(), provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (name: string) => name === 'id' ? 'payment-1' : null } } } },
      ],
    });
    const fixture = TestBed.createComponent(ViewSupplierPayment);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('PAY-20260825-0001');
    expect(fixture.nativeElement.textContent).toContain('Posted');
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.componentInstance.viewInvoice();
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/supplier-invoices', 'invoice-1']);
  });
});

function invoiceFixture(): SupplierInvoice {
  return {
    id: 'invoice-1', storeId: 'store-001', invoiceNumber: 'INV-100', supplierId: 101,
    supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-100',
    invoiceDate: '2026-08-20', items: [{ id: 'line-1', purchaseOrderItemId: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', invoicedQuantity: 1, unitPrice: 1000, lineTotal: 1000 }], subtotal: 1000, taxAmount: 0, discountAmount: 0,
    totalAmount: 1000, paidAmount: 0, balanceAmount: 1000, status: 'approved',
    matchStatus: 'matched', matchCheckedAt: '2026-08-20T10:00:00.000Z', createdAt: '2026-08-20T09:00:00.000Z',
  };
}

function paymentFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payment-1', paymentNumber: 'PAY-20260825-0001', storeId: 'store-001', supplierId: 101,
    supplierName: 'ABC Distributors', supplierInvoiceId: 'invoice-1', invoiceNumber: 'INV-100',
    paymentDate: '2026-08-25', amount: 1000, paymentMethod: 'bank_transfer', referenceNumber: 'TXN-100',
    createdAt: '2026-08-25T10:00:00.000Z', ...overrides,
  };
}
