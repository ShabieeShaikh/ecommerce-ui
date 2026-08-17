import { TestBed } from '@angular/core/testing';
import { ProductUpsert } from '../models/admin.models';
import { ProductService } from './product.service';

describe('ProductService catalog operations', () => {
  let service: ProductService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(ProductService);
  });

  afterEach(() => localStorage.clear());

  it('stores category specifications while creating catalog products with zero inventory', () => {
    const request = phoneRequest();
    request.variants![0].priceOverride = 749.5;
    const product = service.createCatalogProduct(request);

    expect(product.stock).toBe(0);
    expect(product.attributes).toEqual(request.attributes);
    expect(product.variants).toHaveLength(1);
    expect(product.variants?.[0].id).toBeTruthy();
    expect(product.variants?.[0].productId).toBe(product.id);
    expect(product.variants?.[0].priceOverride).toBe(749.5);
    expect(product.variants?.[0].imageUrl).toBe('data:image/png;base64,variant-test');
    expect(service.getInventoryForProduct(product.id)).toHaveLength(0);
    const savedProduct = JSON.parse(localStorage.getItem('digishop_products_v1') ?? '[]')[0];
    expect(savedProduct.attributes).toEqual(request.attributes);
    expect(savedProduct.variants[0].priceOverride).toBe(749.5);
  });

  it('updates specifications without changing existing inventory', () => {
    const product = service.createProduct(phoneRequest(), [{
      storeId: 'store-001', branchId: null, quantity: 25, lowStockThreshold: 5
    }]);
    const inventoryBefore = service.getInventoryForProduct(product.id);
    const updated = service.updateCatalogProduct(product.id, {
      ...phoneRequest(),
      attributes: [
        { attributeDefinitionId: 'mobile-ram', key: 'ram', value: '12GB' },
        { attributeDefinitionId: 'mobile-storage', key: 'storage', value: '512GB' }
      ]
    });

    expect(updated?.stock).toBe(25);
    expect(updated?.attributes?.[0].value).toBe('12GB');
    expect(service.getInventoryForProduct(product.id)).toEqual(inventoryBefore);
  });

  it('rejects duplicate variant SKUs without persisting the product', () => {
    const request = phoneRequest();
    request.variants = [request.variants![0], {
      ...request.variants![0],
      attributes: request.variants![0].attributes.map(attribute => ({
        ...attribute,
        value: attribute.attributeKey === 'color' ? 'Blue' : attribute.value
      }))
    }];

    expect(() => service.createCatalogProduct(request)).toThrowError(/must be unique/);
    expect(service.getProducts().some(product => product.name === request.name)).toBe(false);
  });
});

function phoneRequest(): ProductUpsert {
  return {
    storeId: 'store-001',
    name: 'Catalog Test Phone',
    sku: 'CAT-PHONE-001',
    categoryId: 'Mobile Phones',
    category: 'Mobile Phones',
    price: 999,
    status: 'active',
    imageUrl: '',
    description: 'Catalog test product',
    tags: ['Mobile Phones'],
    attributes: [
      { attributeDefinitionId: 'mobile-ram', key: 'ram', value: '8GB' },
    ],
    variants: [{
      sku: 'CAT-PHONE-BLK-256', status: 'active', imageUrl: 'data:image/png;base64,variant-test',
      attributes: [
        { attributeDefinitionId: 'mobile-storage', attributeKey: 'storage', value: '256GB' },
        { attributeDefinitionId: 'mobile-color', attributeKey: 'color', value: 'Black' }
      ]
    }]
  };
}
