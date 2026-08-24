import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
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

import { Product } from '../../../../../models/admin.models';
import {
  InventoryLocation,
  InventoryLocationType,
} from '../../../../../models/inventory.models';
import { ProductVariant } from '../../../../../models/product-catalog.models';
import { InventoryLocationService } from '../../../../../services/inventory-location.service';
import { ProductService } from '../../../../../services/product.service';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier } from '../../suppliers/models/supplier.model';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  UpdatePurchaseOrderItemRequest,
  UpdatePurchaseOrderRequest,
} from '../models/purchase-order.model';

type PurchaseItemFormGroup = FormGroup<{
  itemId: FormControl<string>;
  productId: FormControl<string>;
  variantId: FormControl<string>;
  quantity: FormControl<number>;
  purchasePrice: FormControl<number>;
}>;

type PurchaseItemControlName = Exclude<keyof PurchaseItemFormGroup['controls'], 'itemId'>;

@Component({
  selector: 'app-edit-purchase-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit-purchase-order.html',
  styleUrls: [
    '../create-purchase-order/create-purchase-order.css',
    './edit-purchase-order.css',
  ],
})
export class EditPurchaseOrder {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);
  private readonly supplierService = inject(SupplierService);
  private readonly inventoryLocationService = inject(InventoryLocationService);

  private previousStoreId = this.storeService.selectedStoreId();
  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  readonly purchaseOrderId = this.parsePurchaseOrderId(this.route.snapshot.paramMap.get('id'));
  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly isSubmitting = signal(false);
  readonly submissionError = signal('');

  private readonly purchaseOrderRecord = computed<PurchaseOrder | undefined>(() =>
    this.purchaseOrderId
      ? this.purchaseOrderService.getPurchaseOrderById(this.purchaseOrderId)
      : undefined,
  );

  readonly purchaseOrder = computed<PurchaseOrder | undefined>(() => {
    const purchaseOrder = this.purchaseOrderRecord();
    return purchaseOrder?.storeId === this.selectedStoreId() ? purchaseOrder : undefined;
  });

  readonly supplierOptions = computed(() => {
    const currentSupplierId = this.purchaseOrder()?.supplierId;
    return this.supplierService
      .getSuppliersByStore(this.selectedStoreId())
      .filter((supplier) => supplier.status === 'active' || supplier.id === currentSupplierId)
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  readonly receivingLocations = computed<InventoryLocation[]>(() => {
    const storeId = this.selectedStoreId();
    const activeLocations = this.inventoryLocationService.getLocations(storeId);
    const warehouses = activeLocations.filter((location) => location.type === 'warehouse');
    const selectable =
      warehouses.length > 0
        ? warehouses
        : activeLocations.filter((location) => location.type === 'store');
    const purchaseOrder = this.purchaseOrder();

    if (
      !purchaseOrder ||
      selectable.some((location) => location.key === purchaseOrder.receivingLocationId)
    ) {
      return selectable;
    }

    return [
      ...selectable,
      {
        key: purchaseOrder.receivingLocationId,
        storeId,
        type: purchaseOrder.receivingLocationType,
        entityId: null,
        name: purchaseOrder.receivingLocationName,
        code: 'UNAVAILABLE',
        active: false,
      },
    ];
  });

  readonly productOptions = computed(() => {
    const currentProductIds = new Set(
      this.purchaseOrder()?.items.map((item) => item.productId) ?? [],
    );
    return this.productService
      .getProductsByStore(this.selectedStoreId())
      .filter((product) => product.status === 'active' || currentProductIds.has(product.id))
      .sort((left, right) => left.name.localeCompare(right.name));
  });

  readonly purchaseOrderForm = new FormGroup(
    {
      supplierId: new FormControl(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1)],
      }),
      receivingLocationId: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      orderDate: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      expectedDeliveryDate: new FormControl('', { nonNullable: true }),
      items: new FormArray<PurchaseItemFormGroup>([]),
      taxAmount: new FormControl(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
      discountAmount: new FormControl(0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
      notes: new FormControl('', { nonNullable: true }),
    },
    { validators: [this.expectedDeliveryValidator()] },
  );

  private readonly formValue = toSignal(this.purchaseOrderForm.valueChanges, {
    initialValue: this.purchaseOrderForm.getRawValue(),
  });

  readonly subtotal = computed(() =>
    this.roundMoney(
      (this.formValue().items ?? []).reduce(
        (total, item) =>
          total + this.validNumber(item.quantity ?? 0) * this.validNumber(item.purchasePrice ?? 0),
        0,
      ),
    ),
  );

  readonly grandTotal = computed(() =>
    this.roundMoney(
      Math.max(
        0,
        this.subtotal() +
          this.validNumber(this.formValue().taxAmount ?? 0) -
          this.validNumber(this.formValue().discountAmount ?? 0),
      ),
    ),
  );

  constructor() {
    const purchaseOrder = this.purchaseOrder();
    if (purchaseOrder?.status === 'draft') {
      this.populateForm(purchaseOrder);
    }

    effect(() => {
      const storeId = this.selectedStoreId();
      if (storeId === this.previousStoreId) return;

      this.previousStoreId = storeId;
      this.storeService.showToast(
        'The selected store changed. The purchase order edit was closed for safety.',
        'warning',
      );
      void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
    });
  }

  get items(): FormArray<PurchaseItemFormGroup> {
    return this.purchaseOrderForm.controls.items;
  }

  addItem(): void {
    this.items.push(this.createItemGroup());
    this.refreshDuplicateErrors();
  }

  removeItem(index: number): void {
    if (this.items.length === 1) return;
    this.items.removeAt(index);
    this.refreshDuplicateErrors();
  }

  onProductChange(index: number): void {
    const group = this.items.at(index);
    group.controls.variantId.setValue('');
    this.updateVariantValidator(group, this.selectedProduct(index), index);
    this.clearControlError(group.controls.productId, 'unavailable');
    this.clearControlError(group.controls.variantId, 'unavailable');
    this.refreshDuplicateErrors();
  }

  onVariantChange(index: number): void {
    this.clearControlError(this.items.at(index).controls.variantId, 'unavailable');
    this.refreshDuplicateErrors();
  }

  availableVariants(index: number): ProductVariant[] {
    const product = this.selectedProduct(index);
    const originalItem = this.originalItem(index);
    return (product?.variants ?? []).filter(
      (variant) =>
        variant.id !== undefined &&
        variant.id !== null &&
        (variant.status === 'active' ||
          (originalItem !== undefined &&
            originalItem.productId === product?.id &&
            String(variant.id) === String(originalItem.variantId))),
    );
  }

  productRequiresVariant(index: number): boolean {
    const product = this.selectedProduct(index);
    const originalItem = this.originalItem(index);
    return (
      (product?.variants?.length ?? 0) > 0 ||
      (originalItem !== undefined &&
        originalItem.productId === product?.id &&
        originalItem.variantId !== null)
    );
  }

  selectedProduct(index: number): Product | undefined {
    const productId = this.items.at(index).controls.productId.value;
    return this.productOptions().find((product) => product.id === productId);
  }

  selectedVariant(index: number): ProductVariant | undefined {
    const variantId = this.items.at(index).controls.variantId.value;
    if (!variantId) return undefined;
    return this.availableVariants(index).find((variant) => String(variant.id) === variantId);
  }

  selectedSupplier(): Supplier | undefined {
    const supplierId = this.purchaseOrderForm.controls.supplierId.value;
    return this.supplierOptions().find((supplier) => supplier.id === supplierId);
  }

  currentSupplierUnavailable(purchaseOrder: PurchaseOrder): boolean {
    return !this.supplierOptions().some((supplier) => supplier.id === purchaseOrder.supplierId);
  }

  originalProductUnavailable(index: number): PurchaseOrderItem | undefined {
    const originalItem = this.originalItem(index);
    if (!originalItem || this.items.at(index).controls.productId.value !== originalItem.productId) {
      return undefined;
    }
    return this.productOptions().some((product) => product.id === originalItem.productId)
      ? undefined
      : originalItem;
  }

  originalVariantUnavailable(index: number): PurchaseOrderItem | undefined {
    const originalItem = this.originalItem(index);
    if (
      !originalItem?.variantId ||
      this.items.at(index).controls.variantId.value !== String(originalItem.variantId)
    ) {
      return undefined;
    }
    return this.availableVariants(index).some(
      (variant) => String(variant.id) === String(originalItem.variantId),
    )
      ? undefined
      : originalItem;
  }

  itemSku(index: number): string {
    const product = this.selectedProduct(index);
    const originalItem = this.originalItem(index);
    if (!product) return originalItem?.sku ?? '—';
    if (this.productRequiresVariant(index)) {
      return this.selectedVariant(index)?.sku ?? originalItem?.sku ?? '—';
    }
    return product.sku;
  }

  variantLabel(variant: ProductVariant): string {
    const label = variant.attributes
      .map((attribute) => attribute.value.trim())
      .filter(Boolean)
      .join(' / ');
    return label || variant.sku;
  }

  lineTotal(index: number): number {
    const item = this.formValue().items?.[index];
    if (!item) return 0;
    return this.roundMoney(
      this.validNumber(item.quantity ?? 0) * this.validNumber(item.purchasePrice ?? 0),
    );
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
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

  hasError(control: AbstractControl, errorName: string): boolean {
    return control.touched && control.hasError(errorName);
  }

  itemHasError(index: number, controlName: PurchaseItemControlName, errorName: string): boolean {
    return this.hasError(this.items.at(index).controls[controlName], errorName);
  }

  updateDraft(purchaseOrder: PurchaseOrder): void {
    if (this.isSubmitting()) return;
    this.submissionError.set('');

    const currentPurchaseOrder = this.purchaseOrder();
    if (
      !currentPurchaseOrder ||
      currentPurchaseOrder.id !== purchaseOrder.id ||
      currentPurchaseOrder.status !== 'draft'
    ) {
      this.submissionError.set('This purchase order is no longer available for draft editing.');
      return;
    }

    this.synchronizeVariantValidators();
    this.refreshDuplicateErrors();
    if (this.purchaseOrderForm.invalid) {
      this.purchaseOrderForm.markAllAsTouched();
      return;
    }

    const request = this.buildRequest(currentPurchaseOrder);
    if (!request) {
      this.purchaseOrderForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    try {
      const updated = this.purchaseOrderService.updatePurchaseOrder(
        currentPurchaseOrder.id,
        request,
      );
      if (!updated) {
        throw new Error('The purchase order could not be found.');
      }
      this.storeService.showToast(`${updated.poNumber} updated successfully.`, 'success');
      void this.router.navigate([
        '/store-admin/purchasing/purchase-orders',
        updated.id,
      ]);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to update the purchase order.';
      this.submissionError.set(message);
      this.storeService.showToast(message, 'danger');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  cancel(): void {
    if (this.purchaseOrderId) {
      void this.router.navigate([
        '/store-admin/purchasing/purchase-orders',
        this.purchaseOrderId,
      ]);
      return;
    }
    this.backToPurchaseOrders();
  }

  viewPurchaseOrder(): void {
    this.cancel();
  }

  backToPurchaseOrders(): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
  }

  manageSuppliers(): void {
    void this.router.navigate(['/store-admin/purchasing/suppliers']);
  }

  manageProducts(): void {
    void this.router.navigate(['/store-admin/products']);
  }

  private populateForm(purchaseOrder: PurchaseOrder): void {
    this.purchaseOrderForm.patchValue(
      {
        supplierId: purchaseOrder.supplierId,
        receivingLocationId: purchaseOrder.receivingLocationId,
        orderDate: purchaseOrder.orderDate,
        expectedDeliveryDate: purchaseOrder.expectedDeliveryDate ?? '',
        taxAmount: purchaseOrder.taxAmount,
        discountAmount: purchaseOrder.discountAmount,
        notes: purchaseOrder.notes ?? '',
      },
      { emitEvent: false },
    );

    this.items.clear({ emitEvent: false });
    for (const item of purchaseOrder.items) {
      this.items.push(this.createItemGroup(item), { emitEvent: false });
    }
    this.synchronizeVariantValidators();
    this.purchaseOrderForm.updateValueAndValidity();
  }

  private buildRequest(purchaseOrder: PurchaseOrder): UpdatePurchaseOrderRequest | undefined {
    const value = this.purchaseOrderForm.getRawValue();
    const supplier = this.supplierOptions().find((item) => item.id === value.supplierId);
    const receivingLocation = this.receivingLocations().find(
      (item) => item.key === value.receivingLocationId && item.active,
    );

    if (!supplier) {
      this.setControlError(this.purchaseOrderForm.controls.supplierId, 'unavailable');
    }
    if (!receivingLocation) {
      this.setControlError(this.purchaseOrderForm.controls.receivingLocationId, 'unavailable');
    }

    const items = this.buildItemRequests(purchaseOrder);
    if (!supplier || !receivingLocation || !items) {
      this.submissionError.set(
        'Some selections are no longer available for the selected store. Review the highlighted fields.',
      );
      return undefined;
    }

    return {
      supplierId: supplier.id,
      supplierName: supplier.name,
      receivingLocationId: receivingLocation.key,
      receivingLocationName: receivingLocation.name,
      receivingLocationType: receivingLocation.type,
      orderDate: value.orderDate,
      expectedDeliveryDate: value.expectedDeliveryDate || undefined,
      items,
      taxAmount: value.taxAmount,
      discountAmount: value.discountAmount,
      notes: value.notes.trim() || undefined,
    };
  }

  private buildItemRequests(
    purchaseOrder: PurchaseOrder,
  ): UpdatePurchaseOrderItemRequest[] | undefined {
    const requests: UpdatePurchaseOrderItemRequest[] = [];
    let valid = true;

    this.items.controls.forEach((group, index) => {
      const value = group.getRawValue();
      const product = this.productOptions().find((item) => item.id === value.productId);
      const requiresVariant = this.productRequiresVariant(index);
      const variant = requiresVariant
        ? this.availableVariants(index).find((item) => String(item.id) === value.variantId)
        : undefined;

      if (!product) {
        this.setControlError(group.controls.productId, 'unavailable');
        valid = false;
        return;
      }
      if (requiresVariant && !variant) {
        this.setControlError(group.controls.variantId, 'unavailable');
        valid = false;
        return;
      }

      const originalItem = value.itemId
        ? purchaseOrder.items.find((item) => item.id === value.itemId)
        : undefined;
      const selectionUnchanged =
        originalItem?.productId === product.id &&
        String(originalItem.variantId ?? '') === String(variant?.id ?? '');
      const preservedSnapshot = selectionUnchanged ? originalItem : undefined;

      requests.push({
        id: value.itemId || undefined,
        productId: product.id,
        variantId: variant?.id ?? null,
        productName: preservedSnapshot?.productName ?? product.name,
        variantName: preservedSnapshot
          ? preservedSnapshot.variantName
          : variant
            ? this.variantLabel(variant)
            : undefined,
        sku: preservedSnapshot?.sku ?? variant?.sku ?? product.sku,
        quantity: value.quantity,
        purchasePrice: value.purchasePrice,
      });
    });

    return valid ? requests : undefined;
  }

  private synchronizeVariantValidators(): void {
    this.items.controls.forEach((group, index) =>
      this.updateVariantValidator(group, this.selectedProduct(index), index),
    );
  }

  private updateVariantValidator(
    group: PurchaseItemFormGroup,
    product: Product | undefined,
    index: number,
  ): void {
    const variantControl = group.controls.variantId;
    const originalItem = this.originalItem(index);
    const requiresVariant =
      (product?.variants?.length ?? 0) > 0 ||
      (originalItem !== undefined &&
        originalItem.productId === product?.id &&
        originalItem.variantId !== null);
    if (requiresVariant) {
      variantControl.setValidators([Validators.required]);
    } else {
      variantControl.clearValidators();
    }
    variantControl.updateValueAndValidity({ emitEvent: false });
  }

  private refreshDuplicateErrors(): void {
    for (const group of this.items.controls) {
      this.clearControlError(group.controls.productId, 'duplicateItem');
      this.clearControlError(group.controls.variantId, 'duplicateItem');
    }

    const itemKeys = new Map<string, number>();
    this.items.controls.forEach((group, index) => {
      const product = this.selectedProduct(index);
      if (!product) return;

      const requiresVariant = this.productRequiresVariant(index);
      const variantId = group.controls.variantId.value;
      if (requiresVariant && !variantId) return;

      const key = `${product.id}::${requiresVariant ? variantId : 'simple'}`;
      const existingIndex = itemKeys.get(key);
      if (existingIndex === undefined) {
        itemKeys.set(key, index);
        return;
      }

      const duplicateControl = requiresVariant
        ? group.controls.variantId
        : group.controls.productId;
      this.setControlError(duplicateControl, 'duplicateItem');
    });
  }

  private originalItem(index: number): PurchaseOrderItem | undefined {
    const itemId = this.items.at(index).controls.itemId.value;
    return itemId
      ? this.purchaseOrder()?.items.find((item) => item.id === itemId)
      : undefined;
  }

  private createItemGroup(item?: PurchaseOrderItem): PurchaseItemFormGroup {
    return new FormGroup({
      itemId: new FormControl(item?.id ?? '', { nonNullable: true }),
      productId: new FormControl(item?.productId ?? '', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      variantId: new FormControl(item?.variantId === null ? '' : String(item?.variantId ?? ''), {
        nonNullable: true,
      }),
      quantity: new FormControl(item?.quantity ?? 1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      purchasePrice: new FormControl(item?.purchasePrice ?? 0, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(0)],
      }),
    });
  }

  private expectedDeliveryValidator(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const orderDate = control.get('orderDate')?.value;
      const expectedDate = control.get('expectedDeliveryDate')?.value;
      if (typeof orderDate !== 'string' || typeof expectedDate !== 'string' || !expectedDate) {
        return null;
      }
      return expectedDate < orderDate ? { deliveryBeforeOrder: true } : null;
    };
  }

  private setControlError(control: AbstractControl, errorName: string): void {
    control.setErrors({ ...(control.errors ?? {}), [errorName]: true });
    control.markAsTouched();
  }

  private clearControlError(control: AbstractControl, errorName: string): void {
    if (!control.hasError(errorName)) return;
    const errors = { ...(control.errors ?? {}) };
    delete errors[errorName];
    control.setErrors(Object.keys(errors).length ? errors : null);
  }

  private validNumber(value: number): number {
    return Number.isFinite(value) && value >= 0 ? value : 0;
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private parsePurchaseOrderId(value: string | null): string | null {
    const id = value?.trim();
    return id || null;
  }
}
