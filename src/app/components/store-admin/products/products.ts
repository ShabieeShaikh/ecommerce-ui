import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StoreService } from '../../../services/store.service';
import { ProductService, Product } from '../../../services/product.service';
import { InventoryService } from '../../../services/inventory.service';

type ProductStockFilter = 'all' | 'active' | 'low' | 'out' | 'draft' | 'archived';

const CATEGORIES = [
  'Apparel',
  'Dresses',
  'Electronics',
  'Audio',
  'Peripherals',
  'Home & Living',
  'Beauty',
  'Sports',
  'Books',
  'General',
];

@Component({
  selector: 'app-products',
  imports: [],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class Products {
  readonly storeService = inject(StoreService);
  readonly productService = inject(ProductService);
  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);

  readonly selectedStore = this.storeService.selectedStore;
  readonly searchQuery = signal('');
  readonly selectedCategory = signal('all');
  readonly selectedStatus = signal<ProductStockFilter>('all');
  readonly categories = CATEGORIES;

  readonly storeProducts = computed(() =>
    this.productService.products().filter((product) => product.storeId === this.selectedStore().id),
  );
  readonly productStocks = computed(() => {
    const stocks = new Map<string, number>();
    for (const balance of this.inventoryService.getBalances(this.selectedStore().id)) {
      stocks.set(balance.productId, (stocks.get(balance.productId) ?? 0) + balance.quantity);
    }
    return stocks;
  });
  readonly filteredProducts = computed(() => {
    let products = [...this.storeProducts()];
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      products = products.filter(
        (product) =>
          product.name.toLowerCase().includes(query) ||
          product.sku.toLowerCase().includes(query) ||
          product.category.toLowerCase().includes(query),
      );
    }
    if (this.selectedCategory() !== 'all')
      products = products.filter((product) => product.category === this.selectedCategory());

    const status = this.selectedStatus();
    if (status === 'low')
      products = products.filter(
        (product) =>
          this.stockFor(product) > 0 && this.stockFor(product) <= 15 && product.status === 'active',
      );
    else if (status === 'out')
      products = products.filter(
        (product) => this.stockFor(product) === 0 && product.status === 'active',
      );
    else if (status !== 'all') products = products.filter((product) => product.status === status);
    return products;
  });
  readonly emptyMessage = computed(() =>
    this.storeProducts().length
      ? 'No products match the selected filters.'
      : `${this.selectedStore().name} has no products yet.`,
  );
  readonly stats = computed(() => {
    const products = this.storeProducts();
    const total = products.length;
    const inStock = products
      .filter((product) => product.status === 'active')
      .reduce((sum, product) => sum + this.stockFor(product), 0);
    const sold = products.reduce((sum, product) => sum + product.salesCount, 0);
    const low = products.filter(
      (product) =>
        this.stockFor(product) > 0 && this.stockFor(product) <= 15 && product.status === 'active',
    ).length;
    return [
      {
        label: 'Total Products',
        value: total.toLocaleString('en-US'),
        helper: 'All products in store',
        tone: 'purple',
      },
      {
        label: 'In Stock',
        value: inStock.toLocaleString('en-US'),
        helper: 'Total stock units',
        tone: 'green',
      },
      {
        label: 'Sold',
        value: sold.toLocaleString('en-US'),
        helper: 'Total units sold',
        tone: 'orange',
      },
      {
        label: 'Low Stock',
        value: low.toLocaleString('en-US'),
        helper: 'Need attention',
        tone: 'blue',
      },
    ];
  });

  constructor() {
    effect(() => {
      this.selectedStore();
      this.searchQuery.set('');
      this.selectedCategory.set('all');
      this.selectedStatus.set('all');
    });
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  onCategoryChange(event: Event): void {
    this.selectedCategory.set((event.target as HTMLSelectElement).value);
  }

  onStatusChange(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value as ProductStockFilter);
  }

  openDetails(product: Product): void {
    void this.router.navigate(['/store-admin/products', product.id]);
  }

  openCreate(): void {
    this.router.navigate(['/store-admin/products/create']);
  }

  openEdit(product: Product): void {
    this.router.navigate(['/store-admin/products', product.id, 'edit']);
  }

  deleteProduct(product: Product): void {
    if (!confirm(`Are you sure you want to delete "${product.name}"?`)) return;
    try {
      this.inventoryService.deleteProduct(product.id);
      this.storeService.showToast(`Product "${product.name}" deleted.`, 'danger');
    } catch (error) {
      this.storeService.showToast(
        error instanceof Error ? error.message : 'The product could not be deleted.',
        'warning',
      );
    }
  }

  stockLabel(product: Product): string {
    if (product.status === 'draft') return 'Draft';
    if (product.status === 'archived') return 'Archived';
    if (this.stockFor(product) === 0) return 'Out of Stock';
    if (this.stockFor(product) <= 15) return 'Low Stock';
    return 'In Stock';
  }

  stockTone(product: Product): string {
    if (product.status === 'draft') return 'draft';
    if (product.status === 'archived' || this.stockFor(product) === 0) return 'out';
    if (this.stockFor(product) <= 15) return 'low';
    return 'stock';
  }

  stockFor(product: Product): number {
    return this.productStocks().get(product.id) ?? 0;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

}
