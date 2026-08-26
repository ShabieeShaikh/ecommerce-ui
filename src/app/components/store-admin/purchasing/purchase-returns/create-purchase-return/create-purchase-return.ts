import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { GoodsReceipt, GoodsReceiptItem } from '../../goods-receipts/models/goods-receipt.model';
import { InventoryService } from '../../../../../services/inventory.service';
import { GoodsReceiptService } from '../../../../../services/goods-receipt.service';
import { PurchaseReturnService } from '../../../../../services/purchase-return.service';
import { StoreService } from '../../../../../services/store.service';
import { PurchaseReturnReason } from '../models/purchase-return.model';

type ReturnLineForm = FormGroup<{
  goodsReceiptItemId: FormControl<string>;
  returnNowQuantity: FormControl<number>;
}>;

@Component({
  selector: 'app-create-purchase-return', standalone: true,
  imports: [DatePipe, ReactiveFormsModule],
  templateUrl: './create-purchase-return.html', styleUrl: './create-purchase-return.css',
})
export class CreatePurchaseReturn {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly receiptService = inject(GoodsReceiptService);
  private readonly returnService = inject(PurchaseReturnService);
  private readonly inventoryService = inject(InventoryService);
  private readonly storeService = inject(StoreService);
  private previousStoreId = this.storeService.selectedStoreId();

  readonly requestedGoodsReceiptId = this.route.snapshot.queryParamMap.get('goodsReceiptId')?.trim() || null;
  readonly selectedReceiptId = signal('');
  readonly contextMessage = signal('');
  readonly submissionError = signal('');
  readonly isSubmitting = signal(false);
  readonly availabilityRevision = signal(0);
  readonly form = new FormGroup({
    goodsReceiptId: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    returnDate: new FormControl(this.today(), { nonNullable: true, validators: [Validators.required] }),
    reason: new FormControl<PurchaseReturnReason>('defective', { nonNullable: true, validators: [Validators.required] }),
    notes: new FormControl('', { nonNullable: true }),
    items: new FormArray<ReturnLineForm>([]),
  });

  readonly receipts = computed(() => this.receiptService.getGoodsReceiptsByStore(this.storeService.selectedStoreId()));
  readonly eligibleReceipts = computed(() => {
    this.availabilityRevision();
    return this.receipts().filter((receipt) => receipt.items.some((item) => this.maximumReturn(receipt, item) > 0));
  });
  readonly selectedReceipt = computed(() => this.receipts().find((item) => item.id === this.selectedReceiptId()));
  readonly selectedItems = signal(0);
  readonly totalUnitsReturning = signal(0);

  constructor() {
    this.applyQueryPreselection();
    effect(() => {
      const storeId = this.storeService.selectedStoreId();
      if (storeId === this.previousStoreId) return;
      this.previousStoreId = storeId;
      this.resetSelection();
      this.contextMessage.set('The selected store changed. Goods Receipt and return quantities were reset for safety.');
    });
    this.form.controls.items.valueChanges.subscribe(() => this.updateSummary());
  }

  selectReceipt(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    this.form.controls.goodsReceiptId.setValue(id);
    this.selectedReceiptId.set(id);
    this.submissionError.set('');
    this.buildItemControls(this.receipts().find((item) => item.id === id));
  }

  previouslyReturned(item: GoodsReceiptItem): number { return this.returnService.getPreviouslyReturnedQuantity(item.id); }
  remainingReturnable(receipt: GoodsReceipt, item: GoodsReceiptItem): number { return this.returnService.getRemainingReturnableQuantity(receipt.id, item.id); }
  currentAvailable(receipt: GoodsReceipt, item: GoodsReceiptItem): number {
    this.availabilityRevision();
    try { return this.inventoryService.getBalance(receipt.storeId, item.productId, receipt.receivingLocationId, item.variantId === null ? null : String(item.variantId)).availableQuantity; }
    catch { return 0; }
  }
  maximumReturn(receipt: GoodsReceipt, item: GoodsReceiptItem): number { return Math.min(this.remainingReturnable(receipt, item), this.currentAvailable(receipt, item)); }
  expectedAvailableAfter(receipt: GoodsReceipt, item: GoodsReceiptItem): number { return Math.max(0, this.currentAvailable(receipt, item) - this.aggregateQuantity(item)); }
  itemFor(index: number): GoodsReceiptItem | undefined { const id = this.form.controls.items.at(index)?.controls.goodsReceiptItemId.value; return this.selectedReceipt()?.items.find((item) => item.id === id); }
  quantityError(index: number): string {
    const receipt = this.selectedReceipt(); const item = this.itemFor(index); const control = this.form.controls.items.at(index)?.controls.returnNowQuantity;
    if (!receipt || !item || !control) return '';
    const quantity = Number(control.value);
    if (quantity === 0) return '';
    if (!Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity < 0) return 'Enter a whole number greater than zero, or leave 0 to exclude this item.';
    const returnable = this.remainingReturnable(receipt, item);
    if (quantity > returnable) return `Cannot exceed the historical returnable quantity of ${returnable}.`;
    const available = this.currentAvailable(receipt, item);
    if (this.aggregateQuantity(item) > available) return `Combined return quantity cannot exceed current available stock of ${available}.`;
    return '';
  }
  dateError(): string {
    const receipt = this.selectedReceipt(); const value = this.form.controls.returnDate.value;
    if (!value || Number.isNaN(Date.parse(value))) return 'Enter a valid return date.';
    return receipt && Date.parse(value) < Date.parse(receipt.receivedDate) ? 'Return date cannot be before the Goods Receipt date.' : '';
  }
  reasonLabel(value: PurchaseReturnReason): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  displayVariant(value: string | undefined): string { return value?.trim() || 'Simple product'; }
  refreshAvailability(clearError = true): void {
    this.availabilityRevision.update((value) => value + 1);
    if (clearError) this.submissionError.set('');
  }

  async submit(): Promise<void> {
    this.submissionError.set('');
    const receipt = this.selectedReceipt();
    const items = this.positiveItems();
    if (!receipt || this.form.invalid || !!this.dateError() || this.hasItemErrors() || !items.length) {
      this.form.markAllAsTouched();
      if (!items.length) this.submissionError.set('Enter a return quantity greater than zero for at least one item.');
      return;
    }
    const value = this.form.getRawValue();
    const confirmation = await Swal.fire({
      title: 'Post Purchase Return?',
      html: `<div style="text-align:left"><b>Supplier:</b> ${this.escape(receipt.supplierName)}<br><b>GRN:</b> ${this.escape(receipt.grnNumber)}<br><b>PO:</b> ${this.escape(receipt.poNumber)}<br><b>Return From:</b> ${this.escape(receipt.receivingLocationName)}<br><b>Items:</b> ${items.length}<br><b>Total Units:</b> ${this.totalUnitsReturning()}<br><b>Reason:</b> ${this.reasonLabel(value.reason)}</div><p>This will decrease inventory at the original receiving location. The original GRN remains unchanged, and the posted return cannot be edited or deleted.</p>`,
      icon: 'warning', showCancelButton: true, confirmButtonText: 'Post Return', cancelButtonText: 'Cancel', confirmButtonColor: '#b42318',
    });
    if (!confirmation.isConfirmed) return;
    this.isSubmitting.set(true);
    try {
      const posted = this.returnService.createPurchaseReturn({ goodsReceiptId: receipt.id, returnDate: value.returnDate, reason: value.reason, items, notes: value.notes || undefined });
      this.storeService.showToast(`${posted.returnNumber} posted successfully.`, 'success');
      void this.router.navigate(['/store-admin/purchasing/purchase-returns', posted.id]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to post the purchase return.';
      this.submissionError.set(message); this.storeService.showToast(message, 'danger'); this.refreshAvailability(false);
    } finally { this.isSubmitting.set(false); }
  }

  cancel(): void { void this.router.navigate(['/store-admin/purchasing/purchase-returns']); }
  viewReceipts(): void { void this.router.navigate(['/store-admin/purchasing/goods-receipts']); }
  canSubmit(): boolean { return !!this.selectedReceipt() && this.form.valid && !this.dateError() && !this.hasItemErrors() && this.positiveItems().length > 0 && !this.isSubmitting(); }

  private applyQueryPreselection(): void {
    if (!this.requestedGoodsReceiptId) return;
    const receipt = this.receiptService.getGoodsReceiptById(this.requestedGoodsReceiptId);
    if (!receipt || receipt.storeId !== this.storeService.selectedStoreId()) { this.contextMessage.set('The requested Goods Receipt was not found for the selected store.'); return; }
    if (!receipt.items.some((item) => this.maximumReturn(receipt, item) > 0)) { this.contextMessage.set('The requested Goods Receipt has no items currently available for return.'); return; }
    this.form.controls.goodsReceiptId.setValue(receipt.id); this.selectedReceiptId.set(receipt.id); this.buildItemControls(receipt);
  }
  private buildItemControls(receipt: GoodsReceipt | undefined): void {
    this.form.controls.items.clear();
    receipt?.items.forEach((item) => this.form.controls.items.push(new FormGroup({
      goodsReceiptItemId: new FormControl(item.id, { nonNullable: true }),
      returnNowQuantity: new FormControl(0, { nonNullable: true }),
    })));
    this.updateSummary();
  }
  private positiveItems() { return this.form.controls.items.controls.map((group) => group.getRawValue()).filter((item) => Number.isInteger(item.returnNowQuantity) && item.returnNowQuantity > 0); }
  private hasItemErrors(): boolean { return this.form.controls.items.controls.some((_group, index) => !!this.quantityError(index)); }
  private aggregateQuantity(item: GoodsReceiptItem): number {
    const receipt = this.selectedReceipt(); if (!receipt) return 0;
    return this.form.controls.items.controls.reduce((sum, group, index) => {
      const candidate = this.itemFor(index); const quantity = Number(group.controls.returnNowQuantity.value);
      return candidate && candidate.productId === item.productId && String(candidate.variantId ?? '') === String(item.variantId ?? '') && Number.isFinite(quantity) && quantity > 0 ? sum + quantity : sum;
    }, 0);
  }
  private updateSummary(): void {
    const positive = this.positiveItems(); this.selectedItems.set(positive.length); this.totalUnitsReturning.set(positive.reduce((sum, item) => sum + item.returnNowQuantity, 0));
  }
  private resetSelection(): void {
    this.form.reset({ goodsReceiptId: '', returnDate: this.today(), reason: 'defective', notes: '' });
    this.form.controls.items.clear(); this.selectedReceiptId.set(''); this.updateSummary(); this.submissionError.set('');
  }
  private escape(value: string): string { return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character] ?? character); }
  private today(): string { const date = new Date(); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`; }
}
