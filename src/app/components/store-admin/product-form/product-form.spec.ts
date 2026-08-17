import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { ProductUpsert, Store } from '../../../models/admin.models';
import { ProductService } from '../../../services/product.service';
import { StoreService } from '../../../services/store.service';
import { ProductForm } from './product-form';

describe('ProductForm dynamic specifications', () => {
  const store = {
    id: 'store-001',
    name: 'Catalog Test Store',
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
    createdAt: '2026-08-12',
    accentColor: '#6437e8',
    inventoryAllocationLimit: 1000,
  } satisfies Store;

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('replaces dynamic controls and validators when the category changes', () => {
    configure(null);
    const fixture = TestBed.createComponent(ProductForm);
    const component = fixture.componentInstance;

    component.productForm.controls.category.setValue('Mobile Phones');
    fixture.detectChanges();
    expect(component.attributeControls.contains('ram')).toBe(true);
    expect(component.attributeControls.contains('storage')).toBe(false);
    expect(component.attributeControls.contains('material')).toBe(false);
    expect(component.attributeControls.controls['ram'].invalid).toBe(true);
    expect(component.variantSelectionControls.contains('storage')).toBe(true);
    expect(component.variantSelectionControls.contains('color')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-dynamic-product-field'),
    ).toHaveLength(5);

    component.productForm.controls.category.setValue('Apparel');
    fixture.detectChanges();
    expect(component.attributeControls.contains('ram')).toBe(false);
    expect(component.attributeControls.contains('material')).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('app-dynamic-product-field'),
    ).toHaveLength(5);

    component.productForm.controls.category.setValue('Dresses');
    fixture.detectChanges();
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.checkbox-option'),
    ).toHaveLength(4);
  }, 15_000);

  it('generates unique editable variant rows from selected values', () => {
    configure(null);
    const fixture = TestBed.createComponent(ProductForm);
    const component = fixture.componentInstance;
    component.productForm.controls.sku.setValue('IP15');
    expect(component.productForm.controls.barcode.value).toBe('BC-IP15');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('#product-barcode')).toBeNull();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector('.barcode-preview svg'),
    ).not.toBeNull();
    component.productForm.controls.category.setValue('Mobile Phones');
    const storage = component.variantAttributes().find((attribute) => attribute.key === 'storage')!;
    const color = component.variantAttributes().find((attribute) => attribute.key === 'color')!;

    component.toggleVariantValue(storage, '128GB');
    component.toggleVariantValue(storage, '256GB');
    component.toggleVariantValue(color, 'Black');
    component.toggleVariantValue(color, 'Blue');
    component.generateVariants();
    fixture.detectChanges();

    expect(component.variantRows).toHaveLength(4);
    expect(
      component.variantRows.controls.map((group) =>
        component.variantName(group.controls.attributes.value),
      ),
    ).toEqual(['Black / 128GB', 'Black / 256GB', 'Blue / 128GB', 'Blue / 256GB']);
    expect(
      new Set(component.variantRows.controls.map((group) => group.controls.sku.value)).size,
    ).toBe(4);
    expect(
      component.variantRows.controls.every(
        (group) => group.controls.barcode.value === `BC-${group.controls.sku.value}`,
      ),
    ).toBe(true);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.variant-table tbody tr'),
    ).toHaveLength(4);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.variant-image-button'),
    ).toHaveLength(4);

    const priceInput = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
      '.price-input',
    )!;
    priceInput.value = '749.5';
    priceInput.dispatchEvent(new Event('input'));
    expect(component.variantRows.at(0).controls.priceOverride.value).toBe(749.5);
  });

  it('merges media and descriptions with a 100-word short description input', () => {
    configure(null);
    const fixture = TestBed.createComponent(ProductForm);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const shortDescription = element.querySelector<HTMLInputElement>('#short-description');

    expect(element.querySelectorAll('.media-description-section')).toHaveLength(1);
    expect(element.querySelector('.media-description-grid')).not.toBeNull();
    expect(shortDescription?.tagName).toBe('INPUT');
    expect(shortDescription?.type).toBe('text');

    component.productForm.controls.shortDescription.setValue(
      Array.from({ length: 100 }, () => 'word').join(' '),
    );
    expect(component.productForm.controls.shortDescription.valid).toBe(true);
    expect(component.wordCount(component.productForm.controls.shortDescription.value)).toBe(100);

    component.productForm.controls.shortDescription.setValue(
      Array.from({ length: 101 }, () => 'word').join(' '),
    );
    expect(component.productForm.controls.shortDescription.hasError('maxWords')).toBe(true);
  });

  it('keeps long-description typing left to right without resetting the caret content', () => {
    configure(null);
    const fixture = TestBed.createComponent(ProductForm);
    fixture.detectChanges();
    const editor = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
      '.editor-content',
    )!;

    editor.innerHTML = 'First';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    editor.innerHTML += ' second';
    editor.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(editor.dir).toBe('ltr');
    expect(editor.textContent).toBe('First second');
    expect(fixture.componentInstance.productForm.controls.description.value).toBe('First second');
  });

  it('restores saved category specifications in edit mode', () => {
    configure('edit-product');
    const productService = TestBed.inject(ProductService);
    const request = phoneRequest();
    const created = productService.createCatalogProduct(request);
    productService.updateProduct(created.id, { id: 'edit-product' });

    const fixture = TestBed.createComponent(ProductForm);
    const component = fixture.componentInstance;

    expect(component.productForm.controls.category.value).toBe('Mobile Phones');
    expect(component.attributeControls.controls['ram'].value).toBe('8GB');
    expect(component.variantSelectionControls.controls['storage'].value).toEqual(['256GB']);
    expect(component.variantSelectionControls.controls['color'].value).toEqual(['Black']);
    expect(component.variantRows).toHaveLength(1);
    expect(component.variantRows.at(0).controls.sku.value).toBe('EDIT-PHONE-BLK-256');
    expect(component.variantRows.at(0).controls.imageUrl.value).toBe(
      'data:image/png;base64,variant-test',
    );
  });

  it('validates variant-specific image uploads independently', async () => {
    configure(null);
    const component = TestBed.createComponent(ProductForm).componentInstance;
    component.productForm.controls.category.setValue('Mobile Phones');
    const storage = component.variantAttributes().find((attribute) => attribute.key === 'storage')!;
    const color = component.variantAttributes().find((attribute) => attribute.key === 'color')!;
    component.toggleVariantValue(storage, '128GB');
    component.toggleVariantValue(color, 'Black');
    component.generateVariants();
    const invalidFile = new File(['invalid'], 'variant.gif', { type: 'image/gif' });
    const input = { files: [invalidFile], value: 'variant.gif' };

    await component.onVariantImageSelected({ target: input } as unknown as Event, 0);

    expect(component.variantRows.at(0).controls.imageUrl.value).toBe('');
    expect(component.variantRows.at(0).controls.imageError.value).toMatch(/PNG, JPG, or WebP/);
  });

  function configure(productId: string | null): void {
    const selectedStore = signal(store);
    TestBed.configureTestingModule({
      imports: [ProductForm],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: (key: string) => (key === 'id' ? productId : null) } },
          },
        },
        {
          provide: StoreService,
          useValue: {
            selectedStore,
            getStoreById: (id: string) => (id === store.id ? store : undefined),
            changeSelectedStore: () => undefined,
            showToast: () => undefined,
          },
        },
      ],
    });
  }

  function phoneRequest(): ProductUpsert {
    return {
      storeId: store.id,
      name: 'Edit Phone',
      sku: 'EDIT-PHONE',
      categoryId: 'Mobile Phones',
      category: 'Mobile Phones',
      price: 500,
      status: 'active',
      imageUrl: '',
      description: '',
      tags: [],
      attributes: [{ attributeDefinitionId: 'mobile-phones-ram', key: 'ram', value: '8GB' }],
      variants: [
        {
          sku: 'EDIT-PHONE-BLK-256',
          status: 'active',
          imageUrl: 'data:image/png;base64,variant-test',
          attributes: [
            {
              attributeDefinitionId: 'mobile-phones-storage',
              attributeKey: 'storage',
              value: '256GB',
            },
            { attributeDefinitionId: 'mobile-phones-color', attributeKey: 'color', value: 'Black' },
          ],
        },
      ],
    };
  }
});
