import { TitleCasePipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  FormRecord,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { EMPTY, distinctUntilChanged, from, map, of, startWith, switchMap } from 'rxjs';
import { ProductStatus, ProductUpsert } from '../../../models/admin.models';
import {
  CategoryAttributeDefinition,
  ProductAttributeData,
  ProductAttributeValue,
  ProductCategoryOption,
  ProductVariant,
  ProductVariantAttribute,
  ProductVariantStatus,
} from '../../../models/product-catalog.models';
import { CategoryService } from '../../../services/category.service';
import { BrandService } from '../../../services/brand.service';
import { ProductService } from '../../../services/product.service';
import { StoreService } from '../../../services/store.service';
import { DynamicProductField } from '../dynamic-product-field/dynamic-product-field';
import { BarcodeDisplay } from '../../shared/barcode-display/barcode-display';
import {
  generateVariantCombinations,
  variantCombinationKey,
} from '../../../utils/product-variant.utils';

type ProductField =
  | 'name'
  | 'sku'
  | 'category'
  | 'brand'
  | 'shortDescription'
  | 'description'
  | 'price'
  | 'comparePrice'
  | 'taxClass'
  | 'status'
  | 'barcode';
type SaveMode = 'draft' | 'create';
type VariantField = 'sku' | 'barcode' | 'priceOverride' | 'imageUrl' | 'status';
type ProductVariantGroup = FormGroup<{
  id: FormControl<string | number | null>;
  sku: FormControl<string>;
  barcode: FormControl<string>;
  priceOverride: FormControl<number | null>;
  imageUrl: FormControl<string>;
  imageError: FormControl<string>;
  status: FormControl<ProductVariantStatus>;
  attributes: FormControl<ProductVariantAttribute[]>;
}>;

const TAX_CLASSES = [
  { value: '', label: 'Select tax class' },
  { value: 'standard', label: 'Standard Rate' },
  { value: 'reduced', label: 'Reduced Rate' },
  { value: 'zero', label: 'Zero Rated' },
  { value: 'exempt', label: 'Tax Exempt' },
];

function trimmedRequired(control: AbstractControl): { required: true } | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true };
}

function maxWords(maximum: number) {
  return (control: AbstractControl): { maxWords: { maximum: number; actual: number } } | null => {
    const actual = String(control.value ?? '')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
    return actual > maximum ? { maxWords: { maximum, actual } } : null;
  };
}

@Component({
  selector: 'app-product-form',
  imports: [ReactiveFormsModule, RouterLink, TitleCasePipe, DynamicProductField, BarcodeDisplay],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css',
})
export class ProductForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storeService = inject(StoreService);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly brandService = inject(BrandService);
  private readonly destroyRef = inject(DestroyRef);

  @ViewChild('descriptionEditor') private descriptionEditor?: ElementRef<HTMLDivElement>;

  readonly brands = computed(() => {
    const active = this.brandService
      .brands()
      .filter((brand) => brand.status === 'active')
      .map((brand) => brand.name);
    const existing = this.editingProduct?.brand;
    return existing && !active.includes(existing) ? [existing, ...active] : active;
  });
  readonly taxClasses = TAX_CLASSES;
  readonly categories = signal<ProductCategoryOption[]>([]);
  readonly categoryAttributes = signal<CategoryAttributeDefinition[]>([]);
  readonly specificationAttributes = computed(() =>
    this.categoryAttributes().filter((attribute) => !attribute.isVariantAttribute),
  );
  readonly variantAttributes = computed(() =>
    this.categoryAttributes().filter((attribute) => attribute.isVariantAttribute),
  );
  readonly productId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.productId !== null;
  readonly editingProduct = this.productId
    ? this.productService.getProductById(this.productId)
    : undefined;
  readonly contextStoreId = signal(
    this.editingProduct?.storeId ?? this.storeService.selectedStore().id,
  );
  readonly contextStore = computed(
    () =>
      this.storeService.getStoreById(this.contextStoreId()) ?? this.storeService.selectedStore(),
  );
  readonly submitted = signal(false);
  readonly isSaving = signal(false);
  readonly isProcessingMedia = signal(false);
  readonly images = signal<string[]>(
    this.editingProduct?.imageUrls?.length
      ? this.editingProduct.imageUrls
      : this.editingProduct?.imageUrl
        ? [this.editingProduct.imageUrl]
        : [],
  );
  readonly imageError = signal('');
  readonly skuError = signal('');
  readonly barcodeError = signal('');
  readonly priceError = signal('');
  readonly variantError = signal('');
  readonly variantGenerationStale = signal(false);

  readonly attributeControls = new FormRecord<FormControl<ProductAttributeData>>({});
  readonly variantSelectionControls = new FormRecord<FormControl<string[]>>({});
  readonly variantRows = new FormArray<ProductVariantGroup>([]);
  private loadedCategoryId = '';
  readonly productForm = this.formBuilder.group({
    name: [
      this.editingProduct?.name ?? '',
      [trimmedRequired, Validators.minLength(2), Validators.maxLength(100)],
    ],
    sku: [
      this.editingProduct?.sku ?? '',
      [trimmedRequired, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{2,39}$/)],
    ],
    category: [
      this.editingProduct?.categoryId ?? this.editingProduct?.category ?? '',
      [trimmedRequired],
    ],
    brand: [this.editingProduct?.brand ?? '', [Validators.maxLength(80)]],
    shortDescription: [this.editingProduct?.shortDescription ?? '', [maxWords(100)]],
    description: [this.editingProduct?.description ?? '', [Validators.maxLength(5000)]],
    price: [this.editingProduct?.price ?? 0, [Validators.required, Validators.min(0)]],
    comparePrice: [this.editingProduct?.comparePrice ?? 0, [Validators.min(0)]],
    taxClass: [this.editingProduct?.taxClass ?? ''],
    status: [(this.editingProduct?.status ?? 'draft') as ProductStatus, [Validators.required]],
    barcode: [this.editingProduct?.barcode ?? '', [Validators.pattern(/^[A-Za-z0-9._-]{4,40}$/)]],
    attributes: this.attributeControls,
    variantSelections: this.variantSelectionControls,
    variants: this.variantRows,
  });

  constructor() {
    if (this.isEditMode && !this.editingProduct) {
      this.storeService.showToast('The selected product could not be found.', 'warning');
      this.router.navigate(['/store-admin/products']);
      return;
    }

    if (
      this.editingProduct &&
      this.storeService.selectedStore().id !== this.editingProduct.storeId
    ) {
      this.storeService.changeSelectedStore(this.editingProduct.storeId);
    }

    this.categoryService
      .getCategories()
      .pipe(takeUntilDestroyed())
      .subscribe((categories) => this.categories.set(categories));

    this.productForm.controls.sku.valueChanges
      .pipe(startWith(this.productForm.controls.sku.value), takeUntilDestroyed())
      .subscribe((sku) => {
        this.productForm.controls.barcode.setValue(this.barcodeFromSku(sku), { emitEvent: false });
        this.barcodeError.set('');
      });

    this.productForm.controls.category.valueChanges
      .pipe(
        startWith(this.productForm.controls.category.value),
        distinctUntilChanged(),
        switchMap((categoryId) => {
          const hasVariantWork =
            this.variantRows.length > 0 ||
            Object.values(this.variantSelectionControls.controls).some(
              (control) => control.value.length > 0,
            );
          const confirmation =
            this.loadedCategoryId && categoryId !== this.loadedCategoryId && hasVariantWork
              ? from(
                this.confirmAction(
                  'Change Category?',
                  'Changing the category will clear the current product variants.',
                  'Change Category',
                ),
              )
              : of(true);

          return confirmation.pipe(
            switchMap((confirmed) => {
              if (!confirmed) {
                this.productForm.controls.category.setValue(this.loadedCategoryId, {
                  emitEvent: false,
                });
                return EMPTY;
              }
              return this.categoryService
                .getCategoryAttributes(categoryId)
                .pipe(map((definitions) => ({ categoryId, definitions })));
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe(({ categoryId, definitions }) => {
        this.loadedCategoryId = categoryId;
        this.rebuildAttributeControls(definitions);
      });

    effect(() => {
      const selectedStore = this.storeService.selectedStore();
      const currentStoreId = untracked(() => this.contextStoreId());
      if (selectedStore.id === currentStoreId) return;

      if (this.isEditMode) {
        untracked(() => this.storeService.changeSelectedStore(currentStoreId));
        return;
      }

      void this.handleStoreSwitch(selectedStore.id, selectedStore.name, currentStoreId);
    });
  }

  fieldInvalid(field: ProductField): boolean {
    const control = this.productForm.controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  fieldError(field: ProductField): string {
    const control = this.productForm.controls[field];
    if (!this.fieldInvalid(field)) return '';
    if (control.hasError('required')) return 'This field is required.';
    if (control.hasError('minlength')) return 'Enter at least 2 characters.';
    if (control.hasError('maxWords')) return 'Use no more than 100 words.';
    if (control.hasError('maxlength')) return 'This value is too long.';
    if (control.hasError('pattern'))
      return field === 'sku'
        ? 'Use 3-40 letters, numbers, periods, underscores, or hyphens.'
        : 'Use at least 4 letters, numbers, periods, underscores, or hyphens.';
    if (control.hasError('min')) return 'Enter zero or a positive value.';
    return 'Check this value and try again.';
  }

  getAttributeControl(key: string): FormControl<ProductAttributeData> {
    return this.attributeControls.controls[key];
  }

  wordCount(value: string): number {
    return value.trim() ? value.trim().split(/\s+/).length : 0;
  }

  specificationsInvalid(): boolean {
    return this.attributeControls.invalid && (this.attributeControls.touched || this.submitted());
  }

  variantValueSelected(attributeKey: string, value: string): boolean {
    return this.variantSelectionControls.controls[attributeKey]?.value.includes(value) ?? false;
  }

  toggleVariantValue(definition: CategoryAttributeDefinition, value: string): void {
    const control = this.variantSelectionControls.controls[definition.key];
    if (!control) return;
    const selected = control.value.includes(value)
      ? control.value.filter((item) => item !== value)
      : [...control.value, value];
    control.setValue(selected);
    control.markAsTouched();
    this.variantGenerationStale.set(this.variantRows.length > 0);
    this.variantError.set('');
  }

  variantSelectionInvalid(definition: CategoryAttributeDefinition): boolean {
    const control = this.variantSelectionControls.controls[definition.key];
    return !!control && control.invalid && (control.touched || this.submitted());
  }

  async generateVariants(): Promise<void> {
    this.variantAttributes().forEach((definition) =>
      this.variantSelectionControls.controls[definition.key]?.markAsTouched(),
    );
    const missingRequired = this.variantAttributes().some(
      (definition) =>
        definition.required &&
        !this.variantSelectionControls.controls[definition.key]?.value.length,
    );
    if (missingRequired) {
      this.variantError.set('Select at least one value for every required variant attribute.');
      return;
    }

    const selections = Object.fromEntries(
      this.variantAttributes().map((definition) => [
        definition.key,
        this.variantSelectionControls.controls[definition.key]?.value ?? [],
      ]),
    );
    const combinations = generateVariantCombinations(this.variantAttributes(), selections);
    if (!combinations.length) {
      this.variantError.set('Select at least one variant value before generating combinations.');
      return;
    }

    const existing = new Map(
      this.variantRows.controls.map((group) => [
        variantCombinationKey(group.controls.attributes.value),
        group.getRawValue(),
      ]),
    );
    const nextKeys = new Set(combinations.map(variantCombinationKey));
    const removedSaved = this.variantRows.controls.filter(
      (group) =>
        group.controls.id.value !== null &&
        !nextKeys.has(variantCombinationKey(group.controls.attributes.value)),
    );
    if (
      removedSaved.length &&
      !(await this.confirmAction(
        'Regenerate Variants?',
        `${removedSaved.length} saved variant${removedSaved.length === 1 ? '' : 's'} will be removed.`,
        'Regenerate',
      ))
    ) {
      this.restoreSelectionsFromVariants(
        this.variantRows.controls.map((group) => group.controls.attributes.value),
      );
      return;
    }

    this.variantRows.clear();
    combinations.forEach((attributes) => {
      const previous = existing.get(variantCombinationKey(attributes));
      this.variantRows.push(this.createVariantGroup(attributes, previous));
    });
    this.variantGenerationStale.set(false);
    this.variantError.set('');
  }

  async removeVariant(index: number): Promise<void> {
    const group = this.variantRows.at(index);
    if (
      group.controls.id.value !== null &&
      !(await this.confirmAction(
        'Remove Variant?',
        `Remove saved variant "${this.variantName(group.controls.attributes.value)}"?`,
        'Remove',
      ))
    )
      return;
    this.variantRows.removeAt(index);
    this.variantError.set('');
  }

  variantName(attributes: readonly ProductVariantAttribute[]): string {
    return attributes.map((attribute) => attribute.value).join(' / ');
  }

  variantFieldInvalid(index: number, field: VariantField): boolean {
    const control = this.variantRows.at(index).controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  normalizeVariantSku(index: number): void {
    const control = this.variantRows.at(index).controls.sku;
    control.setValue(control.value.trim().toUpperCase());
    this.variantError.set('');
  }

  onVariantPriceInput(index: number, event: Event): void {
    const rawValue = (event.target as HTMLInputElement).value;
    this.variantRows.at(index).controls.priceOverride.setValue(
      rawValue === '' ? null : Number(rawValue),
    );
  }

  private async handleStoreSwitch(
    selectedStoreId: string,
    selectedStoreName: string,
    currentStoreId: string,
  ): Promise<void> {
    const canSwitch =
      !this.productForm.dirty ||
      (await this.confirmAction(
        'Switch Store?',
        `Switch this product to "${selectedStoreName}"? Entered catalog details and media will be retained.`,
        'Switch Store',
      ));
    if (!canSwitch) {
      untracked(() => this.storeService.changeSelectedStore(currentStoreId));
      return;
    }

    untracked(() => {
      this.contextStoreId.set(selectedStoreId);
      this.skuError.set('');
      this.barcodeError.set('');
    });
  }

  private async confirmAction(
    title: string,
    text: string,
    confirmButtonText: string,
  ): Promise<boolean> {
    const result = await Swal.fire({
      title,
      text,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText,
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#6437e8',
      cancelButtonColor: '#667085',
      reverseButtons: true,
    });
    return result.isConfirmed;
  }

  barcodeFromSku(sku: string): string {
    const normalized = sku
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9._-]/g, '');
    return normalized ? `BC-${normalized}` : '';
  }

  async onVariantImageSelected(event: Event, index: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    const group = this.variantRows.at(index);
    group.controls.imageError.setValue('');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      group.controls.imageError.setValue('Choose a PNG, JPG, or WebP image.');
      input.value = '';
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      group.controls.imageError.setValue('Variant image must be 5MB or smaller.');
      input.value = '';
      return;
    }

    this.isProcessingMedia.set(true);
    try {
      group.controls.imageUrl.setValue(await this.resizeForLocalStorage(file));
      group.controls.imageUrl.markAsDirty();
    } catch {
      group.controls.imageError.setValue('The variant image could not be processed.');
    } finally {
      this.isProcessingMedia.set(false);
      input.value = '';
    }
  }

  removeVariantImage(index: number): void {
    const group = this.variantRows.at(index);
    group.controls.imageUrl.setValue('');
    group.controls.imageUrl.markAsDirty();
    group.controls.imageError.setValue('');
  }

  attributePreview(definition: CategoryAttributeDefinition): string {
    const value = this.attributeControls.controls[definition.key]?.value;
    if (Array.isArray(value)) return value.length ? value.join(', ') : 'Not set';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (value === '' || value === null || value === undefined) return 'Not set';
    return `${value}${definition.unit ? ` ${definition.unit}` : ''}`;
  }

  normalizeSku(): void {
    const normalized = this.productForm.controls.sku.value.trim().toUpperCase();
    this.productForm.controls.sku.setValue(normalized, { emitEvent: false });
    this.skuError.set('');
  }

  onDescriptionInput(event: Event): void {
    this.productForm.controls.description.setValue((event.target as HTMLDivElement).innerHTML);
  }

  formatDescription(
    command: 'bold' | 'italic' | 'underline' | 'insertUnorderedList' | 'insertOrderedList',
  ): void {
    this.descriptionEditor?.nativeElement.focus();
    document.execCommand(command);
    if (this.descriptionEditor)
      this.productForm.controls.description.setValue(
        this.descriptionEditor.nativeElement.innerHTML,
      );
  }

  addDescriptionLink(): void {
    const url = prompt('Enter the link URL:');
    if (!url) return;
    this.descriptionEditor?.nativeElement.focus();
    document.execCommand('createLink', false, url);
    if (this.descriptionEditor)
      this.productForm.controls.description.setValue(
        this.descriptionEditor.nativeElement.innerHTML,
      );
  }

  async onImagesSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    await this.processImages(Array.from(input.files ?? []));
    input.value = '';
  }

  onImageDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  async onImageDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    await this.processImages(Array.from(event.dataTransfer?.files ?? []));
  }

  removeImage(index: number): void {
    this.images.update((images) => images.filter((_, imageIndex) => imageIndex !== index));
    this.imageError.set('');
  }

  saveAsDraft(): void {
    this.save('draft');
  }

  createProduct(): void {
    this.save('create');
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
      Number(value) || 0,
    );
  }

  private async save(mode: SaveMode): Promise<void> {
    if (this.isSaving()) return;
    this.submitted.set(true);
    this.normalizeSku();

    const valid = mode === 'draft' ? this.validateDraft() : this.validateProduct();
    if (!valid) {
      this.focusFirstInvalid();
      return;
    }

    this.isSaving.set(true);
    const value = this.productForm.getRawValue();
    const category = this.categories().find((option) => option.id === value.category);
    const productData: ProductUpsert = {
      storeId: this.contextStoreId(),
      name: value.name.trim(),
      sku: value.sku.trim().toUpperCase(),
      categoryId: value.category,
      category: category?.name ?? value.category ?? 'General',
      brand: value.brand.trim() || undefined,
      barcode: value.barcode.trim() || undefined,
      shortDescription: value.shortDescription.trim(),
      taxClass: value.taxClass || undefined,
      price: Number(value.price) || 0,
      comparePrice: Number(value.comparePrice) > 0 ? Number(value.comparePrice) : undefined,
      status: mode === 'draft' ? 'draft' : value.status,
      imageUrl: this.images()[0] ?? '',
      imageUrls: this.images(),
      description: value.description.trim(),
      tags: [value.brand, category?.name ?? value.category]
        .map((item) => item.trim())
        .filter(Boolean),
      attributes: this.buildAttributeValues(),
      variants: this.buildVariants(),
      weight: this.editingProduct?.weight,
      dimensions: this.editingProduct?.dimensions,
    };

    try {
      const product =
        this.isEditMode && this.productId
          ? this.productService.updateCatalogProduct(this.productId, productData)
          : this.productService.createCatalogProduct(productData);
      if (!product) throw new Error('Product not found.');

      const action = this.isEditMode
        ? 'updated'
        : mode === 'draft'
          ? 'saved as a draft'
          : 'created';
      this.storeService.showToast(
        `Product "${product.name}" was ${action} successfully.`,
        'success',
      );
      await this.router.navigate(['/store-admin/products']);
    } catch (error) {
      this.isSaving.set(false);
      await Swal.fire({
        title: 'Unable to Save Product',
        text:
          error instanceof Error
            ? error.message
            : 'The product could not be saved. Review the form and try again.',
        icon: 'error',
        confirmButtonColor: '#6437e8',
      });
    }
  }

  private validateDraft(): boolean {
    const requiredForDraft = [this.productForm.controls.name, this.productForm.controls.sku];
    const validatedOptionalControls: AbstractControl[] = [
      this.productForm.controls.brand,
      this.productForm.controls.shortDescription,
      this.productForm.controls.description,
      this.productForm.controls.price,
      this.productForm.controls.comparePrice,
      this.productForm.controls.barcode,
    ];
    requiredForDraft.forEach((control) => control.markAsTouched());
    validatedOptionalControls
      .filter((control) => control.invalid)
      .forEach((control) => control.markAsTouched());
    this.validatePrices();
    const variantsValid = this.validateVariants(false);
    const unique = this.validateUniqueFields();
    return (
      requiredForDraft.every((control) => control.valid) &&
      validatedOptionalControls.every((control) => control.valid) &&
      !this.priceError() &&
      variantsValid &&
      unique
    );
  }

  private validateProduct(): boolean {
    this.productForm.markAllAsTouched();
    this.imageError.set(this.images().length ? '' : 'Upload at least one product image.');
    this.validatePrices();
    const variantsValid = this.validateVariants(true);
    const unique = this.validateUniqueFields();
    return (
      this.productForm.valid && !this.imageError() && !this.priceError() && variantsValid && unique
    );
  }

  private validatePrices(): void {
    this.priceError.set(
      this.productForm.controls.comparePrice.value > 0 &&
        this.productForm.controls.comparePrice.value > this.productForm.controls.price.value
        ? 'Discount price cannot be greater than the regular price.'
        : '',
    );
  }

  private validateUniqueFields(): boolean {
    const skuAvailable = this.productService.isSkuAvailable(
      this.contextStoreId(),
      this.productForm.controls.sku.value,
      this.productId ?? undefined,
    );
    const barcodeAvailable = this.productService.isBarcodeAvailable(
      this.contextStoreId(),
      this.productForm.controls.barcode.value,
      this.productId ?? undefined,
    );
    this.skuError.set(
      skuAvailable ? '' : 'This SKU is already used by another product in this store.',
    );
    this.barcodeError.set(
      barcodeAvailable ? '' : 'This barcode is already used by another product in this store.',
    );
    return skuAvailable && barcodeAvailable;
  }

  private rebuildAttributeControls(definitions: CategoryAttributeDefinition[]): void {
    Object.keys(this.attributeControls.controls).forEach((key) =>
      this.attributeControls.removeControl(key),
    );
    Object.keys(this.variantSelectionControls.controls).forEach((key) =>
      this.variantSelectionControls.removeControl(key),
    );
    this.variantRows.clear();
    const selectedCategory = this.productForm.controls.category.value;
    const editingCategory = this.editingProduct?.categoryId ?? this.editingProduct?.category;
    const savedValues =
      selectedCategory === editingCategory
        ? new Map(
          (this.editingProduct?.attributes ?? []).map((attribute) => [
            attribute.key,
            attribute.value,
          ]),
        )
        : new Map<string, ProductAttributeData>();

    definitions
      .filter((definition) => !definition.isVariantAttribute)
      .forEach((definition) => {
        const fallback: ProductAttributeData =
          definition.inputType === 'multi-select'
            ? []
            : definition.inputType === 'boolean'
              ? false
              : '';
        const validators = definition.required
          ? [definition.inputType === 'boolean' ? Validators.requiredTrue : Validators.required]
          : [];
        this.attributeControls.addControl(
          definition.key,
          new FormControl<ProductAttributeData>(savedValues.get(definition.key) ?? fallback, {
            nonNullable: true,
            validators,
          }),
        );
      });
    this.categoryAttributes.set(definitions);
    definitions
      .filter((definition) => definition.isVariantAttribute)
      .forEach((definition) => {
        const variantValues = this.savedVariantSelection(
          definition,
          selectedCategory === editingCategory,
        );
        this.variantSelectionControls.addControl(
          definition.key,
          new FormControl<string[]>(variantValues, {
            nonNullable: true,
            validators: definition.required ? [Validators.required] : [],
          }),
        );
      });
    if (selectedCategory === editingCategory) {
      (this.editingProduct?.variants ?? []).forEach((variant) =>
        this.variantRows.push(
          this.createVariantGroup(variant.attributes, this.variantFormValue(variant)),
        ),
      );
    }
    this.variantGenerationStale.set(false);
    this.variantError.set('');
  }

  private buildAttributeValues(): ProductAttributeValue[] {
    const configured = this.specificationAttributes().flatMap((definition) => {
      const value = this.attributeControls.controls[definition.key]?.value;
      const isEmpty =
        value === '' ||
        value === null ||
        value === undefined ||
        (Array.isArray(value) && value.length === 0);
      return isEmpty ? [] : [{ attributeDefinitionId: definition.id, key: definition.key, value }];
    });
    const configuredKeys = new Set(this.categoryAttributes().map((definition) => definition.key));
    const retained = (this.editingProduct?.attributes ?? [])
      .filter((attribute) => !configuredKeys.has(attribute.key))
      .map((attribute) => ({
        ...attribute,
        value: Array.isArray(attribute.value) ? [...attribute.value] : attribute.value,
      }));
    return [...configured, ...retained];
  }

  private buildVariants(): ProductVariant[] {
    return this.variantRows.controls.map((group) => {
      const value = group.getRawValue();
      return {
        id: value.id ?? undefined,
        productId: value.id === null ? undefined : (this.productId ?? undefined),
        sku: value.sku.trim().toUpperCase(),
        barcode: value.barcode.trim() || undefined,
        priceOverride:
          value.priceOverride === null || value.priceOverride === undefined
            ? undefined
            : Number(value.priceOverride),
        imageUrl: value.imageUrl || undefined,
        status: value.status,
        attributes: value.attributes.map((attribute) => ({ ...attribute })),
      };
    });
  }

  private validateVariants(requireSelections: boolean): boolean {
    if (!this.variantAttributes().length) {
      this.variantError.set('');
      return true;
    }
    const missingRequired =
      requireSelections &&
      this.variantAttributes().some(
        (definition) =>
          definition.required &&
          !this.variantSelectionControls.controls[definition.key]?.value.length,
      );
    const selectedCount = this.variantAttributes().reduce(
      (total, definition) =>
        total + (this.variantSelectionControls.controls[definition.key]?.value.length ?? 0),
      0,
    );
    if (missingRequired) {
      this.variantError.set('Select at least one value for every required variant attribute.');
      return false;
    }
    if (selectedCount > 0 && (!this.variantRows.length || this.variantGenerationStale())) {
      this.variantError.set('Generate variants again to apply the selected values.');
      return false;
    }
    if (!this.variantRows.length) {
      this.variantError.set('');
      return true;
    }
    this.variantRows.markAllAsTouched();
    const skus = this.variantRows.controls.map((group) =>
      group.controls.sku.value.trim().toLowerCase(),
    );
    const barcodes = this.variantRows.controls
      .map((group) => group.controls.barcode.value.trim().toLowerCase())
      .filter(Boolean);
    const parentSku = this.productForm.controls.sku.value.trim().toLowerCase();
    if (new Set(skus).size !== skus.length || skus.includes(parentSku)) {
      this.variantError.set(
        'Every variant SKU must be unique and different from the main product SKU.',
      );
      return false;
    }
    if (new Set(barcodes).size !== barcodes.length) {
      this.variantError.set('Variant barcodes must be unique when provided.');
      return false;
    }
    if (this.variantRows.invalid) {
      this.variantError.set('Review the highlighted variant fields.');
      return false;
    }
    this.variantError.set('');
    return true;
  }

  private savedVariantSelection(
    definition: CategoryAttributeDefinition,
    useSavedValues: boolean,
  ): string[] {
    if (!useSavedValues) return [];
    const fromVariants = (this.editingProduct?.variants ?? []).flatMap((variant) =>
      variant.attributes
        .filter((attribute) => attribute.attributeKey === definition.key)
        .map((attribute) => attribute.value),
    );
    if (fromVariants.length) return [...new Set(fromVariants)];
    const legacyValue = this.editingProduct?.attributes?.find(
      (attribute) => attribute.key === definition.key,
    )?.value;
    if (Array.isArray(legacyValue)) return legacyValue.map(String);
    return typeof legacyValue === 'string' || typeof legacyValue === 'number'
      ? [String(legacyValue)]
      : [];
  }

  private createVariantGroup(
    attributes: ProductVariantAttribute[],
    existing?: ReturnType<ProductVariantGroup['getRawValue']>,
  ): ProductVariantGroup {
    const group = new FormGroup({
      id: new FormControl<string | number | null>(existing?.id ?? null),
      sku: new FormControl(existing?.sku ?? this.suggestVariantSku(attributes), {
        nonNullable: true,
        validators: [trimmedRequired, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/)],
      }),
      barcode: new FormControl(
        this.barcodeFromSku(existing?.sku ?? this.suggestVariantSku(attributes)),
        {
          nonNullable: true,
          validators: [Validators.pattern(/^[A-Za-z0-9._-]{4,80}$/)],
        },
      ),
      priceOverride: new FormControl<number | null>(existing?.priceOverride ?? null, [
        Validators.min(0),
      ]),
      imageUrl: new FormControl(existing?.imageUrl ?? '', { nonNullable: true }),
      imageError: new FormControl(existing?.imageError ?? '', { nonNullable: true }),
      status: new FormControl<ProductVariantStatus>(existing?.status ?? 'active', {
        nonNullable: true,
      }),
      attributes: new FormControl(
        attributes.map((attribute) => ({ ...attribute })),
        { nonNullable: true },
      ),
    });
    group.controls.sku.valueChanges
      .pipe(startWith(group.controls.sku.value), takeUntilDestroyed(this.destroyRef))
      .subscribe((sku) =>
        group.controls.barcode.setValue(this.barcodeFromSku(sku), { emitEvent: false }),
      );
    return group;
  }

  private variantFormValue(
    variant: ProductVariant,
  ): ReturnType<ProductVariantGroup['getRawValue']> {
    return {
      id: variant.id ?? null,
      sku: variant.sku,
      barcode: variant.barcode ?? '',
      priceOverride: variant.priceOverride ?? null,
      imageUrl: variant.imageUrl ?? '',
      imageError: '',
      status: variant.status,
      attributes: variant.attributes.map((attribute) => ({ ...attribute })),
    };
  }

  private suggestVariantSku(attributes: readonly ProductVariantAttribute[]): string {
    const base = this.productForm.controls.sku.value.trim().toUpperCase() || 'VAR';
    const tokens = attributes
      .map((attribute) => {
        const compact = attribute.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
        const numeric = compact.match(/^\d+/)?.[0];
        return numeric ?? compact.slice(0, 3);
      })
      .filter(Boolean);
    const root = [base, ...tokens].join('-');
    const used = new Set(
      this.variantRows.controls.map((group) => group.controls.sku.value.toLowerCase()),
    );
    let suggestion = root;
    let sequence = 2;
    while (used.has(suggestion.toLowerCase())) suggestion = `${root}-${sequence++}`;
    return suggestion;
  }

  private restoreSelectionsFromVariants(combinations: readonly ProductVariantAttribute[][]): void {
    this.variantAttributes().forEach((definition) => {
      const selected = combinations.flatMap((attributes) =>
        attributes
          .filter((attribute) => attribute.attributeKey === definition.key)
          .map((attribute) => attribute.value),
      );
      this.variantSelectionControls.controls[definition.key]?.setValue([...new Set(selected)]);
    });
    this.variantGenerationStale.set(false);
  }

  private async processImages(files: File[]): Promise<void> {
    this.imageError.set('');
    if (!files.length) return;
    const availableSlots = 4 - this.images().length;
    if (availableSlots <= 0) {
      this.imageError.set('You can upload up to 4 product images.');
      return;
    }

    const selectedFiles = files.slice(0, availableSlots);
    const invalidType = selectedFiles.find(
      (file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type),
    );
    if (invalidType) {
      this.imageError.set('Choose PNG, JPG, or WebP images only.');
      return;
    }
    const oversized = selectedFiles.find((file) => file.size > 5 * 1024 * 1024);
    if (oversized) {
      this.imageError.set('Each product image must be 5MB or smaller.');
      return;
    }

    this.isProcessingMedia.set(true);
    try {
      const processed = await Promise.all(
        selectedFiles.map((file) => this.resizeForLocalStorage(file)),
      );
      this.images.update((images) => [...images, ...processed]);
    } catch {
      this.imageError.set('One or more images could not be processed.');
    } finally {
      this.isProcessingMedia.set(false);
    }
  }

  private async resizeForLocalStorage(file: File): Promise<string> {
    const source = await this.readFile(file);
    const image = await this.loadImage(source);
    const scale = Math.min(1, 900 / image.naturalWidth, 900 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const type =
      file.type === 'image/png'
        ? 'image/png'
        : file.type === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';
    return canvas.toDataURL(type, 0.78);
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Invalid image.'));
      image.src = source;
    });
  }

  private focusFirstInvalid(): void {
    requestAnimationFrame(() => {
      const target = document.querySelector<HTMLElement>(
        '.field-control.invalid input, .field-control.invalid select, .textarea-control.invalid textarea, .variant-input.invalid, .media-upload.invalid',
      );
      target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLSelectElement ||
        target instanceof HTMLTextAreaElement
      )
        target.focus();
    });
  }
}
