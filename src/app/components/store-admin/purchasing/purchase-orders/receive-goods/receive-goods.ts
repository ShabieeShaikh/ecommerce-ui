import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
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
import Swal from 'sweetalert2';

import { CreateGoodsReceiptRequest } from '../../goods-receipts/models/goods-receipt.model';
import { InventoryLocationType } from '../../../../../models/inventory.models';
import { GoodsReceiptService } from '../../../../../services/goods-receipt.service';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../models/purchase-order.model';

type ReceiveItemFormGroup = FormGroup<{
  purchaseOrderItemId: FormControl<string>;
  receivedNowQuantity: FormControl<number>;
}>;

@Component({
  selector: 'app-receive-goods',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './receive-goods.html',
  styleUrl: './receive-goods.css',
})
export class ReceiveGoods {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);

  readonly purchaseOrderId = this.parsePurchaseOrderId(this.route.snapshot.paramMap.get('id'));
  readonly sourcePurchaseOrder = computed<PurchaseOrder | undefined>(() =>
    this.purchaseOrderId
      ? this.purchaseOrderService.getPurchaseOrderById(this.purchaseOrderId)
      : undefined,
  );
  readonly purchaseOrder = computed<PurchaseOrder | undefined>(() => {
    const purchaseOrder = this.sourcePurchaseOrder();
    return purchaseOrder?.storeId === this.storeService.selectedStoreId()
      ? purchaseOrder
      : undefined;
  });
  readonly hasStoreMismatch = computed(() => {
    const purchaseOrder = this.sourcePurchaseOrder();
    return !!purchaseOrder && purchaseOrder.storeId !== this.storeService.selectedStoreId();
  });
  readonly canReceivePurchaseOrder = computed(() => {
    const status = this.purchaseOrder()?.status;
    return status === 'ordered' || status === 'partially_received';
  });

  readonly isSubmitting = signal(false);
  readonly submissionError = signal('');
  readonly receiptForm = new FormGroup({
    receivedDate: new FormControl(this.today(), {
      nonNullable: true,
      validators: [Validators.required],
    }),
    items: new FormArray<ReceiveItemFormGroup>([]),
    notes: new FormControl('', { nonNullable: true }),
  });

  private readonly formChanges = toSignal(this.receiptForm.valueChanges, {
    initialValue: this.receiptForm.getRawValue(),
  });
  private readonly formValue = computed(() => {
    this.formChanges();
    return this.receiptForm.getRawValue();
  });

  readonly totalOrderedQuantity = computed(
    () => this.purchaseOrder()?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
  );
  readonly totalPreviouslyReceived = computed(
    () =>
      this.purchaseOrder()?.items.reduce((total, item) => total + item.receivedQuantity, 0) ?? 0,
  );
  readonly totalRemainingQuantity = computed(() =>
    Math.max(0, this.totalOrderedQuantity() - this.totalPreviouslyReceived()),
  );
  readonly receivingNowQuantity = computed(() =>
    this.formValue().items.reduce(
      (total, item) => total + this.validQuantity(item.receivedNowQuantity),
      0,
    ),
  );
  readonly itemsInReceipt = computed(
    () =>
      this.formValue().items.filter((item) => this.validQuantity(item.receivedNowQuantity) > 0)
        .length,
  );
  readonly afterReceiptQuantity = computed(
    () => this.totalPreviouslyReceived() + this.receivingNowQuantity(),
  );
  readonly afterReceiptProgress = computed(() => {
    const ordered = this.totalOrderedQuantity();
    return ordered > 0 ? Math.min(100, (this.afterReceiptQuantity() / ordered) * 100) : 0;
  });
  readonly canSubmit = computed(() => {
    this.formValue();
    const hasReceiptItems = this.itemsInReceipt() > 0;
    return (
      this.canReceivePurchaseOrder() &&
      this.receiptForm.valid &&
      hasReceiptItems &&
      !this.isSubmitting()
    );
  });

  constructor() {
    const purchaseOrder = this.purchaseOrder();
    if (purchaseOrder && this.isReceivableStatus(purchaseOrder.status)) {
      purchaseOrder.items.forEach((item) => this.items.push(this.createItemGroup(item)));
    }
  }

  get items(): FormArray<ReceiveItemFormGroup> {
    return this.receiptForm.controls.items;
  }

  itemAt(index: number): PurchaseOrderItem | undefined {
    return this.purchaseOrder()?.items[index];
  }

  remainingQuantity(item: PurchaseOrderItem): number {
    return Math.max(0, item.quantity - item.receivedQuantity);
  }

  afterReceiptForItem(index: number, item: PurchaseOrderItem): number {
    return Math.min(
      item.quantity,
      item.receivedQuantity +
        this.validQuantity(this.items.at(index).controls.receivedNowQuantity.value),
    );
  }

  receiveAllForItem(index: number): void {
    const item = this.itemAt(index);
    if (!item) return;
    this.items.at(index).controls.receivedNowQuantity.setValue(this.remainingQuantity(item));
    this.submissionError.set('');
  }

  receiveAllRemaining(): void {
    const purchaseOrder = this.purchaseOrder();
    if (!purchaseOrder) return;
    purchaseOrder.items.forEach((item, index) => {
      this.items.at(index)?.controls.receivedNowQuantity.setValue(this.remainingQuantity(item));
    });
    this.submissionError.set('');
  }

  clearQuantities(): void {
    this.items.controls.forEach((group) => group.controls.receivedNowQuantity.setValue(0));
    this.submissionError.set('');
  }

  itemHasError(index: number, errorName: string): boolean {
    const control = this.items.at(index).controls.receivedNowQuantity;
    return control.touched && control.hasError(errorName);
  }

  itemStatus(item: PurchaseOrderItem): 'not-received' | 'partial' | 'complete' {
    if (item.receivedQuantity >= item.quantity) return 'complete';
    return item.receivedQuantity > 0 ? 'partial' : 'not-received';
  }

  itemStatusLabel(item: PurchaseOrderItem): string {
    switch (this.itemStatus(item)) {
      case 'not-received':
        return 'Not Received';
      case 'partial':
        return 'Partially Received';
      case 'complete':
        return 'Fully Received';
    }
  }

  statusLabel(status: PurchaseOrderStatus): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'ordered':
        return 'Ordered';
      case 'partially_received':
        return 'Partially Received';
      case 'received':
        return 'Received';
      case 'cancelled':
        return 'Cancelled';
    }
  }

  locationTypeLabel(type: InventoryLocationType): string {
    switch (type) {
      case 'store':
        return 'Store';
      case 'branch':
        return 'Branch';
      case 'warehouse':
        return 'Warehouse';
    }
  }

  backToPurchaseOrder(): void {
    const purchaseOrder = this.sourcePurchaseOrder();
    if (purchaseOrder) {
      void this.router.navigate(['/store-admin/purchasing/purchase-orders', purchaseOrder.id]);
      return;
    }
    this.backToPurchaseOrders();
  }

  backToPurchaseOrders(): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
  }

  async postGoodsReceipt(): Promise<void> {
    this.submissionError.set('');
    this.receiptForm.markAllAsTouched();
    const purchaseOrder = this.purchaseOrder();
    if (!purchaseOrder || !this.canReceivePurchaseOrder()) {
      this.submissionError.set('This purchase order cannot receive goods.');
      return;
    }
    if (!this.canSubmit()) return;

    const request = this.createRequest(purchaseOrder);
    this.isSubmitting.set(true);
    const confirmation = await Swal.fire({
      title: 'Post Goods Receipt?',
      text: `Receive ${this.receivingNowQuantity()} total units across ${this.itemsInReceipt()} item${this.itemsInReceipt() === 1 ? '' : 's'} against ${purchaseOrder.poNumber} at ${purchaseOrder.receivingLocationName}? Posting this receipt will increase Inventory at this location.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Post Goods Receipt',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#6437e8',
      cancelButtonColor: '#667085',
      reverseButtons: true,
    });

    if (!confirmation.isConfirmed) {
      this.isSubmitting.set(false);
      return;
    }

    try {
      const receipt = this.goodsReceiptService.receiveGoods(request);
      const updatedStatus = this.purchaseOrderService.getPurchaseOrderById(
        purchaseOrder.id,
      )?.status;
      const statusMessage =
        updatedStatus === 'received'
          ? 'Purchase Order has been fully received.'
          : 'Purchase Order is now Partially Received.';
      this.storeService.showToast(
        `Goods Receipt ${receipt.grnNumber} posted successfully. ${statusMessage}`,
        'success',
      );
      await this.router.navigate(['/store-admin/purchasing/purchase-orders', purchaseOrder.id]);
    } catch (error: unknown) {
      const message = this.errorMessage(error);
      this.submissionError.set(message);
      this.storeService.showToast(message, 'danger');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  private createRequest(purchaseOrder: PurchaseOrder): CreateGoodsReceiptRequest {
    const values = this.receiptForm.getRawValue();
    return {
      purchaseOrderId: purchaseOrder.id,
      receivedDate: values.receivedDate,
      items: values.items
        .filter(
          (item) => Number.isInteger(item.receivedNowQuantity) && item.receivedNowQuantity > 0,
        )
        .map((item) => ({
          purchaseOrderItemId: item.purchaseOrderItemId,
          receivedNowQuantity: item.receivedNowQuantity,
        })),
      notes: values.notes.trim() || undefined,
    };
  }

  private createItemGroup(item: PurchaseOrderItem): ReceiveItemFormGroup {
    const remaining = this.remainingQuantity(item);
    return new FormGroup({
      purchaseOrderItemId: new FormControl(item.id, { nonNullable: true }),
      receivedNowQuantity: new FormControl(
        { value: 0, disabled: remaining === 0 },
        {
          nonNullable: true,
          validators: [
            Validators.required,
            Validators.min(0),
            Validators.max(remaining),
            this.wholeFiniteNumberValidator(),
          ],
        },
      ),
    });
  }

  private wholeFiniteNumberValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value: unknown = control.value;
      return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)
        ? null
        : { wholeNumber: true };
    };
  }

  private validQuantity(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  private isReceivableStatus(status: PurchaseOrderStatus): boolean {
    return status === 'ordered' || status === 'partially_received';
  }

  private parsePurchaseOrderId(value: string | null): string | null {
    return value?.trim() || null;
  }

  private today(): string {
    const now = new Date();
    const localTime = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return localTime.toISOString().slice(0, 10);
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to receive goods.';
  }
}
