import { CurrencyPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { StoreService } from '../../../../../services/store.service';
import { SupplierInvoiceService } from '../../../../../services/supplier-invoice.service';
import { SupplierPaymentService } from '../../../../../services/supplier-payment.service';
import { SupplierInvoice } from '../../supplier-invoices/models/supplier-invoice.model';
import { SupplierPaymentMethod } from '../models/supplier-payment.model';

@Component({ selector: 'app-record-supplier-payment', standalone: true, imports: [CurrencyPipe, ReactiveFormsModule], templateUrl: './record-supplier-payment.html', styleUrl: './record-supplier-payment.css' })
export class RecordSupplierPayment {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storeService = inject(StoreService);
  private readonly invoiceService = inject(SupplierInvoiceService);
  private readonly paymentService = inject(SupplierPaymentService);
  private previousStoreId = this.storeService.selectedStoreId();
  readonly requestedInvoiceId = this.route.snapshot.queryParamMap.get('invoiceId')?.trim() || null;
  readonly contextMessage = signal('');
  readonly submissionError = signal('');
  readonly isSubmitting = signal(false);
  readonly form = new FormGroup({
    supplierInvoiceId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    paymentDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    amount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0.01)] }),
    paymentMethod: new FormControl<SupplierPaymentMethod>('bank_transfer', { nonNullable: true, validators: [Validators.required] }),
    referenceNumber: new FormControl('', { nonNullable: true }),
    notes: new FormControl('', { nonNullable: true }),
  });
  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly eligibleInvoices = computed(() => this.invoiceService.getSupplierInvoicesByStore(this.storeService.selectedStoreId()).filter((invoice) => this.isPayable(invoice)));
  readonly selectedInvoice = computed(() => this.eligibleInvoices().find((invoice) => invoice.id === this.formValue().supplierInvoiceId));
  readonly preselectionLocked = computed(() => !!this.requestedInvoiceId && this.selectedInvoice()?.id === this.requestedInvoiceId);
  readonly paymentNow = computed(() => this.validMoney(this.formValue().amount));
  readonly outstandingAfter = computed(() => Math.max(0, (this.selectedInvoice()?.balanceAmount ?? 0) - this.paymentNow()));
  readonly isFullPayment = computed(() => !!this.selectedInvoice() && this.toCents(this.paymentNow()) === this.toCents(this.selectedInvoice()!.balanceAmount));

  constructor() {
    this.applyQueryPreselection();
    effect(() => {
      const storeId = this.storeService.selectedStoreId();
      if (storeId === this.previousStoreId) return;
      this.previousStoreId = storeId;
      this.form.reset({ supplierInvoiceId: '', paymentDate: this.today(), amount: 0, paymentMethod: 'bank_transfer', referenceNumber: '', notes: '' });
      this.submissionError.set('');
      this.contextMessage.set('The selected store changed. Invoice and payment details were reset for safety.');
    });
  }
  hasError(control: AbstractControl, name: string): boolean { return control.touched && control.hasError(name); }
  methodLabel(value: SupplierPaymentMethod): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  statusLabel(value: SupplierInvoice['status']): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  payFullBalance(): void { const invoice = this.selectedInvoice(); if (invoice) this.form.controls.amount.setValue(invoice.balanceAmount); }
  amountExceedsBalance(): boolean { const invoice = this.selectedInvoice(); return !!invoice && this.toCents(this.paymentNow()) > this.toCents(invoice.balanceAmount); }
  async submit(): Promise<void> {
    this.submissionError.set('');
    if (this.form.invalid || this.amountExceedsBalance() || !this.selectedInvoice()) { this.form.markAllAsTouched(); if (!this.selectedInvoice()) this.submissionError.set('Select an eligible supplier invoice.'); return; }
    const invoice = this.selectedInvoice()!;
    const value = this.form.getRawValue();
    const confirmation = await Swal.fire({
      title: 'Record supplier payment?',
      html: `<div style="text-align:left"><b>Supplier:</b> ${this.escape(invoice.supplierName)}<br><b>Invoice:</b> ${this.escape(invoice.invoiceNumber)}<br><b>Amount:</b> ${this.formatCurrency(value.amount)}<br><b>Method:</b> ${this.methodLabel(value.paymentMethod)}<br><b>Outstanding after:</b> ${this.formatCurrency(this.outstandingAfter())}</div><p>This records a permanent financial payment against the supplier invoice. It does not change inventory and cannot be edited or deleted.</p>`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Record Payment', cancelButtonText: 'Cancel', confirmButtonColor: '#6d28d9',
    });
    if (!confirmation.isConfirmed) return;
    this.isSubmitting.set(true);
    try {
      const payment = this.paymentService.recordPayment({ supplierInvoiceId: value.supplierInvoiceId, paymentDate: value.paymentDate, amount: value.amount, paymentMethod: value.paymentMethod, referenceNumber: value.referenceNumber || undefined, notes: value.notes || undefined });
      this.storeService.showToast(`${payment.paymentNumber} recorded successfully.`, 'success');
      void this.router.navigate(['/store-admin/purchasing/supplier-payments', payment.id]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to record supplier payment.';
      this.submissionError.set(message); this.storeService.showToast(message, 'danger');
    } finally { this.isSubmitting.set(false); }
  }
  cancel(): void { void this.router.navigate(['/store-admin/purchasing/supplier-payments']); }
  viewInvoices(): void { void this.router.navigate(['/store-admin/purchasing/supplier-invoices']); }
  private applyQueryPreselection(): void {
    if (!this.requestedInvoiceId) return;
    const invoice = this.invoiceService.getSupplierInvoiceById(this.requestedInvoiceId);
    if (!invoice || invoice.storeId !== this.storeService.selectedStoreId()) {
      this.contextMessage.set('The requested supplier invoice was not found for the selected store.'); return;
    }
    if (!this.isPayable(invoice)) {
      this.contextMessage.set('The requested supplier invoice is not currently eligible for payment.'); return;
    }
    this.form.controls.supplierInvoiceId.setValue(invoice.id);
  }
  private isPayable(invoice: SupplierInvoice): boolean { return (invoice.status === 'approved' || invoice.status === 'partially_paid') && invoice.matchStatus === 'matched' && this.toCents(invoice.balanceAmount) > 0; }
  private validMoney(value: number | undefined): number { return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round((value + Number.EPSILON) * 100) / 100 : 0; }
  private toCents(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
  private formatCurrency(value: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
  private escape(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character); }
  private today(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
}
