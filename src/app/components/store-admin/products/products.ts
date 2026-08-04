import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../../../services/store.service';
import { ProductService, Product } from '../../../services/product.service';

type ProductPanelMode = 'details' | 'edit' | 'create';
type ProductStockFilter = 'all' | 'active' | 'low' | 'out' | 'draft' | 'archived';

interface ProductFormData {
  name: string;
  sku: string;
  category: string;
  brand: string;
  barcode: string;
  price: number;
  comparePrice?: number;
  stock: number;
  status: Product['status'];
  imageUrl: string;
  imageFileName: string;
  description: string;
  tagsString: string;
  weight: number;
  dimensions: string;
}

const EMPTY_PRODUCT_FORM: ProductFormData = {
  name: '',
  sku: '',
  category: 'Mobiles',
  brand: '',
  barcode: '',
  price: 0,
  comparePrice: undefined,
  stock: 0,
  status: 'active',
  imageUrl: '',
  imageFileName: '',
  description: '',
  tagsString: '',
  weight: 0,
  dimensions: ''
};

const CATEGORIES = ['Mobiles', 'Laptops', 'Wearables', 'Audio', 'TV & Video', 'Cameras', 'Tablets', 'Accessories'];

@Component({
  selector: 'app-products',
  imports: [FormsModule],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products {
  readonly storeService = inject(StoreService);
  readonly productService = inject(ProductService);

  readonly selectedStore = this.storeService.selectedStore;
  readonly searchQuery = signal('');
  readonly selectedCategory = signal('all');
  readonly selectedStatus = signal<ProductStockFilter>('all');
  readonly panelMode = signal<ProductPanelMode | null>(null);
  readonly selectedProductId = signal<string | null>(null);
  readonly activeDetailTab = signal<'overview' | 'activity'>('overview');
  readonly categories = CATEGORIES;

  formData: ProductFormData = { ...EMPTY_PRODUCT_FORM };

  readonly storeProducts = computed(() => this.productService.products().filter(product => product.storeId === this.selectedStore().id));
  readonly selectedProduct = computed(() => {
    const id = this.selectedProductId();
    return id ? this.productService.getProductById(id) : undefined;
  });

  readonly filteredProducts = computed(() => {
    let products = [...this.storeProducts()];
    const query = this.searchQuery().trim().toLowerCase();

    if (query) {
      products = products.filter(product =>
        product.name.toLowerCase().includes(query) ||
        product.sku.toLowerCase().includes(query) ||
        product.category.toLowerCase().includes(query)
      );
    }

    if (this.selectedCategory() !== 'all') {
      products = products.filter(product => product.category === this.selectedCategory());
    }

    const status = this.selectedStatus();
    if (status === 'low') {
      products = products.filter(product => product.stock > 0 && product.stock <= 15);
    } else if (status === 'out') {
      products = products.filter(product => product.stock === 0);
    } else if (status !== 'all') {
      products = products.filter(product => product.status === status);
    }

    return products;
  });
  readonly emptyMessage = computed(() => {
    if (this.storeProducts().length === 0) {
      return `${this.selectedStore().name} has no products yet.`;
    }

    return 'No products match the selected filters.';
  });

  readonly stats = computed(() => {
    const products = this.storeProducts();
    const total = products.length;
    const inStock = products.filter(product => product.stock > 15 && product.status === 'active').length;
    const sold = products.reduce((sum, product) => sum + product.salesCount, 0);
    const low = products.filter(product => product.stock > 0 && product.stock <= 15).length;

    return [
      { label: 'Total Products', value: total.toLocaleString('en-US'), helper: 'All products in store', tone: 'purple', icon: 'box' },
      { label: 'In Stock', value: inStock.toLocaleString('en-US'), helper: `${this.percent(inStock, total)}% of total`, tone: 'green', icon: 'stock' },
      { label: 'Sold', value: sold.toLocaleString('en-US'), helper: 'Total units sold', tone: 'orange', icon: 'sold' },
      { label: 'Low Stock', value: low.toLocaleString('en-US'), helper: 'Need attention', tone: 'blue', icon: 'low' }
    ];
  });

  constructor() {
    effect(() => {
      this.selectedStore();
      this.panelMode.set(null);
      this.selectedProductId.set(null);
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
    this.selectedProductId.set(product.id);
    this.activeDetailTab.set('overview');
    this.panelMode.set('details');
  }

  openEdit(product: Product): void {
    this.selectedProductId.set(product.id);
    this.formData = this.toFormData(product);
    this.panelMode.set('edit');
  }

  openCreate(): void {
    this.formData = {
      ...EMPTY_PRODUCT_FORM,
      sku: `${this.selectedStore().name.replace(/[^A-Z0-9]/gi, '').slice(0, 3).toUpperCase() || 'SKU'}-${Math.floor(1000 + Math.random() * 9000)}`,
      tagsString: 'new, featured'
    };
    this.selectedProductId.set(null);
    this.panelMode.set('create');
  }

  onProductImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.storeService.showToast('Please select a valid product image.', 'warning');
      return;
    }

    if (file.size > 3 * 1024 * 1024) {
      this.storeService.showToast('Please select an image smaller than 3 MB.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const imageUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!imageUrl) {
        this.storeService.showToast('Unable to read the selected product image.', 'danger');
        return;
      }

      this.formData.imageUrl = imageUrl;
      this.formData.imageFileName = file.name;
      this.storeService.showToast('Product image preview updated.', 'success');
    };
    reader.onerror = () => this.storeService.showToast('Unable to read the selected product image.', 'danger');
    reader.readAsDataURL(file);
  }

  closePanel(): void {
    this.panelMode.set(null);
    this.selectedProductId.set(null);
  }

  saveCreate(): void {
    if (!this.formData.name.trim()) {
      this.storeService.showToast('Product name is required.', 'warning');
      return;
    }

    if (!this.formData.imageUrl) {
      this.storeService.showToast('Please upload a product image.', 'warning');
      return;
    }

    const product = this.productService.addProduct(this.toProductPayload());
    this.storeService.showToast(`Product "${product.name}" added successfully.`, 'success');
    this.closePanel();
  }

  saveEdit(): void {
    const product = this.selectedProduct();
    if (!product) {
      return;
    }

    this.productService.updateProduct(product.id, this.toProductPayload());
    this.storeService.showToast(`Product "${this.formData.name}" updated successfully.`, 'success');
    this.panelMode.set('details');
  }

  deleteProduct(product?: Product): void {
    const target = product ?? this.selectedProduct();
    if (!target) {
      return;
    }

    if (confirm(`Are you sure you want to delete "${target.name}"?`)) {
      this.productService.deleteProduct(target.id);
      this.storeService.showToast(`Product "${target.name}" deleted.`, 'danger');
      this.closePanel();
    }
  }

  stockLabel(product: Product): string {
    if (product.stock === 0 || product.status === 'archived') return 'Out of Stock';
    if (product.stock <= 15) return 'Low Stock';
    if (product.status === 'draft') return 'Draft';
    return 'In Stock';
  }

  stockTone(product: Product): string {
    if (product.stock === 0 || product.status === 'archived') return 'out';
    if (product.stock <= 15) return 'low';
    if (product.status === 'draft') return 'draft';
    return 'stock';
  }

  brand(product: Product): string {
    return product.tags[0] ? this.titleCase(product.tags[0]) : 'DigiShop';
  }

  barcode(product: Product): string {
    return `${product.sku.replace(/[^0-9]/g, '').padEnd(12, '0').slice(0, 12)}`;
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  }

  private toFormData(product: Product): ProductFormData {
    return {
      name: product.name,
      sku: product.sku,
      category: product.category,
      brand: this.brand(product),
      barcode: this.barcode(product),
      price: product.price,
      comparePrice: product.comparePrice,
      stock: product.stock,
      status: product.status,
      imageUrl: product.imageUrl,
      imageFileName: '',
      description: product.description,
      tagsString: product.tags.join(', '),
      weight: product.weight ?? 0,
      dimensions: product.dimensions ?? ''
    };
  }

  private toProductPayload(): Partial<Product> {
    return {
      storeId: this.selectedStore().id,
      name: this.formData.name.trim() || 'New Product',
      sku: this.formData.sku.trim() || `SKU-${Date.now().toString().slice(-4)}`,
      category: this.formData.category,
      price: Number(this.formData.price) || 0,
      comparePrice: this.formData.comparePrice ? Number(this.formData.comparePrice) : undefined,
      stock: Number(this.formData.stock) || 0,
      status: this.formData.status,
      imageUrl: this.formData.imageUrl.trim(),
      description: this.formData.description.trim() || 'Product description.',
      tags: this.formData.tagsString.split(',').map(tag => tag.trim()).filter(Boolean),
      weight: Number(this.formData.weight) || 0,
      dimensions: this.formData.dimensions.trim()
    };
  }

  private percent(value: number, total: number): number {
    return total ? Number(((value / total) * 100).toFixed(2)) : 0;
  }

  private titleCase(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
}
