import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Product, Store } from '../../../models/admin.models';
import { InventoryBalanceView } from '../../../models/inventory.models';
import { InventoryService } from '../../../services/inventory.service';
import { ProductService } from '../../../services/product.service';
import { StoreService } from '../../../services/store.service';
import { Products } from './products';

describe('Products stock summary', () => {
  const store = {
    id: 'store-test',
    name: 'Stock Test Store',
    category: 'General',
    status: 'active',
    owner: 'Owner',
    email: 'owner@example.com',
    phone: '1234',
    city: 'Karachi',
    country: 'Pakistan',
    revenue: 0,
    orders: 0,
    visitors: 0,
    rating: 0,
    createdAt: '2026-08-17',
    accentColor: '#6437e8',
    inventoryAllocationLimit: 1000,
  } satisfies Store;

  const products = signal<Product[]>([
    product('low', 'active'),
    product('regular', 'active'),
    product('empty', 'active'),
    product('draft', 'draft'),
    { ...product('other-store', 'active'), storeId: 'another-store' },
  ]);
  const balances = signal<InventoryBalanceView[]>([
    balance('low', 4, 'store'),
    balance('low', 3, 'branch:one'),
    balance('regular', 20, 'store'),
    balance('empty', 0, 'store'),
    balance('draft', 50, 'store'),
    { ...balance('other-store', 100, 'store'), storeId: 'another-store' },
  ]);

  beforeEach(() => {
    products.set([
      product('low', 'active'),
      product('regular', 'active'),
      product('empty', 'active'),
      product('draft', 'draft'),
      { ...product('other-store', 'active'), storeId: 'another-store' },
    ]);
    balances.set([
      balance('low', 4, 'store'),
      balance('low', 3, 'branch:one'),
      balance('regular', 20, 'store'),
      balance('empty', 0, 'store'),
      balance('draft', 50, 'store'),
      { ...balance('other-store', 100, 'store'), storeId: 'another-store' },
    ]);

    TestBed.configureTestingModule({
      imports: [Products],
      providers: [
        provideRouter([]),
        { provide: StoreService, useValue: { selectedStore: signal(store), showToast: () => {} } },
        { provide: ProductService, useValue: { products } },
        {
          provide: InventoryService,
          useValue: {
            getBalances: (storeId: string) => balances().filter((item) => item.storeId === storeId),
          },
        },
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('sums stock units across every active product', () => {
    const fixture = TestBed.createComponent(Products);
    const component = fixture.componentInstance;
    fixture.detectChanges();

    expect(component.stockFor(products()[0])).toBe(7);
    expect(statValue(component, 'In Stock')).toBe('27');
    expect(statValue(component, 'Low Stock')).toBe('1');
    const inStockCard = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.summary-card'),
    ).find((card) => card.textContent?.includes('In Stock'));
    expect(inStockCard?.querySelector('strong')?.textContent?.trim()).toBe('27');
  }, 15_000);

  it('excludes zero-stock and non-active products from in-stock units', () => {
    const component = TestBed.createComponent(Products).componentInstance;

    expect(component.stockFor(products()[2])).toBe(0);
    expect(component.stockFor(products()[3])).toBe(50);
    expect(statValue(component, 'In Stock')).toBe('27');
  });

  it('updates the cards when inventory balances change', () => {
    const component = TestBed.createComponent(Products).componentInstance;
    balances.update((items) => items.filter((item) => item.productId !== 'low'));

    expect(component.stockFor(products()[0])).toBe(0);
    expect(statValue(component, 'In Stock')).toBe('20');
    expect(statValue(component, 'Low Stock')).toBe('0');
  });

  function statValue(component: Products, label: string): string | undefined {
    return component.stats().find((item) => item.label === label)?.value;
  }

  function product(id: string, status: Product['status']): Product {
    return {
      id,
      storeId: store.id,
      name: `Product ${id}`,
      sku: `SKU-${id}`,
      category: 'General',
      price: 10,
      stock: 0,
      status,
      imageUrl: '',
      description: '',
      tags: [],
      rating: 0,
      salesCount: 0,
    };
  }

  function balance(productId: string, quantity: number, locationId: string): InventoryBalanceView {
    return {
      id: `${productId}-${locationId}`,
      storeId: store.id,
      productId,
      variantId: null,
      locationId,
      quantity,
      reservedQuantity: 0,
      lowStockThreshold: 15,
      averageUnitCost: 0,
      createdAt: '2026-08-17',
      updatedAt: '2026-08-17',
      location: {
        key: locationId,
        storeId: store.id,
        type: locationId.startsWith('branch:') ? 'branch' : 'store',
        entityId: locationId.startsWith('branch:') ? 'one' : null,
        name: locationId,
        code: locationId,
        active: true,
      },
      availableQuantity: quantity,
    };
  }
});
