import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { SupplierInvoiceMatchingService } from '../../../../../services/supplier-invoice-matching.service';
import { SupplierInvoiceService } from '../../../../../services/supplier-invoice.service';
import { SupplierPaymentService } from '../../../../../services/supplier-payment.service';
import { SupplierPaymentMethod } from '../../supplier-payments/models/supplier-payment.model';
import { SupplierInvoiceItemMatchResult } from '../models/supplier-invoice-match.model';
import { PurchaseOrderItem } from '../../purchase-orders/models/purchase-order.model';
import { SupplierInvoiceItem, SupplierInvoiceMatchStatus, SupplierInvoiceStatus } from '../models/supplier-invoice.model';

@Component({
  selector: 'app-view-supplier-invoice', standalone: true, imports: [CurrencyPipe, DatePipe],
  templateUrl: './view-supplier-invoice.html', styleUrl: './view-supplier-invoice.css',
})
export class ViewSupplierInvoice {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoiceService = inject(SupplierInvoiceService);
  private readonly paymentService = inject(SupplierPaymentService);
  private readonly matchingService = inject(SupplierInvoiceMatchingService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);
  readonly errorMessage = signal('');
  readonly isWorking = signal(false);
  readonly invoiceId = this.route.snapshot.paramMap.get('id')?.trim() || null;
  readonly invoice = computed(() => {
    if (!this.invoiceId) return undefined;
    const invoice = this.invoiceService.getSupplierInvoiceById(this.invoiceId);
    return invoice?.storeId === this.storeService.selectedStoreId() ? invoice : undefined;
  });
  readonly purchaseOrder = computed(() => {
    const invoice = this.invoice();
    return invoice ? this.purchaseOrderService.getPurchaseOrderById(invoice.purchaseOrderId) : undefined;
  });
  readonly matchResult = computed(() => {
    const invoice = this.invoice();
    if (!invoice || invoice.matchStatus === 'not_checked') return undefined;
    try { return this.matchingService.getMatchResult(invoice.id); } catch { return undefined; }
  });
  readonly payments = computed(() => {
    const invoice = this.invoice();
    return invoice ? this.paymentService.getSupplierPaymentsByInvoice(invoice.id) : [];
  });
  readonly paymentHistoryTotal = computed(() =>
    this.payments().reduce((total, payment) => total + payment.amount, 0),
  );
  readonly paymentHistoryMismatch = computed(() => {
    const invoice = this.invoice();
    return !!invoice && this.moneyInCents(this.paymentHistoryTotal()) !== this.moneyInCents(invoice.paidAmount);
  });
  back(): void { void this.router.navigate(['/store-admin/purchasing/supplier-invoices']); }
  edit(): void { if (this.invoiceId) void this.router.navigate(['/store-admin/purchasing/supplier-invoices', this.invoiceId, 'edit']); }
  viewPurchaseOrder(): void { const invoice = this.invoice(); if (invoice) void this.router.navigate(['/store-admin/purchasing/purchase-orders', invoice.purchaseOrderId]); }
  recordPayment(): void {
    const invoice = this.invoice();
    if (invoice && this.canRecordPayment(invoice.status, invoice.matchStatus, invoice.balanceAmount)) {
      void this.router.navigate(['/store-admin/purchasing/supplier-payments/add'], { queryParams: { invoiceId: invoice.id } });
    }
  }
  viewPayment(paymentId: string): void { void this.router.navigate(['/store-admin/purchasing/supplier-payments', paymentId]); }
  canRecordPayment(status: SupplierInvoiceStatus, matchStatus: SupplierInvoiceMatchStatus, balance: number): boolean {
    return (status === 'approved' || status === 'partially_paid') && matchStatus === 'matched' && this.moneyInCents(balance) > 0;
  }
  async submitForReview(): Promise<void> {
    const invoice = this.invoice(); if (!invoice || invoice.status !== 'draft') return;
    const result = await Swal.fire({
      title: 'Submit supplier invoice for review?',
      text: 'Once submitted, normal Draft editing will be locked.',
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Submit for Review', cancelButtonText: 'Cancel',
      confirmButtonColor: '#6d28d9',
    });
    if (!result.isConfirmed) return;
    this.isWorking.set(true);
    try {
      this.invoiceService.submitForReview(invoice.id);
      const match = this.matchingService.performThreeWayMatch(invoice.id);
      this.storeService.showToast(
        `${invoice.invoiceNumber} submitted for review: ${match.matched ? 'Matched' : 'Mismatch'}.`,
        match.matched ? 'success' : 'warning',
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to submit the supplier invoice.';
      this.errorMessage.set(message); this.storeService.showToast(message, 'danger');
    } finally { this.isWorking.set(false); }
  }
  runMatch(): void {
    const invoice = this.invoice(); if (!invoice || invoice.status !== 'pending_review') return;
    this.errorMessage.set(''); this.isWorking.set(true);
    try {
      const result = this.matchingService.performThreeWayMatch(invoice.id);
      this.storeService.showToast(result.matched ? 'Three-way match passed.' : 'Matching issues found.', result.matched ? 'success' : 'warning');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to run three-way matching.';
      this.errorMessage.set(message); this.storeService.showToast(message, 'danger');
    } finally { this.isWorking.set(false); }
  }
  async approveInvoice(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice || invoice.status !== 'pending_review' || invoice.matchStatus !== 'matched') return;
    const result = await Swal.fire({
      title: 'Approve supplier invoice?',
      text: `${invoice.invoiceNumber} passed three-way matching. Total: ${this.formatCurrency(invoice.totalAmount)}.`,
      icon: 'question', showCancelButton: true, confirmButtonText: 'Approve Invoice',
      cancelButtonText: 'Cancel', confirmButtonColor: '#027a48',
    });
    if (!result.isConfirmed) return;
    this.isWorking.set(true);
    try {
      this.invoiceService.approveSupplierInvoice(invoice.id);
      this.storeService.showToast(`${invoice.invoiceNumber} approved.`, 'success');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to approve the supplier invoice.';
      this.errorMessage.set(message); this.storeService.showToast(message, 'danger');
    } finally { this.isWorking.set(false); }
  }
  poItem(item: SupplierInvoiceItem): PurchaseOrderItem | undefined { return this.purchaseOrder()?.items.find((candidate) => candidate.id === item.purchaseOrderItemId); }
  display(value: string | undefined): string { return value?.trim() || '—'; }
  statusLabel(value: SupplierInvoiceStatus): string { return this.label(value); }
  matchLabel(value: SupplierInvoiceMatchStatus): string { return this.label(value); }
  paymentMethodLabel(value: SupplierPaymentMethod): string { return this.label(value); }
  quantityMessage(item: SupplierInvoiceItemMatchResult): string {
    if (item.quantityMatched) return 'Quantity matched';
    return `Exceeds available quantity by ${Math.max(0, item.quantityDifference)}`;
  }
  priceMessage(item: SupplierInvoiceItemMatchResult): string {
    if (item.priceMatched) return 'Price matched';
    return `${this.formatCurrency(Math.abs(item.priceDifference))} ${item.priceDifference > 0 ? 'higher' : 'lower'}`;
  }
  formatCurrency(value: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
  private label(value: string): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  private moneyInCents(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
}
