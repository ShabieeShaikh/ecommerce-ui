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
import { Router } from '@angular/router';

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
  CreatePurchaseOrderItemRequest,
  CreatePurchaseOrderRequest,
} from '../models/purchase-order.model';

type PurchaseItemFormGroup = FormGroup<{
  productId: FormControl<string>;
  variantId: FormControl<string>;
  quantity: FormControl<number>;
  purchasePrice: FormControl<number>;
}>;

type PurchaseItemControlName = keyof PurchaseItemFormGroup['controls'];

@Component({
  selector: 'app-create-purchase-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './create-purchase-order.html',
  styleUrl: './create-purchase-order.css',
})
export class CreatePurchaseOrder {
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

  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly isSubmitting = signal(false);
  readonly submissionError = signal('');
  readonly storeContextMessage = signal('');

  readonly activeSuppliers = computed(() =>
    this.supplierService
      .getSuppliersByStore(this.selectedStoreId())
      .filter((supplier) => supplier.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name)),
  );

  readonly receivingLocations = computed<InventoryLocation[]>(() => {
    const locations = this.inventoryLocationService.getLocations(this.selectedStoreId());
    const warehouses = locations.filter((location) => location.type === 'warehouse');

    return warehouses.length > 0
      ? warehouses
      : locations.filter((location) => location.type === 'store');
  });

  readonly activeProducts = computed(() =>
    this.productService
      .getProductsByStore(this.selectedStoreId())
      .filter((product) => product.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name)),
  );

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
      orderDate: new FormControl(this.today(), {
        nonNullable: true,
        validators: [Validators.required],
      }),
      expectedDeliveryDate: new FormControl('', { nonNullable: true }),
      items: new FormArray<PurchaseItemFormGroup>([this.createItemGroup()]),
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
    effect(() => {
      const storeId = this.selectedStoreId();
      if (storeId === this.previousStoreId) return;

      this.previousStoreId = storeId;
      this.resetForStoreChange();
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
    this.updateVariantValidator(group, this.selectedProduct(index));
    this.clearControlError(group.controls.productId, 'unavailable');
    this.clearControlError(group.controls.variantId, 'unavailable');
    this.refreshDuplicateErrors();
  }

  onVariantChange(index: number): void {
    this.clearControlError(this.items.at(index).controls.variantId, 'unavailable');
    this.refreshDuplicateErrors();
  }

  availableVariants(index: number): ProductVariant[] {
    return (this.selectedProduct(index)?.variants ?? []).filter(
      (variant) => variant.status === 'active' && variant.id !== undefined && variant.id !== null,
    );
  }

  productRequiresVariant(index: number): boolean {
    return (this.selectedProduct(index)?.variants?.length ?? 0) > 0;
  }

  selectedProduct(index: number): Product | undefined {
    const productId = this.items.at(index).controls.productId.value;
    return this.activeProducts().find((product) => product.id === productId);
  }

  selectedVariant(index: number): ProductVariant | undefined {
    const variantId = this.items.at(index).controls.variantId.value;
    if (!variantId) return undefined;
    return this.availableVariants(index).find((variant) => String(variant.id) === variantId);
  }

  selectedSupplier(): Supplier | undefined {
    const supplierId = this.purchaseOrderForm.controls.supplierId.value;
    return this.activeSuppliers().find((supplier) => supplier.id === supplierId);
  }

  itemSku(index: number): string {
    const product = this.selectedProduct(index);
    if (!product) return '—';
    if (this.productRequiresVariant(index)) return this.selectedVariant(index)?.sku ?? '—';
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

  saveDraft(): void {
    this.submissionError.set('');
    this.storeContextMessage.set('');
    this.synchronizeVariantValidators();
    this.refreshDuplicateErrors();

    if (this.purchaseOrderForm.invalid) {
      this.purchaseOrderForm.markAllAsTouched();
      return;
    }

    const request = this.buildRequest();
    if (!request) {
      this.purchaseOrderForm.markAllAsTouched();
      return;
    }

    this.isSubmitting.set(true);
    try {
      const created = this.purchaseOrderService.createPurchaseOrder(request);
      this.storeService.showToast(`${created.poNumber} saved as draft.`, 'success');
      void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unable to save the purchase order.';
      this.submissionError.set(message);
      this.storeService.showToast(message, 'danger');
    } finally {
      this.isSubmitting.set(false);
    }
  }

  cancel(): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
  }

  manageSuppliers(): void {
    void this.router.navigate(['/store-admin/purchasing/suppliers']);
  }

  manageProducts(): void {
    void this.router.navigate(['/store-admin/products']);
  }

  private buildRequest(): CreatePurchaseOrderRequest | undefined {
    const storeId = this.selectedStoreId();
    const value = this.purchaseOrderForm.getRawValue();
    const supplier = this.activeSuppliers().find((item) => item.id === value.supplierId);
    const receivingLocation = this.receivingLocations().find(
      (item) => item.key === value.receivingLocationId,
    );

    if (!supplier) {
      this.setControlError(this.purchaseOrderForm.controls.supplierId, 'unavailable');
    }
    if (!receivingLocation) {
      this.setControlError(this.purchaseOrderForm.controls.receivingLocationId, 'unavailable');
    }

    const items = this.buildItemRequests();
    if (!storeId || !supplier || !receivingLocation || !items) {
      this.submissionError.set(
        'Some selections are no longer available for the selected store. Review the highlighted fields.',
      );
      return undefined;
    }

    return {
      storeId,
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

  private buildItemRequests(): CreatePurchaseOrderItemRequest[] | undefined {
    const requests: CreatePurchaseOrderItemRequest[] = [];
    let valid = true;

    this.items.controls.forEach((group, index) => {
      const value = group.getRawValue();
      const product = this.activeProducts().find((item) => item.id === value.productId);
      const variant = this.productRequiresVariant(index)
        ? this.availableVariants(index).find((item) => String(item.id) === value.variantId)
        : undefined;

      if (!product) {
        this.setControlError(group.controls.productId, 'unavailable');
        valid = false;
        return;
      }
      if (this.productRequiresVariant(index) && !variant) {
        this.setControlError(group.controls.variantId, 'unavailable');
        valid = false;
        return;
      }

      requests.push({
        productId: product.id,
        variantId: variant?.id ?? null,
        productName: product.name,
        variantName: variant ? this.variantLabel(variant) : undefined,
        sku: variant?.sku ?? product.sku,
        quantity: value.quantity,
        purchasePrice: value.purchasePrice,
      });
    });

    return valid ? requests : undefined;
  }

  private synchronizeVariantValidators(): void {
    this.items.controls.forEach((group, index) =>
      this.updateVariantValidator(group, this.selectedProduct(index)),
    );
  }

  private updateVariantValidator(group: PurchaseItemFormGroup, product?: Product): void {
    const variantControl = group.controls.variantId;
    if ((product?.variants?.length ?? 0) > 0) {
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

  private resetForStoreChange(): void {
    this.purchaseOrderForm.reset({
      supplierId: 0,
      receivingLocationId: '',
      orderDate: this.today(),
      expectedDeliveryDate: '',
      taxAmount: 0,
      discountAmount: 0,
      notes: '',
    });
    this.items.clear({ emitEvent: false });
    this.items.push(this.createItemGroup(), { emitEvent: false });
    this.purchaseOrderForm.updateValueAndValidity();
    this.submissionError.set('');
    this.storeContextMessage.set(
      'The selected store changed. Store-specific selections and purchase items were reset for safety.',
    );
  }

  private createItemGroup(): PurchaseItemFormGroup {
    return new FormGroup({
      productId: new FormControl('', {
        nonNullable: true,
        validators: [Validators.required],
      }),
      variantId: new FormControl('', { nonNullable: true }),
      quantity: new FormControl(1, {
        nonNullable: true,
        validators: [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)],
      }),
      purchasePrice: new FormControl(0, {
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

  private today(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
