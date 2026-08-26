import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';

import { GoodsReceipt } from '../../goods-receipts/models/goods-receipt.model';
import { PurchaseOrder } from '../../purchase-orders/models/purchase-order.model';
import { SupplierInvoice } from '../models/supplier-invoice.model';
import { ViewSupplierInvoice } from './view-supplier-invoice';

describe('ViewSupplierInvoice matching UI', () => {
  afterEach(() => { localStorage.clear(); TestBed.resetTestingModule(); });

  it('shows item comparisons, checked time, and approval for a matched pending invoice', () => {
    const fixture = createView('matched');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Three-Way Match');
    expect(text).toContain('Previously Invoiced');
    expect(text).toContain('Quantity matched');
    expect(text).toContain('No matching issues found');
    expect(fixture.nativeElement.querySelector('.approve-btn')).not.toBeNull();
  });

  it('shows issues and a visible approval block for a mismatch', () => {
    const fixture = createView('mismatch', 120);
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('invoiced beyond the remaining received quantity');
    expect(text).toContain('Invoice cannot be approved until matching issues are resolved');
    expect(fixture.nativeElement.querySelector('.approve-btn')).toBeNull();
  });

  it('shows the record-payment action and immutable payment history for a payable invoice', () => {
    const fixture = createView('matched', 100, { status: 'partially_paid', paidAmount: 25000, balanceAmount: 75000 }, [{
      id: 'payment-1', paymentNumber: 'PAY-20260825-0001', storeId: 'store-001', supplierId: 101,
      supplierName: 'ABC Distributors', supplierInvoiceId: 'invoice-1', invoiceNumber: 'INV-100',
      paymentDate: '2026-08-25', amount: 25000, paymentMethod: 'bank_transfer', createdAt: '2026-08-25T10:00:00.000Z',
    }]);
    expect(fixture.nativeElement.querySelector('.payment-btn')).not.toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Payment History');
    expect(fixture.nativeElement.textContent).toContain('PAY-20260825-0001');
    expect(fixture.nativeElement.querySelector('.history-warning')).toBeNull();
    const router = TestBed.inject(Router);
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    (fixture.nativeElement.querySelector('.payment-btn') as HTMLButtonElement).click();
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/supplier-payments/add'], { queryParams: { invoiceId: 'invoice-1' } });
  });
});

function createView(matchStatus: SupplierInvoice['matchStatus'], quantity = 100, overrides: Partial<SupplierInvoice> = {}, payments: object[] = []) {
  localStorage.clear();
  localStorage.setItem('digishop_purchase_orders', JSON.stringify([purchaseOrderFixture()]));
  localStorage.setItem('digishop_goods_receipts_v1', JSON.stringify([receiptFixture()]));
  localStorage.setItem('digishop_supplier_invoices_v1', JSON.stringify([invoiceFixture(matchStatus, quantity, overrides)]));
  localStorage.setItem('digishop_supplier_payments_v1', JSON.stringify(payments));
  TestBed.configureTestingModule({
    imports: [ViewSupplierInvoice],
    providers: [provideHttpClient(), provideRouter([]), { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (name: string) => name === 'id' ? 'invoice-1' : null } } } }],
  });
  const fixture = TestBed.createComponent(ViewSupplierInvoice);
  fixture.detectChanges();
  return fixture;
}
function purchaseOrderFixture(): PurchaseOrder {
  return { id: 'po-1', storeId: 'store-001', poNumber: 'PO-100', supplierId: 101, supplierName: 'ABC Distributors', receivingLocationId: 'warehouse:warehouse-001', receivingLocationName: 'Main Warehouse', receivingLocationType: 'warehouse', orderDate: '2026-08-20', items: [{ id: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', quantity: 100, receivedQuantity: 100, purchasePrice: 1000, lineTotal: 100000 }], subtotal: 100000, taxAmount: 0, discountAmount: 0, totalAmount: 100000, status: 'received', createdAt: '2026-08-20T08:00:00.000Z' };
}
function invoiceFixture(matchStatus: SupplierInvoice['matchStatus'], quantity: number, overrides: Partial<SupplierInvoice> = {}): SupplierInvoice {
  return { id: 'invoice-1', storeId: 'store-001', invoiceNumber: 'INV-100', supplierId: 101, supplierName: 'ABC Distributors', purchaseOrderId: 'po-1', poNumber: 'PO-100', invoiceDate: '2026-08-25', items: [{ id: 'invoice-line-1', purchaseOrderItemId: 'po-line-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', invoicedQuantity: quantity, unitPrice: 1000, lineTotal: quantity * 1000 }], subtotal: quantity * 1000, taxAmount: 0, discountAmount: 0, totalAmount: quantity * 1000, paidAmount: 0, balanceAmount: quantity * 1000, status: 'pending_review', matchStatus, matchCheckedAt: '2026-08-25T10:30:00.000Z', createdAt: '2026-08-25T09:00:00.000Z', ...overrides };
}
function receiptFixture(): GoodsReceipt {
  return { id: 'grn-1', grnNumber: 'GRN-100', purchaseOrderId: 'po-1', poNumber: 'PO-100', storeId: 'store-001', supplierId: 101, supplierName: 'ABC Distributors', receivingLocationId: 'warehouse:warehouse-001', receivingLocationName: 'Main Warehouse', receivingLocationType: 'warehouse', receivedDate: '2026-08-24', items: [{ id: 'grn-line-1', purchaseOrderItemId: 'po-line-1', inventoryTransactionId: 'tx-1', productId: 'product-1', variantId: null, productName: 'Phone', sku: 'PHONE-1', orderedQuantity: 100, previouslyReceivedQuantity: 0, receivedNowQuantity: 100, totalReceivedQuantity: 100, remainingQuantity: 0 }], createdAt: '2026-08-24T10:00:00.000Z' };
}
