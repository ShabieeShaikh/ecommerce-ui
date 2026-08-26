import { CurrencyPipe } from '@angular/common';
import { computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  ValidationErrors,
  ValidatorFn,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { PurchaseOrderService } from '../../../../services/purchase-order.service';
import { StoreService } from '../../../../services/store.service';
import { SupplierInvoiceService } from '../../../../services/supplier-invoice.service';
import { PurchaseOrder, PurchaseOrderItem } from '../purchase-orders/models/purchase-order.model';
import {
  CreateSupplierInvoiceItemRequest,
  SupplierInvoice,
  UpdateSupplierInvoiceRequest,
} from './models/supplier-invoice.model';

export type InvoiceItemFormGroup = FormGroup<{
  included: FormControl<boolean>;
  purchaseOrderItemId: FormControl<string>;
  invoicedQuantity: FormControl<number>;
  unitPrice: FormControl<number>;
}>;

export abstract class SupplierInvoiceFormBase {
  protected readonly router = inject(Router);
  protected readonly route = inject(ActivatedRoute);
  protected readonly purchaseOrderService = inject(PurchaseOrderService);
  protected readonly invoiceService = inject(SupplierInvoiceService);
  protected readonly storeService = inject(StoreService);

  readonly invoiceId = this.route.snapshot.paramMap.get('id')?.trim() || null;
  readonly isEditMode = this.invoiceId !== null;
  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly submissionError = signal('');
  readonly contextMessage = signal('');
  readonly isSubmitting = signal(false);
  private previousStoreId = this.selectedStoreId();

  readonly form = new FormGroup(
    {
      purchaseOrderId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      invoiceNumber: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
      invoiceDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
      dueDate: new FormControl('', { nonNullable: true }),
      items: new FormArray<InvoiceItemFormGroup>([]),
      taxAmount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
      discountAmount: new FormControl(0, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
      notes: new FormControl('', { nonNullable: true }),
    },
    { validators: [this.dueDateValidator()] },
  );

  private readonly formValue = toSignal(this.form.valueChanges, { initialValue: this.form.getRawValue() });
  readonly invoice = computed<SupplierInvoice | undefined>(() => {
    if (!this.invoiceId) return undefined;
    const invoice = this.invoiceService.getSupplierInvoiceById(this.invoiceId);
    return invoice?.storeId === this.selectedStoreId() ? invoice : undefined;
  });
  readonly canRender = computed(() => !this.isEditMode || this.invoice() !== undefined);
  readonly eligiblePurchaseOrders = computed(() =>
    this.purchaseOrderService
      .getPurchaseOrdersByStore(this.selectedStoreId())
      .filter((order) => ['ordered', 'partially_received', 'received'].includes(order.status))
      .sort((left, right) => right.orderDate.localeCompare(left.orderDate)),
  );
  readonly selectedPurchaseOrder = computed(() => {
    const id = this.formValue().purchaseOrderId ?? '';
    return this.purchaseOrderService.getPurchaseOrderById(id);
  });
  readonly includedCount = computed(() => (this.formValue().items ?? []).filter((item) => item.included).length);
  readonly subtotal = computed(() => this.roundMoney((this.formValue().items ?? []).reduce(
    (total, item) => item.included
      ? total + this.validNumber(item.invoicedQuantity) * this.validNumber(item.unitPrice)
      : total,
    0,
  )));
  readonly total = computed(() => this.roundMoney(Math.max(
    0,
    this.subtotal() + this.validNumber(this.formValue().taxAmount) - this.validNumber(this.formValue().discountAmount),
  )));

  constructor() {
    if (this.isEditMode) this.loadInvoice();
    effect(() => {
      const storeId = this.selectedStoreId();
      if (storeId === this.previousStoreId) return;
      this.previousStoreId = storeId;
      if (this.isEditMode) {
        void this.router.navigate(['/store-admin/purchasing/supplier-invoices']);
      } else {
        this.resetForStoreChange();
      }
    });
  }

  get items(): FormArray<InvoiceItemFormGroup> { return this.form.controls.items; }
  pageTitle(): string { return this.isEditMode ? 'Edit Draft Supplier Invoice' : 'Create Supplier Invoice'; }
  pageSubtitle(): string { return this.isEditMode ? 'Update commercial details while this invoice is still a Draft.' : 'Record a supplier invoice against an eligible Purchase Order.'; }
  submitLabel(): string { return this.isEditMode ? 'Update Supplier Invoice' : 'Save Draft'; }

  onPurchaseOrderChange(): void {
    if (this.isEditMode) return;
    this.submissionError.set('');
    const purchaseOrder = this.selectedPurchaseOrder();
    this.items.clear({ emitEvent: false });
    purchaseOrder?.items.forEach((item) => this.items.push(this.createItemGroup(item, true), { emitEvent: false }));
    this.form.updateValueAndValidity();
  }

  itemContext(index: number): PurchaseOrderItem | undefined {
    const id = this.items.at(index).controls.purchaseOrderItemId.value;
    return this.selectedPurchaseOrder()?.items.find((item) => item.id === id);
  }
  lineTotal(index: number): number {
    const item = this.formValue().items?.[index];
    return item?.included ? this.roundMoney(this.validNumber(item.invoicedQuantity) * this.validNumber(item.unitPrice)) : 0;
  }
  hasError(control: AbstractControl, error: string): boolean { return control.touched && control.hasError(error); }
  display(value: string | undefined): string { return value?.trim() || '—'; }

  submit(): void {
    this.submissionError.set('');
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const request = this.buildRequest();
    if (!request) return;
    this.isSubmitting.set(true);
    try {
      if (this.isEditMode && this.invoiceId) {
        const updated = this.invoiceService.updateSupplierInvoice(this.invoiceId, request);
        if (!updated) throw new Error('Supplier invoice not found.');
        this.storeService.showToast(`${updated.invoiceNumber} updated.`, 'success');
        void this.router.navigate(['/store-admin/purchasing/supplier-invoices', updated.id]);
      } else {
        const created = this.invoiceService.createSupplierInvoice({ ...request, purchaseOrderId: this.form.controls.purchaseOrderId.value });
        this.storeService.showToast('Supplier invoice saved as Draft.', 'success');
        void this.router.navigate(['/store-admin/purchasing/supplier-invoices', created.id]);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to save the supplier invoice.';
      this.submissionError.set(message);
      this.storeService.showToast(message, 'danger');
    } finally { this.isSubmitting.set(false); }
  }

  cancel(): void {
    void this.router.navigate(this.isEditMode && this.invoiceId
      ? ['/store-admin/purchasing/supplier-invoices', this.invoiceId]
      : ['/store-admin/purchasing/supplier-invoices']);
  }
  viewPurchaseOrders(): void { void this.router.navigate(['/store-admin/purchasing/purchase-orders']); }
  viewInvoice(): void { if (this.invoiceId) void this.router.navigate(['/store-admin/purchasing/supplier-invoices', this.invoiceId]); }

  private loadInvoice(): void {
    const invoice = this.invoice();
    if (!invoice || invoice.status !== 'draft') return;
    const purchaseOrder = this.purchaseOrderService.getPurchaseOrderById(invoice.purchaseOrderId);
    this.form.patchValue({
      purchaseOrderId: invoice.purchaseOrderId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate ?? '',
      taxAmount: invoice.taxAmount,
      discountAmount: invoice.discountAmount,
      notes: invoice.notes ?? '',
    }, { emitEvent: false });
    this.items.clear({ emitEvent: false });
    const poItems = purchaseOrder?.items ?? [];
    poItems.forEach((item) => {
      const existing = invoice.items.find((candidate) => candidate.purchaseOrderItemId === item.id);
      this.items.push(this.createItemGroup(item, !!existing, existing?.invoicedQuantity, existing?.unitPrice), { emitEvent: false });
    });
    this.form.updateValueAndValidity();
  }

  private buildRequest(): UpdateSupplierInvoiceRequest | undefined {
    const value = this.form.getRawValue();
    const items: CreateSupplierInvoiceItemRequest[] = value.items
      .filter((item) => item.included)
      .map((item) => ({ purchaseOrderItemId: item.purchaseOrderItemId, invoicedQuantity: item.invoicedQuantity, unitPrice: item.unitPrice }));
    if (!items.length) { this.submissionError.set('Select at least one invoice item.'); return undefined; }
    return {
      invoiceNumber: value.invoiceNumber,
      invoiceDate: value.invoiceDate,
      dueDate: value.dueDate || undefined,
      items,
      taxAmount: value.taxAmount,
      discountAmount: value.discountAmount,
      notes: value.notes.trim() || undefined,
    };
  }

  private createItemGroup(item: PurchaseOrderItem, included: boolean, quantity = item.quantity, unitPrice = item.purchasePrice): InvoiceItemFormGroup {
    return new FormGroup({
      included: new FormControl(included, { nonNullable: true }),
      purchaseOrderItemId: new FormControl(item.id, { nonNullable: true }),
      invoicedQuantity: new FormControl(quantity, { nonNullable: true, validators: [Validators.required, Validators.min(Number.EPSILON)] }),
      unitPrice: new FormControl(unitPrice, { nonNullable: true, validators: [Validators.required, Validators.min(0)] }),
    });
  }
  private resetForStoreChange(): void {
    this.form.reset({ purchaseOrderId: '', invoiceNumber: '', invoiceDate: this.today(), dueDate: '', taxAmount: 0, discountAmount: 0, notes: '' });
    this.items.clear();
    this.submissionError.set('');
    this.contextMessage.set('The selected store changed. Purchase Order and invoice items were reset for safety.');
  }
  private dueDateValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const invoiceDate = control.get('invoiceDate')?.value;
      const dueDate = control.get('dueDate')?.value;
      return typeof invoiceDate === 'string' && typeof dueDate === 'string' && dueDate && dueDate < invoiceDate
        ? { dueBeforeInvoice: true } : null;
    };
  }
  private validNumber(value: number | undefined): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0; }
  private roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private today(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
}

export const SUPPLIER_INVOICE_FORM_IMPORTS = [CurrencyPipe, ReactiveFormsModule] as const;
