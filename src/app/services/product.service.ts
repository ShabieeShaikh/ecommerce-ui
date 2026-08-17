import { Injectable, inject, signal } from '@angular/core';
import {
  Product,
  ProductInventoryAllocation,
  ProductInventoryInput,
  ProductUpsert
} from '../models/admin.models';
import { LocalStorageService } from './local-storage.service';
import { variantCombinationKey } from '../utils/product-variant.utils';

export type { Product } from '../models/admin.models';

const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-101', storeId: 'store-001', name: 'Classic Leather Jacket', sku: 'FH-JKT-001', category: 'Apparel', brand: 'North & Hide',
    price: 189.99, comparePrice: 229.99, stock: 45, status: 'active', taxClass: 'standard', barcode: '100000000101',
    imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&auto=format&fit=crop&q=60',
    description: 'Premium genuine leather jacket with sleek metallic hardware and inner quilted lining.',
    shortDescription: 'Premium leather jacket with quilted lining.', tags: ['leather', 'outerwear', 'bestseller'],
    weight: 1.2, dimensions: '40x30x5 cm', rating: 4.8, salesCount: 320
  },
  {
    id: 'prod-102', storeId: 'store-001', name: 'Slim Fit Denim Jeans', sku: 'FH-JNS-002', category: 'Apparel', brand: 'Denim House',
    price: 69.50, comparePrice: 89.99, stock: 120, status: 'active', taxClass: 'standard', barcode: '100000000102',
    imageUrl: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=500&auto=format&fit=crop&q=60',
    description: 'Stretch denim jeans crafted for comfort and flexibility with dark wash finish.',
    shortDescription: 'Dark wash stretch denim in a slim fit.', tags: ['denim', 'casual'],
    weight: 0.7, dimensions: '35x25x4 cm', rating: 4.6, salesCount: 540
  },
  {
    id: 'prod-103', storeId: 'store-001', name: 'Silk Floral Evening Dress', sku: 'FH-DRS-003', category: 'Dresses', brand: 'Atelier Bloom',
    price: 145.00, comparePrice: 175.00, stock: 8, status: 'active', taxClass: 'standard', barcode: '100000000103',
    imageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
    description: 'Elegant silk floral print dress suitable for evening gatherings and celebrations.',
    shortDescription: 'Floral silk dress for evening occasions.', tags: ['silk', 'formal'],
    weight: 0.4, dimensions: '30x20x3 cm', rating: 4.9, salesCount: 110
  },
  {
    id: 'prod-201', storeId: 'store-002', name: 'Noise-Canceling Wireless Headphones', sku: 'TZ-HDP-101', category: 'Audio', brand: 'SonicPro',
    price: 249.99, comparePrice: 299.99, stock: 65, status: 'active', taxClass: 'standard', barcode: '200000000201',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',
    description: 'Immersive sound quality with active noise cancellation and 40-hour battery life.',
    shortDescription: 'Wireless ANC headphones with 40-hour battery.', tags: ['wireless', 'audio', 'bluetooth'],
    weight: 0.3, dimensions: '20x18x8 cm', rating: 4.7, salesCount: 890
  },
  {
    id: 'prod-202', storeId: 'store-002', name: 'Mechanical RGB Gaming Keyboard', sku: 'TZ-KBD-102', category: 'Peripherals', brand: 'KeyForge',
    price: 119.00, stock: 40, status: 'active', taxClass: 'standard', barcode: '200000000202',
    imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=60',
    description: 'Tactile mechanical switches with per-key customizable RGB illumination.',
    shortDescription: 'Tactile mechanical keyboard with per-key RGB.', tags: ['gaming', 'rgb', 'keyboard'],
    weight: 0.9, dimensions: '44x14x4 cm', rating: 4.8, salesCount: 420
  },
  {
    id: 'prod-301', storeId: 'store-003', name: 'Minimalist Ceramic Plant Pot', sku: 'HG-POT-301', category: 'Home & Living', brand: 'Terra Form',
    price: 34.99, stock: 95, status: 'active', taxClass: 'standard', barcode: '300000000301',
    imageUrl: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=500&auto=format&fit=crop&q=60',
    description: 'Handcrafted ceramic pot with drainage hole, ideal for indoor succulents.',
    shortDescription: 'Handcrafted ceramic pot for indoor plants.', tags: ['plant', 'ceramic', 'decor'],
    weight: 1.1, dimensions: '15x15x15 cm', rating: 4.5, salesCount: 230
  }
];

const PRODUCTS_STORAGE_KEY = 'digishop_products_v1';
const INVENTORY_STORAGE_KEY = 'digishop_product_inventory_v1';
const GENERATED_PRODUCT_ID_SUFFIXES = ['iphone-15', 'macbook-air', 'watch-6', 'sony-xm5', 'oled-tv', 'canon-r50', 'jbl-flip', 'ipad-air'];

@Injectable({ providedIn: 'root' })
export class ProductService {
  private readonly storage = inject(LocalStorageService);
  private readonly productsSignal = signal<Product[]>(this.loadProducts());
  private readonly inventorySignal = signal<ProductInventoryAllocation[]>(this.loadInventory(this.productsSignal()));

  readonly products = this.productsSignal.asReadonly();
  readonly inventory = this.inventorySignal.asReadonly();

  getProducts(): Product[] {
    return this.productsSignal();
  }

  getProductsByStore(storeId: string): Product[] {
    return this.productsSignal().filter(product => product.storeId === storeId);
  }

  getProductById(id: string): Product | undefined {
    return this.productsSignal().find(product => product.id === id);
  }

  getInventoryForProduct(productId: string): ProductInventoryAllocation[] {
    return this.inventorySignal().filter(allocation => allocation.productId === productId);
  }

  getAllocatedStockForStore(storeId: string, excludeProductId?: string, activeOnly = true): number {
    const productIds = new Set(
      this.productsSignal()
        .filter(product => product.storeId === storeId && product.id !== excludeProductId && (!activeOnly || product.status === 'active'))
        .map(product => product.id)
    );
    return this.inventorySignal()
      .filter(allocation => allocation.storeId === storeId && productIds.has(allocation.productId))
      .reduce((total, allocation) => total + allocation.quantity, 0);
  }

  isSkuAvailable(storeId: string, sku: string, excludeProductId?: string): boolean {
    const normalized = sku.trim().toLowerCase();
    return !this.productsSignal().some(product =>
      product.storeId === storeId && product.id !== excludeProductId && product.sku.toLowerCase() === normalized
    );
  }

  isBarcodeAvailable(storeId: string, barcode: string, excludeProductId?: string): boolean {
    const normalized = barcode.trim().toLowerCase();
    if (!normalized) return true;
    return !this.productsSignal().some(product =>
      product.storeId === storeId && product.id !== excludeProductId && product.barcode?.toLowerCase() === normalized
    );
  }

  createProduct(data: ProductUpsert, inventory: ProductInventoryInput[]): Product {
    const timestamp = new Date().toISOString();
    const productId = this.createId('prod');
    const catalogData = this.prepareProductData(data, productId);
    const allocations = this.createAllocations(productId, inventory, timestamp);
    const product: Product = {
      ...catalogData,
      id: productId,
      stock: this.totalQuantity(allocations),
      rating: 5,
      salesCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.commit([product, ...this.productsSignal()], [...allocations, ...this.inventorySignal()]);
    return product;
  }

  createCatalogProduct(data: ProductUpsert): Product {
    const timestamp = new Date().toISOString();
    const productId = this.createId('prod');
    const catalogData = this.prepareProductData(data, productId);
    const product: Product = {
      ...catalogData,
      id: productId,
      stock: 0,
      rating: 5,
      salesCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.commit([product, ...this.productsSignal()], this.inventorySignal());
    return product;
  }

  updateCatalogProduct(id: string, data: ProductUpsert): Product | undefined {
    const existing = this.getProductById(id);
    if (!existing) return undefined;
    const catalogData = this.prepareProductData(data, id);
    const updated: Product = { ...existing, ...catalogData, stock: existing.stock, updatedAt: new Date().toISOString() };
    this.commit(this.productsSignal().map(product => product.id === id ? updated : product), this.inventorySignal());
    return updated;
  }

  updateProductWithInventory(id: string, data: ProductUpsert, inventory: ProductInventoryInput[]): Product | undefined {
    const existing = this.getProductById(id);
    if (!existing) return undefined;

    const timestamp = new Date().toISOString();
    const catalogData = this.prepareProductData(data, id);
    const previousAllocations = this.getInventoryForProduct(id);
    const allocations = this.createAllocations(id, inventory, timestamp).map(allocation => {
      const previous = previousAllocations.find(item =>
        item.storeId === allocation.storeId && item.branchId === allocation.branchId
      );
      const reservedQuantity = previous?.reservedQuantity ?? 0;
      if (allocation.quantity < reservedQuantity) {
        throw new Error('Inventory cannot be reduced below its reserved quantity.');
      }
      return {
        ...allocation,
        id: previous?.id ?? allocation.id,
        reservedQuantity,
        createdAt: previous?.createdAt ?? allocation.createdAt
      };
    });
    const updatedProduct: Product = {
      ...existing,
      ...catalogData,
      stock: this.totalQuantity(allocations),
      updatedAt: timestamp
    };
    const products = this.productsSignal().map(product => product.id === id ? updatedProduct : product);
    const inventoryWithoutProduct = this.inventorySignal().filter(allocation => allocation.productId !== id);
    this.commit(products, [...allocations, ...inventoryWithoutProduct]);
    return updatedProduct;
  }

  addProduct(productData: Partial<Product>): Product {
    const storeId = productData.storeId ?? 'store-001';
    return this.createProduct({
      storeId,
      name: productData.name ?? 'New Product',
      sku: productData.sku ?? `SKU-${Date.now().toString().slice(-4)}`,
      category: productData.category ?? 'General',
      brand: productData.brand,
      barcode: productData.barcode,
      shortDescription: productData.shortDescription,
      taxClass: productData.taxClass,
      price: productData.price ?? 19.99,
      comparePrice: productData.comparePrice,
      status: productData.status ?? 'active',
      imageUrl: productData.imageUrl ?? '',
      imageUrls: productData.imageUrls,
      description: productData.description ?? 'Standard product description.',
      tags: productData.tags ?? ['new'],
      weight: productData.weight,
      dimensions: productData.dimensions
    }, [{ storeId, branchId: null, quantity: productData.stock ?? 10, lowStockThreshold: 10 }]);
  }

  updateProduct(id: string, updatedFields: Partial<Product>): void {
    const products = this.productsSignal().map(product => product.id === id ? { ...product, ...updatedFields, updatedAt: new Date().toISOString() } : product);
    this.commit(products, this.inventorySignal());
  }

  deleteProduct(id: string): void {
    this.commit(
      this.productsSignal().filter(product => product.id !== id),
      this.inventorySignal().filter(allocation => allocation.productId !== id)
    );
  }

  deleteInventoryForBranch(branchId: string): void {
    const allocations = this.inventorySignal().filter(allocation => allocation.branchId === branchId);
    if (allocations.some(allocation => allocation.quantity > 0 || allocation.reservedQuantity > 0)) {
      throw new Error('Move all branch stock before deleting this branch.');
    }
    this.commit(this.productsSignal(), this.inventorySignal().filter(allocation => allocation.branchId !== branchId));
  }

  changeInventoryQuantity(productId: string, storeId: string, branchId: string | null, quantityDelta: number, lowStockThreshold = 10): ProductInventoryAllocation {
    const product = this.getProductById(productId);
    if (!product || product.storeId !== storeId) throw new Error('The selected product does not belong to this store.');

    const timestamp = new Date().toISOString();
    const existing = this.inventorySignal().find(allocation =>
      allocation.productId === productId && allocation.storeId === storeId && allocation.branchId === branchId
    );
    const nextQuantity = (existing?.quantity ?? 0) + Math.trunc(quantityDelta);
    if (nextQuantity < 0) throw new Error('The inventory quantity cannot be negative.');

    const updatedAllocation: ProductInventoryAllocation = existing
      ? { ...existing, quantity: nextQuantity, updatedAt: timestamp }
      : {
        id: this.createId('inventory'),
        productId,
        storeId,
        branchId,
        quantity: nextQuantity,
        reservedQuantity: 0,
        lowStockThreshold: Math.max(0, Math.trunc(lowStockThreshold)),
        createdAt: timestamp,
        updatedAt: timestamp
      };

    const inventory = existing
      ? this.inventorySignal().map(allocation => allocation.id === existing.id ? updatedAllocation : allocation)
      : [updatedAllocation, ...this.inventorySignal()];
    const productStock = inventory
      .filter(allocation => allocation.productId === productId)
      .reduce((total, allocation) => total + allocation.quantity, 0);
    const products = this.productsSignal().map(item => item.id === productId
      ? { ...item, stock: productStock, updatedAt: timestamp }
      : item);
    this.commit(products, inventory);
    return updatedAllocation;
  }

  setInventoryThreshold(productId: string, storeId: string, branchId: string | null, threshold: number): ProductInventoryAllocation {
    const existing = this.inventorySignal().find(allocation =>
      allocation.productId === productId && allocation.storeId === storeId && allocation.branchId === branchId
    );
    if (!existing) return this.changeInventoryQuantity(productId, storeId, branchId, 0, threshold);
    const updated = { ...existing, lowStockThreshold: Math.max(0, Math.trunc(threshold)), updatedAt: new Date().toISOString() };
    this.commit(this.productsSignal(), this.inventorySignal().map(allocation => allocation.id === existing.id ? updated : allocation));
    return updated;
  }

  changeReservedQuantity(productId: string, storeId: string, branchId: string, quantityDelta: number): ProductInventoryAllocation {
    const existing = this.inventorySignal().find(allocation =>
      allocation.productId === productId && allocation.storeId === storeId && allocation.branchId === branchId
    );
    if (!existing) throw new Error('No branch stock exists for this product.');
    const reservedQuantity = (existing.reservedQuantity ?? 0) + Math.trunc(quantityDelta);
    if (reservedQuantity < 0 || reservedQuantity > existing.quantity) throw new Error('The reserved quantity exceeds available branch stock.');
    const updated = { ...existing, reservedQuantity, updatedAt: new Date().toISOString() };
    this.commit(this.productsSignal(), this.inventorySignal().map(allocation => allocation.id === existing.id ? updated : allocation));
    return updated;
  }

  private createAllocations(productId: string, inputs: ProductInventoryInput[], timestamp: string): ProductInventoryAllocation[] {
    return inputs.map(input => ({
      id: this.createId('inventory'),
      productId,
      storeId: input.storeId,
      branchId: input.branchId,
      quantity: Math.max(0, Math.trunc(Number(input.quantity) || 0)),
      reservedQuantity: Math.max(0, Math.trunc(Number(input.reservedQuantity) || 0)),
      lowStockThreshold: Math.max(0, Math.trunc(Number(input.lowStockThreshold) || 0)),
      createdAt: timestamp,
      updatedAt: timestamp
    }));
  }

  private commit(products: Product[], inventory: ProductInventoryAllocation[]): void {
    const previousProducts = this.productsSignal();
    const previousInventory = this.inventorySignal();
    try {
      this.storage.setItem(INVENTORY_STORAGE_KEY, inventory);
      this.storage.setItem(PRODUCTS_STORAGE_KEY, products);
      this.inventorySignal.set(inventory);
      this.productsSignal.set(products);
    } catch (error) {
      this.storage.setItem(INVENTORY_STORAGE_KEY, previousInventory);
      this.storage.setItem(PRODUCTS_STORAGE_KEY, previousProducts);
      throw error;
    }
  }

  private loadProducts(): Product[] {
    const storedProducts = this.storage.getItem<Product[]>(PRODUCTS_STORAGE_KEY);
    if (!storedProducts) return INITIAL_PRODUCTS.map(product => ({
      ...product,
      categoryId: product.category,
      attributes: [],
      variants: [],
      imageUrls: product.imageUrl ? [product.imageUrl] : []
    }));
    const migratedProducts = storedProducts
      .filter(product => !this.isGeneratedStoreProduct(product))
      .map(product => ({
        ...product,
        categoryId: product.categoryId ?? product.category,
        attributes: product.attributes ?? [],
        variants: product.variants ?? [],
        imageUrls: product.imageUrls ?? (product.imageUrl ? [product.imageUrl] : [])
      }));
    const needsMigration = migratedProducts.length !== storedProducts.length
      || storedProducts.some(product => !product.categoryId || !product.attributes || !product.variants);
    if (needsMigration) this.storage.setItem(PRODUCTS_STORAGE_KEY, migratedProducts);
    return migratedProducts;
  }

  private loadInventory(products: Product[]): ProductInventoryAllocation[] {
    const storedInventory = this.storage.getItem<ProductInventoryAllocation[]>(INVENTORY_STORAGE_KEY);
    if (storedInventory) {
      const needsMigration = storedInventory.some(allocation => allocation.reservedQuantity === undefined);
      const migrated = storedInventory.map(allocation => ({ ...allocation, reservedQuantity: allocation.reservedQuantity ?? 0 }));
      if (needsMigration) this.storage.setItem(INVENTORY_STORAGE_KEY, migrated);
      return migrated;
    }

    const timestamp = '2025-05-12T09:00:00.000Z';
    return products.flatMap<ProductInventoryAllocation>(product => {
      if (product.id === 'prod-301') {
        return [
          ['branch-hg-001', 30], ['branch-hg-002', 25], ['branch-hg-003', 20], ['branch-hg-004', 15], ['branch-hg-005', 5]
        ].map(([branchId, quantity], index) => ({
          id: `inventory-prod-301-${index + 1}`, productId: product.id, storeId: product.storeId,
          branchId: String(branchId), quantity: Number(quantity), reservedQuantity: 0, lowStockThreshold: 5, createdAt: timestamp, updatedAt: timestamp
        }));
      }
      return [{
        id: `inventory-${product.id}`, productId: product.id, storeId: product.storeId, branchId: null,
        quantity: product.stock, reservedQuantity: 0, lowStockThreshold: 10, createdAt: timestamp, updatedAt: timestamp
      }];
    });
  }

  private totalQuantity(inventory: ProductInventoryAllocation[]): number {
    return inventory.reduce((total, allocation) => total + allocation.quantity, 0);
  }

  private prepareProductData(data: ProductUpsert, productId: string): ProductUpsert {
    const seenSkus = new Set<string>();
    const seenCombinations = new Set<string>();
    const parentSku = data.sku.trim().toLowerCase();
    const variants = (data.variants ?? []).map(variant => {
      const sku = variant.sku.trim();
      const normalizedSku = sku.toLowerCase();
      const priceOverride = variant.priceOverride === undefined || variant.priceOverride === null
        ? undefined
        : Number(variant.priceOverride);
      if (!sku) throw new Error('Every product variant requires a SKU.');
      if (normalizedSku === parentSku || seenSkus.has(normalizedSku)) {
        throw new Error(`Variant SKU "${sku}" must be unique within this product.`);
      }
      if (priceOverride !== undefined && (!Number.isFinite(priceOverride) || priceOverride < 0)) {
        throw new Error(`Variant SKU "${sku}" has an invalid price override.`);
      }
      const combinationKey = variantCombinationKey(variant.attributes);
      if (!combinationKey || seenCombinations.has(combinationKey)) {
        throw new Error('Generated product variant combinations must be unique.');
      }
      seenSkus.add(normalizedSku);
      seenCombinations.add(combinationKey);
      return {
        ...variant,
        id: variant.id ?? this.createId('variant'),
        productId,
        sku,
        priceOverride,
        barcode: variant.barcode?.trim() || undefined,
        imageUrl: variant.imageUrl || undefined,
        attributes: variant.attributes.map(attribute => ({ ...attribute }))
      };
    });
    return {
      ...data,
      attributes: (data.attributes ?? []).map(attribute => ({
        ...attribute,
        value: Array.isArray(attribute.value) ? [...attribute.value] : attribute.value
      })),
      variants
    };
  }

  private createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private isGeneratedStoreProduct(product: Product): boolean {
    return GENERATED_PRODUCT_ID_SUFFIXES.some(suffix => product.id === `${product.storeId}-${suffix}`);
  }
}
