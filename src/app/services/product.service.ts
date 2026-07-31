import { Injectable, signal, computed } from '@angular/core';

export interface Product {
  id: string;
  storeId: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  comparePrice?: number;
  stock: number;
  status: 'active' | 'draft' | 'archived';
  imageUrl: string;
  description: string;
  tags: string[];
  weight?: number;
  dimensions?: string;
  rating: number;
  salesCount: number;
}

const INITIAL_PRODUCTS: Product[] = [
  // Fashion Hub (store-001)
  {
    id: 'prod-101', storeId: 'store-001', name: 'Classic Leather Jacket', sku: 'FH-JKT-001', category: 'Apparel',
    price: 189.99, comparePrice: 229.99, stock: 45, status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1551028719-00167b16eac5?w=500&auto=format&fit=crop&q=60',
    description: 'Premium genuine leather jacket with sleek metallic hardware and inner quilted lining.',
    tags: ['leather', 'outerwear', 'bestseller'], weight: 1.2, dimensions: '40x30x5 cm', rating: 4.8, salesCount: 320
  },
  {
    id: 'prod-102', storeId: 'store-001', name: 'Slim Fit Denim Jeans', sku: 'FH-JNS-002', category: 'Apparel',
    price: 69.50, comparePrice: 89.99, stock: 120, status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1542272604-780c96856592?w=500&auto=format&fit=crop&q=60',
    description: 'Stretch denim jeans crafted for comfort and flexibility with dark wash finish.',
    tags: ['denim', 'casual'], weight: 0.7, dimensions: '35x25x4 cm', rating: 4.6, salesCount: 540
  },
  {
    id: 'prod-103', storeId: 'store-001', name: 'Silk Floral Evening Dress', sku: 'FH-DRS-003', category: 'Dresses',
    price: 145.00, comparePrice: 175.00, stock: 8, status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
    description: 'Elegant silk floral print dress suitable for evening gatherings and celebrations.',
    tags: ['silk', 'formal'], weight: 0.4, dimensions: '30x20x3 cm', rating: 4.9, salesCount: 110
  },

  // TechZone (store-002)
  {
    id: 'prod-201', storeId: 'store-002', name: 'Noise-Canceling Wireless Headphones', sku: 'TZ-HDP-101', category: 'Audio',
    price: 249.99, comparePrice: 299.99, stock: 65, status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500&auto=format&fit=crop&q=60',
    description: 'Immersive sound quality with active noise cancellation and 40-hour battery life.',
    tags: ['wireless', 'audio', 'bluetooth'], weight: 0.3, dimensions: '20x18x8 cm', rating: 4.7, salesCount: 890
  },
  {
    id: 'prod-202', storeId: 'store-002', name: 'Mechanical RGB Gaming Keyboard', sku: 'TZ-KBD-102', category: 'Peripherals',
    price: 119.00, stock: 40, status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1587829741301-dc798b83add3?w=500&auto=format&fit=crop&q=60',
    description: 'Tactile mechanical switches with per-key customizable RGB illumination.',
    tags: ['gaming', 'rgb', 'keyboard'], weight: 0.9, dimensions: '44x14x4 cm', rating: 4.8, salesCount: 420
  },

  // Home & Garden Co (store-003)
  {
    id: 'prod-301', storeId: 'store-003', name: 'Minimalist Ceramic Plant Pot', sku: 'HG-POT-301', category: 'Decor',
    price: 34.99, stock: 95, status: 'active',
    imageUrl: 'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=500&auto=format&fit=crop&q=60',
    description: 'Handcrafted ceramic pot with drainage hole, ideal for indoor succulents.',
    tags: ['plant', 'ceramic', 'decor'], weight: 1.1, dimensions: '15x15x15 cm', rating: 4.5, salesCount: 230
  }
];

const LS_PRODS_KEY = 'digishop_products_v1';

function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(LS_PRODS_KEY);
    if (raw) return JSON.parse(raw) as Product[];
  } catch { /* ignore */ }
  return INITIAL_PRODUCTS;
}

function saveProducts(prods: Product[]): void {
  try { localStorage.setItem(LS_PRODS_KEY, JSON.stringify(prods)); } catch { /* ignore */ }
}

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private productsSignal = signal<Product[]>(loadProducts());
  readonly products = this.productsSignal.asReadonly();

  getProductsByStore(storeId: string): Product[] {
    return this.productsSignal().filter(p => p.storeId === storeId);
  }

  addProduct(productData: Partial<Product>): Product {
    const id = `prod-${Date.now().toString().slice(-4)}`;
    const newProduct: Product = {
      id,
      storeId: productData.storeId || 'store-001',
      name: productData.name || 'New Product',
      sku: productData.sku || `SKU-${Date.now().toString().slice(-4)}`,
      category: productData.category || 'General',
      price: productData.price || 19.99,
      comparePrice: productData.comparePrice,
      stock: productData.stock ?? 10,
      status: productData.status || 'active',
      imageUrl: productData.imageUrl || 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=500&auto=format&fit=crop&q=60',
      description: productData.description || 'Standard product description.',
      tags: productData.tags || ['new'],
      weight: productData.weight || 0.5,
      dimensions: productData.dimensions || '10x10x10 cm',
      rating: 5.0,
      salesCount: 0
    };

    this.productsSignal.update(prods => {
      const updated = [newProduct, ...prods];
      saveProducts(updated);
      return updated;
    });

    return newProduct;
  }

  updateProduct(id: string, updatedFields: Partial<Product>): void {
    this.productsSignal.update(prods => {
      const updated = prods.map(p => p.id === id ? { ...p, ...updatedFields } : p);
      saveProducts(updated);
      return updated;
    });
  }

  deleteProduct(id: string): void {
    this.productsSignal.update(prods => {
      const updated = prods.filter(p => p.id !== id);
      saveProducts(updated);
      return updated;
    });
  }
}
