import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../../../services/store.service';
import { ProductService, Product } from '../../../services/product.service';

@Component({
  selector: 'app-products',
  imports: [FormsModule],
  templateUrl: './products.html',
  styleUrl: './products.css'
})
export class Products {
  readonly storeService = inject(StoreService);
  readonly productService = inject(ProductService);

  searchQuery = signal('');
  selectedStoreFilter = signal('all');
  selectedProduct = signal<Product | null>(null);
  
  // Modals & Panels
  showAddModal = signal(false);
  activeModalStoreId = signal<string>('store-001');
  isEditingDetail = signal(false);

  // Form State for Adding Product
  newProduct = {
    name: '',
    sku: '',
    category: 'Apparel',
    price: 49.99,
    comparePrice: 69.99,
    stock: 50,
    status: 'active' as 'active' | 'draft' | 'archived',
    imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60',
    description: '',
    tagsString: 'new, featured',
    weight: 0.5,
    dimensions: '20x15x5 cm'
  };

  // Group products by Store
  storeProductGroups = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const filterStore = this.selectedStoreFilter();

    let stores = this.storeService.stores();
    if (filterStore !== 'all') {
      stores = stores.filter(s => s.id === filterStore);
    }

    return stores.map(store => {
      let prods = this.productService.getProductsByStore(store.id);
      if (query) {
        prods = prods.filter(p =>
          p.name.toLowerCase().includes(query) ||
          p.sku.toLowerCase().includes(query) ||
          p.category.toLowerCase().includes(query)
        );
      }
      return { store, products: prods };
    });
  });

  openProductDetail(product: Product) {
    this.selectedProduct.set({ ...product });
    this.isEditingDetail.set(false);
  }

  closeProductDetail() {
    this.selectedProduct.set(null);
    this.isEditingDetail.set(false);
  }

  openAddProductModal(storeId: string) {
    this.activeModalStoreId.set(storeId);
    this.newProduct = {
      name: '',
      sku: `SKU-${Math.floor(1000 + Math.random() * 9000)}`,
      category: 'Apparel',
      price: 49.99,
      comparePrice: 69.99,
      stock: 50,
      status: 'active',
      imageUrl: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60',
      description: '',
      tagsString: 'new, featured',
      weight: 0.5,
      dimensions: '20x15x5 cm'
    };
    this.showAddModal.set(true);
  }

  closeAddModal() {
    this.showAddModal.set(false);
  }

  saveNewProduct() {
    if (!this.newProduct.name.trim()) {
      this.storeService.showToast('Product name is required!', 'warning');
      return;
    }

    const tags = this.newProduct.tagsString.split(',').map(t => t.trim()).filter(Boolean);

    this.productService.addProduct({
      ...this.newProduct,
      storeId: this.activeModalStoreId(),
      tags
    });

    this.storeService.showToast(`Product "${this.newProduct.name}" added successfully!`, 'success');
    this.closeAddModal();
  }

  toggleEditDetail() {
    this.isEditingDetail.update(v => !v);
  }

  saveProductDetail() {
    const prod = this.selectedProduct();
    if (!prod) return;

    this.productService.updateProduct(prod.id, prod);
    this.storeService.showToast(`Product "${prod.name}" updated successfully!`, 'success');
    this.isEditingDetail.set(false);
  }

  deleteCurrentProduct() {
    const prod = this.selectedProduct();
    if (!prod) return;

    if (confirm(`Are you sure you want to delete "${prod.name}"?`)) {
      this.productService.deleteProduct(prod.id);
      this.storeService.showToast(`Product "${prod.name}" deleted`, 'danger');
      this.closeProductDetail();
    }
  }

  onFilterStoreChange(event: Event) {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedStoreFilter.set(val);
  }
}
