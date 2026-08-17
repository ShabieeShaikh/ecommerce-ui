import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Product, ProductUpsert } from '../../../models/admin.models';
import { InventoryBalanceView } from '../../../models/inventory.models';
import {
  CategoryAttributeDefinition,
  ProductAttributeData,
  ProductVariant,
} from '../../../models/product-catalog.models';
import { CategoryService } from '../../../services/category.service';
import { InventoryService } from '../../../services/inventory.service';
import { ProductService } from '../../../services/product.service';
import { StoreService } from '../../../services/store.service';
import { BarcodeDisplay } from '../../shared/barcode-display/barcode-display';

@Component({
  selector: 'app-product-details',
  imports: [RouterLink, BarcodeDisplay],
  templateUrl: './product-details.html',
  styleUrl: './product-details.css',
})
export class ProductDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly categoryService = inject(CategoryService);
  private readonly inventoryService = inject(InventoryService);
  readonly storeService = inject(StoreService);

  readonly productId = this.route.snapshot.paramMap.get('id') ?? '';
  readonly product = computed(() => this.productService.getProductById(this.productId));
  readonly store = computed(() => {
    const product = this.product();
    return product ? this.storeService.getStoreById(product.storeId) : undefined;
  });
  readonly images = computed(() => {
    const product = this.product();
    if (!product) return [];
    const variantImages = (product.variants ?? []).map((variant) => variant.imageUrl);
    return [
      ...new Set(
        [...(product.imageUrls ?? []), product.imageUrl, ...variantImages].filter(
          (image): image is string => !!image,
        ),
      ),
    ];
  });
  readonly selectedImage = signal('');
  readonly imageViewerOpen = signal(false);
  readonly moreActionsOpen = signal(false);
  readonly categoryAttributes = signal<CategoryAttributeDefinition[]>([]);
  readonly specifications = computed(() => {
    const saved = this.product()?.attributes ?? [];
    const values = new Map(saved.map((attribute) => [attribute.key, attribute.value]));
    const configured = this.categoryAttributes()
      .filter((definition) => !definition.isVariantAttribute)
      .flatMap((definition) => {
        const value = values.get(definition.key);
        return this.hasSpecificationValue(value)
          ? [
              {
                id: definition.id,
                label: definition.label,
                value: this.formatSpecificationValue(value, definition.unit),
              },
            ]
          : [];
      });
    const configuredKeys = new Set(this.categoryAttributes().map((definition) => definition.key));
    const retained = saved
      .filter(
        (attribute) =>
          !configuredKeys.has(attribute.key) && this.hasSpecificationValue(attribute.value),
      )
      .map((attribute) => ({
        id: attribute.attributeDefinitionId,
        label: this.humanizeKey(attribute.key),
        value: this.formatSpecificationValue(attribute.value),
      }));
    return [...configured, ...retained];
  });

  readonly balances = computed(() => {
    const product = this.product();
    if (!product) return [];
    const order = { warehouse: 0, store: 1, branch: 2 } as const;
    return this.inventoryService
      .getBalances(product.storeId)
      .filter((balance) => balance.productId === product.id)
      .sort(
        (left, right) =>
          order[left.location.type] - order[right.location.type] ||
          left.location.name.localeCompare(right.location.name),
      );
  });
  readonly totalStock = computed(() =>
    this.balances().reduce((total, balance) => total + balance.quantity, 0),
  );
  readonly reservedStock = computed(() =>
    this.balances().reduce((total, balance) => total + balance.reservedQuantity, 0),
  );
  readonly availableStock = computed(() =>
    this.balances().reduce((total, balance) => total + balance.availableQuantity, 0),
  );
  readonly lowStockLocations = computed(
    () =>
      this.balances().filter((balance) => balance.availableQuantity <= balance.lowStockThreshold)
        .length,
  );
  readonly productTransactions = computed(() => {
    const product = this.product();
    return product
      ? this.inventoryService
          .getTransactionsByStore(product.storeId)
          .filter((transaction) => transaction.productId === product.id)
      : [];
  });

  constructor() {
    const product = this.product();
    if (!product) {
      this.storeService.showToast('The selected product could not be found.', 'warning');
      void this.router.navigate(['/store-admin/products']);
      return;
    }
    if (this.storeService.selectedStoreId() !== product.storeId) {
      this.storeService.changeSelectedStore(product.storeId, false);
    }
    this.selectedImage.set(this.images()[0] ?? '');
    this.categoryService
      .getCategoryAttributes(product.categoryId ?? product.category)
      .pipe(takeUntilDestroyed())
      .subscribe((definitions) => this.categoryAttributes.set(definitions));
  }

  @HostListener('document:keydown.escape')
  closeOverlays(): void {
    this.moreActionsOpen.set(false);
    this.imageViewerOpen.set(false);
  }

  @HostListener('document:keydown.arrowLeft')
  showPreviousViewerImage(): void {
    if (this.imageViewerOpen()) this.navigateImage(-1);
  }

  @HostListener('document:keydown.arrowRight')
  showNextViewerImage(): void {
    if (this.imageViewerOpen()) this.navigateImage(1);
  }

  editProduct(): void {
    void this.router.navigate(['/store-admin/products', this.productId, 'edit']);
  }

  duplicateProduct(): void {
    const product = this.product();
    if (!product) return;
    const duplicateSku = this.copySku(product);
    const data: ProductUpsert = {
      storeId: product.storeId,
      name: `${product.name} Copy`,
      sku: duplicateSku,
      categoryId: product.categoryId ?? product.category,
      category: product.category,
      brand: product.brand,
      barcode: undefined,
      shortDescription: product.shortDescription,
      taxClass: product.taxClass,
      price: product.price,
      comparePrice: product.comparePrice,
      status: 'draft',
      imageUrl: product.imageUrl,
      imageUrls: product.imageUrls,
      description: product.description,
      tags: [...product.tags],
      attributes: (product.attributes ?? []).map((attribute) => ({
        ...attribute,
        value: Array.isArray(attribute.value) ? [...attribute.value] : attribute.value,
      })),
      variants: (product.variants ?? []).map((variant, index) => ({
        ...variant,
        id: undefined,
        productId: undefined,
        sku: variant.sku.toUpperCase().startsWith(product.sku.toUpperCase())
          ? `${duplicateSku}${variant.sku.slice(product.sku.length)}`
          : `${duplicateSku}-${index + 1}`,
        barcode: undefined,
        attributes: variant.attributes.map((attribute) => ({ ...attribute })),
      })),
      weight: product.weight,
      dimensions: product.dimensions,
    };
    try {
      const duplicate = this.productService.createCatalogProduct(data);
      this.storeService.showToast(`Product "${duplicate.name}" created as a draft.`, 'success');
      void this.router.navigate(['/store-admin/products', duplicate.id]);
    } catch (error) {
      this.storeService.showToast(
        error instanceof Error ? error.message : 'The product could not be duplicated.',
        'danger',
      );
    }
  }

  toggleArchive(): void {
    const product = this.product();
    if (!product) return;
    const status = product.status === 'archived' ? 'active' : 'archived';
    this.productService.updateProduct(product.id, { status });
    this.moreActionsOpen.set(false);
    this.storeService.showToast(
      `Product "${product.name}" ${status === 'archived' ? 'archived' : 'activated'}.`,
      status === 'archived' ? 'warning' : 'success',
    );
  }

  deleteProduct(): void {
    const product = this.product();
    if (!product || !confirm(`Are you sure you want to delete "${product.name}"?`)) return;
    try {
      this.inventoryService.deleteProduct(product.id);
      this.storeService.showToast(`Product "${product.name}" deleted.`, 'danger');
      void this.router.navigate(['/store-admin/products']);
    } catch (error) {
      this.storeService.showToast(
        error instanceof Error ? error.message : 'The product could not be deleted.',
        'warning',
      );
    }
  }

  async copyBarcode(): Promise<void> {
    const product = this.product();
    if (!product) return;
    try {
      await navigator.clipboard.writeText(this.barcode(product));
      this.storeService.showToast('Barcode copied.', 'success');
    } catch {
      this.storeService.showToast('Barcode could not be copied.', 'warning');
    }
  }

  selectImage(image: string): void {
    this.selectedImage.set(image);
  }

  navigateImage(direction: -1 | 1): void {
    const images = this.images();
    if (images.length < 2) return;
    const currentIndex = Math.max(0, images.indexOf(this.selectedImage()));
    this.selectedImage.set(images[(currentIndex + direction + images.length) % images.length]);
  }

  selectedImagePosition(): number {
    return Math.max(0, this.images().indexOf(this.selectedImage())) + 1;
  }

  openImageViewer(): void {
    if (this.selectedImage()) this.imageViewerOpen.set(true);
  }

  statusLabel(product: Product): string {
    if (product.status === 'active') return 'Active';
    if (product.status === 'archived') return 'Archived';
    return 'Draft';
  }

  visibilityLabel(product: Product): string {
    return product.status === 'active' ? 'Visible' : 'Hidden';
  }

  stockStatus(balance: InventoryBalanceView): string {
    if (balance.availableQuantity <= 0) return 'Out of Stock';
    if (balance.availableQuantity <= balance.lowStockThreshold) return 'Low Stock';
    return 'In Stock';
  }

  stockTone(balance: InventoryBalanceView): string {
    if (balance.availableQuantity <= 0) return 'out';
    if (balance.availableQuantity <= balance.lowStockThreshold) return 'low';
    return 'in';
  }

  locationType(balance: InventoryBalanceView): string {
    return balance.location.type === 'store' ? 'Store level' : balance.location.type;
  }

  barcode(product: Product): string {
    return product.barcode || this.barcodeFromSku(product.sku);
  }

  variantBarcode(variant: ProductVariant): string {
    return variant.barcode || this.barcodeFromSku(variant.sku);
  }

  taxClass(product: Product): string {
    return (
      (
        {
          standard: 'Standard Rate',
          reduced: 'Reduced Rate',
          zero: 'Zero Rated',
          exempt: 'Tax Exempt',
        } as Record<string, string>
      )[product.taxClass ?? ''] ?? 'Not selected'
    );
  }

  discount(product: Product): number {
    return product.comparePrice && product.comparePrice > product.price
      ? Math.round(((product.comparePrice - product.price) / product.comparePrice) * 100)
      : 0;
  }

  formatCurrency(value?: number): string {
    if (value === undefined) return 'Not set';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  variantName(variant: ProductVariant): string {
    return variant.attributes.map((attribute) => attribute.value).join(' / ');
  }

  variantSpecifications(variant: ProductVariant): string {
    return variant.attributes
      .map((attribute) => {
        const definition = this.categoryAttributes().find(
          (item) => item.id === attribute.attributeDefinitionId,
        );
        return `${definition?.label ?? attribute.attributeKey}: ${attribute.value}`;
      })
      .join(' · ');
  }

  variantPrice(variant: ProductVariant, product: Product): number {
    const override = Number(variant.priceOverride);
    return variant.priceOverride !== undefined && variant.priceOverride !== null && Number.isFinite(override)
      ? override
      : product.price;
  }

  variantImage(variant: ProductVariant, product: Product): string {
    return variant.imageUrl || product.imageUrl;
  }

  formatDate(value?: string): string {
    const fallback = this.inventoryDate(value ? undefined : 'created');
    const date = new Date(value ?? fallback ?? '');
    return Number.isNaN(date.getTime())
      ? 'Not recorded'
      : new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }

  updatedDate(product: Product): string {
    const fallback = this.inventoryDate('updated');
    return this.formatDate(product.updatedAt ?? fallback);
  }

  private inventoryDate(kind: 'created' | 'updated' | undefined): string | undefined {
    if (!kind) return undefined;
    const dates = this.inventoryService
      .getProductBalances(this.product()?.storeId ?? '', this.productId)
      .map((balance) => (kind === 'created' ? balance.createdAt : balance.updatedAt))
      .filter(Boolean)
      .sort();
    return kind === 'created' ? dates[0] : dates.at(-1);
  }

  private copySku(product: Product): string {
    const base = `${product.sku}-COPY`;
    let candidate = base;
    let sequence = 2;
    while (!this.productService.isSkuAvailable(product.storeId, candidate)) {
      candidate = `${base}-${sequence++}`;
    }
    return candidate;
  }

  private barcodeFromSku(sku: string): string {
    const normalized = sku
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9._-]/g, '');
    return normalized ? `BC-${normalized}` : '';
  }

  private hasSpecificationValue(
    value: ProductAttributeData | undefined,
  ): value is ProductAttributeData {
    return value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0);
  }

  private formatSpecificationValue(value: ProductAttributeData, unit?: string): string {
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return `${value}${unit ? ` ${unit}` : ''}`;
  }

  private humanizeKey(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/[-_]+/g, ' ')
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }
}
