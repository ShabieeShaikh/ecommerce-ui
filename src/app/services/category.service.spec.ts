import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AttributeService } from './attribute.service';
import { CategoryService } from './category.service';

describe('CategoryService', () => {
  let service: CategoryService;

  beforeEach(() => {
    localStorage.removeItem('digishop_catalog_v1');
    TestBed.configureTestingModule({});
    service = TestBed.inject(CategoryService);
  });

  it('returns different ordered definitions for different categories', async () => {
    const clothing = await firstValueFrom(service.getCategoryAttributes('Apparel'));
    const phones = await firstValueFrom(service.getCategoryAttributes('Mobile Phones'));

    expect(clothing.map(attribute => attribute.key)).toContain('material');
    expect(phones.map(attribute => attribute.key)).toContain('ram');
    expect(phones.map(attribute => attribute.key)).not.toContain('material');
    expect(phones.map(attribute => attribute.sortOrder)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(phones.filter(attribute => attribute.isVariantAttribute).map(attribute => attribute.key)).toEqual(['color', 'storage']);
  });

  it('returns defensive copies suitable for replacement by an API adapter', async () => {
    const first = await firstValueFrom(service.getCategoryAttributes('Wearables'));
    first[0].label = 'Changed in caller';
    const second = await firstValueFrom(service.getCategoryAttributes('Wearables'));

    expect(second[0].label).toBe('Display');
  });

  it('makes newly assigned attributes available through the existing product-form contract', async () => {
    const category = service.createCategory({
      name: 'Test Catalog Category', parentCategoryId: null, description: '', status: 'active'
    });
    const attributeService = TestBed.inject(AttributeService);
    const attribute = attributeService.createAttribute({
      key: 'testNfc', label: 'NFC', inputType: 'boolean', description: '', placeholder: '', status: 'active', options: []
    });
    service.assignAttributes(category.id, [{
      attributeId: attribute.id, required: true, isVariantAttribute: false, unit: '', sortOrder: 1
    }]);

    const definitions = await firstValueFrom(service.getCategoryAttributes(category.id));

    expect(definitions).toEqual([expect.objectContaining({ key: 'testNfc', required: true, inputType: 'boolean' })]);
  });

  it('rejects circular category relationships', () => {
    const parent = service.createCategory({ name: 'Test Parent', parentCategoryId: null, description: '', status: 'active' });
    const child = service.createCategory({ name: 'Test Child', parentCategoryId: parent.id, description: '', status: 'active' });

    expect(() => service.updateCategory(parent.id, {
      name: 'Test Parent', parentCategoryId: child.id, description: '', status: 'active'
    })).toThrowError(/circular/);
  });
});
