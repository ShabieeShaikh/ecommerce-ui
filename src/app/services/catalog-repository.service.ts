import { Injectable, computed, inject, signal } from '@angular/core';
import {
  AttributeInputType,
  CatalogAttribute,
  CatalogAttributeUpsert,
  CatalogBrand,
  CatalogBrandUpsert,
  CatalogCategory,
  CatalogCategoryUpsert,
  CategoryAttributeAssignment,
  CategoryAttributeAssignmentInput
} from '../models/product-catalog.models';
import { LocalStorageService } from './local-storage.service';

const CATALOG_STORAGE_KEY = 'digishop_catalog_v1';
const SEED_TIMESTAMP = '2026-01-01T00:00:00.000Z';

interface CatalogState {
  categories: CatalogCategory[];
  attributes: CatalogAttribute[];
  assignments: CategoryAttributeAssignment[];
  brands: CatalogBrand[];
}

type SeedField = [
  key: string,
  label: string,
  inputType: AttributeInputType,
  required: boolean,
  options?: string[],
  unit?: string,
  isVariantAttribute?: boolean
];

const CATEGORY_NAMES = [
  'Fashion', 'Apparel', 'Dresses', 'Electronics', 'Mobile Phones', 'Laptops', 'Wearables', 'Audio',
  'Peripherals', 'Home & Living', 'Beauty', 'Sports', 'Books', 'General'
];

const CATEGORY_PARENTS: Record<string, string> = {
  Apparel: 'Fashion',
  Dresses: 'Fashion',
  'Mobile Phones': 'Electronics',
  Laptops: 'Electronics',
  Wearables: 'Electronics',
  Audio: 'Electronics',
  Peripherals: 'Electronics'
};

const SEED_DEFINITIONS: Record<string, SeedField[]> = {
  Apparel: [
    ['material', 'Material', 'select', true, ['Cotton', 'Linen', 'Wool', 'Polyester', 'Leather']],
    ['gender', 'Gender', 'select', true, ['Men', 'Women', 'Unisex', 'Kids']],
    ['fit', 'Fit', 'select', false, ['Regular', 'Slim', 'Relaxed', 'Oversized']],
    ['pattern', 'Pattern', 'text', false],
    ['sleeveType', 'Sleeve Type', 'select', false, ['Sleeveless', 'Short Sleeve', 'Long Sleeve']],
    ['color', 'Color', 'multi-select', true, ['Black', 'White', 'Blue', 'Red', 'Green'], undefined, true],
    ['size', 'Size', 'multi-select', true, ['XS', 'Small', 'Medium', 'Large', 'XL'], undefined, true]
  ],
  Dresses: [
    ['material', 'Material', 'select', true, ['Cotton', 'Silk', 'Linen', 'Chiffon', 'Polyester']],
    ['fit', 'Fit', 'select', true, ['Regular', 'Slim', 'Relaxed']],
    ['pattern', 'Pattern', 'text', false],
    ['sleeveType', 'Sleeve Type', 'select', false, ['Sleeveless', 'Short Sleeve', 'Long Sleeve']],
    ['occasion', 'Occasion', 'multi-select', false, ['Casual', 'Formal', 'Party', 'Wedding']],
    ['color', 'Color', 'multi-select', true, ['Black', 'White', 'Blue', 'Red'], undefined, true],
    ['size', 'Size', 'multi-select', true, ['XS', 'Small', 'Medium', 'Large', 'XL'], undefined, true]
  ],
  'Mobile Phones': [
    ['ram', 'RAM', 'select', true, ['4GB', '6GB', '8GB', '12GB', '16GB']],
    ['color', 'Color', 'multi-select', true, ['Black', 'White', 'Blue', 'Gold', 'Silver'], undefined, true],
    ['storage', 'Storage', 'multi-select', true, ['64GB', '128GB', '256GB', '512GB', '1TB'], undefined, true],
    ['screenSize', 'Screen Size', 'number', true, undefined, 'in'],
    ['processor', 'Processor', 'text', true],
    ['battery', 'Battery', 'number', false, undefined, 'mAh'],
    ['operatingSystem', 'Operating System', 'select', true, ['Android', 'iOS', 'Other']]
  ],
  Laptops: [
    ['processor', 'Processor', 'text', true],
    ['ram', 'RAM', 'select', true, ['8GB', '16GB', '32GB', '64GB']],
    ['color', 'Color', 'multi-select', false, ['Black', 'Silver', 'Gray', 'Blue'], undefined, true],
    ['storage', 'Storage', 'multi-select', true, ['256GB SSD', '512GB SSD', '1TB SSD', '2TB SSD'], undefined, true],
    ['gpu', 'GPU', 'text', false],
    ['screenSize', 'Screen Size', 'number', true, undefined, 'in'],
    ['touchscreen', 'Touchscreen', 'boolean', false]
  ],
  Wearables: [
    ['display', 'Display', 'text', true],
    ['batteryLife', 'Battery Life', 'number', true, undefined, 'hours'],
    ['gps', 'GPS', 'boolean', false],
    ['waterResistance', 'Water Resistance', 'text', false],
    ['connectivity', 'Connectivity', 'multi-select', false, ['Bluetooth', 'Wi-Fi', 'LTE', 'NFC']],
    ['bandColor', 'Band Color', 'multi-select', false, ['Black', 'White', 'Blue', 'Pink'], undefined, true]
  ],
  Electronics: [
    ['model', 'Model', 'text', true],
    ['power', 'Power', 'number', false, undefined, 'W'],
    ['connectivity', 'Connectivity', 'multi-select', false, ['Bluetooth', 'Wi-Fi', 'USB', 'HDMI']],
    ['energyEfficient', 'Energy Efficient', 'boolean', false]
  ],
  Audio: [
    ['audioType', 'Audio Type', 'select', true, ['Headphones', 'Earbuds', 'Speaker', 'Microphone']],
    ['connectivity', 'Connectivity', 'multi-select', true, ['Bluetooth', 'Wi-Fi', '3.5mm', 'USB']],
    ['batteryLife', 'Battery Life', 'number', false, undefined, 'hours'],
    ['noiseCancellation', 'Noise Cancellation', 'boolean', false],
    ['color', 'Color', 'multi-select', false, ['Black', 'White', 'Blue'], undefined, true]
  ],
  Peripherals: [
    ['deviceType', 'Device Type', 'text', true],
    ['connectivity', 'Connectivity', 'multi-select', true, ['USB', 'Bluetooth', 'Wireless 2.4GHz']],
    ['compatibleSystems', 'Compatible Systems', 'multi-select', false, ['Windows', 'macOS', 'Linux']],
    ['technicalNotes', 'Technical Notes', 'textarea', false]
  ],
  'Home & Living': [
    ['material', 'Material', 'text', true],
    ['colorFamily', 'Color Family', 'text', false],
    ['room', 'Suitable Room', 'multi-select', false, ['Living Room', 'Bedroom', 'Kitchen', 'Garden']],
    ['careInstructions', 'Care Instructions', 'textarea', false]
  ],
  Beauty: [
    ['skinType', 'Skin Type', 'multi-select', false, ['Normal', 'Dry', 'Oily', 'Combination', 'Sensitive']],
    ['volume', 'Volume', 'number', false, undefined, 'ml'],
    ['vegan', 'Vegan', 'boolean', false],
    ['ingredients', 'Key Ingredients', 'textarea', false]
  ],
  Sports: [
    ['sportType', 'Sport Type', 'text', true],
    ['material', 'Material', 'text', false],
    ['skillLevel', 'Skill Level', 'select', false, ['Beginner', 'Intermediate', 'Advanced', 'Professional']],
    ['indoorOutdoor', 'Use', 'select', false, ['Indoor', 'Outdoor', 'Both']]
  ],
  Books: [
    ['author', 'Author', 'text', true],
    ['publisher', 'Publisher', 'text', false],
    ['language', 'Language', 'text', true],
    ['pageCount', 'Page Count', 'number', false, undefined, 'pages'],
    ['format', 'Format', 'select', true, ['Hardcover', 'Paperback', 'E-book', 'Audiobook']]
  ],
  General: [
    ['model', 'Model', 'text', false],
    ['material', 'Material', 'text', false],
    ['features', 'Key Features', 'textarea', false]
  ]
};

@Injectable({ providedIn: 'root' })
export class CatalogRepositoryService {
  private readonly storage = inject(LocalStorageService);
  private readonly stateSignal = signal<CatalogState>(this.loadState());

  readonly categories = computed(() => this.stateSignal().categories);
  readonly attributes = computed(() => this.stateSignal().attributes);
  readonly assignments = computed(() => this.stateSignal().assignments);
  readonly brands = computed(() => this.stateSignal().brands);

  createCategory(input: CatalogCategoryUpsert): CatalogCategory {
    this.assertUniqueCategoryName(input.name);
    this.assertParent(null, input.parentCategoryId);
    const timestamp = new Date().toISOString();
    const category: CatalogCategory = {
      id: this.createId('category'),
      name: input.name.trim(),
      parentCategoryId: input.parentCategoryId || null,
      description: input.description.trim(),
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.commit({ ...this.stateSignal(), categories: [...this.categories(), category] });
    return category;
  }

  updateCategory(id: string, input: CatalogCategoryUpsert): CatalogCategory {
    const existing = this.requireCategory(id);
    this.assertUniqueCategoryName(input.name, id);
    this.assertParent(id, input.parentCategoryId);
    const category: CatalogCategory = {
      ...existing,
      name: input.name.trim(),
      parentCategoryId: input.parentCategoryId || null,
      description: input.description.trim(),
      status: input.status,
      updatedAt: new Date().toISOString()
    };
    this.commit({ ...this.stateSignal(), categories: this.categories().map(item => item.id === id ? category : item) });
    return category;
  }

  createAttribute(input: CatalogAttributeUpsert): CatalogAttribute {
    this.assertUniqueAttributeKey(input.key);
    const timestamp = new Date().toISOString();
    const attribute: CatalogAttribute = {
      ...this.cleanAttributeInput(input),
      id: this.createId('attribute'),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.commit({ ...this.stateSignal(), attributes: [...this.attributes(), attribute] });
    return attribute;
  }

  updateAttribute(id: string, input: CatalogAttributeUpsert): CatalogAttribute {
    const existing = this.requireAttribute(id);
    if (existing.key !== input.key.trim() && this.assignments().some(assignment => assignment.attributeId === id)) {
      throw new Error('The key cannot be changed while this attribute is assigned to categories.');
    }
    this.assertUniqueAttributeKey(input.key, id);
    const attribute: CatalogAttribute = {
      ...existing,
      ...this.cleanAttributeInput(input),
      updatedAt: new Date().toISOString()
    };
    this.commit({ ...this.stateSignal(), attributes: this.attributes().map(item => item.id === id ? attribute : item) });
    return attribute;
  }

  createBrand(input: CatalogBrandUpsert): CatalogBrand {
    this.assertUniqueBrandName(input.name);
    const timestamp = new Date().toISOString();
    const brand: CatalogBrand = {
      id: this.createId('brand'),
      name: input.name.trim(),
      logoUrl: input.logoUrl.trim(),
      description: input.description.trim(),
      status: input.status,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    this.commit({ ...this.stateSignal(), brands: [...this.brands(), brand] });
    return brand;
  }

  updateBrand(id: string, input: CatalogBrandUpsert): CatalogBrand {
    const existing = this.requireBrand(id);
    this.assertUniqueBrandName(input.name, id);
    const brand: CatalogBrand = {
      ...existing,
      name: input.name.trim(),
      logoUrl: input.logoUrl.trim(),
      description: input.description.trim(),
      status: input.status,
      updatedAt: new Date().toISOString()
    };
    this.commit({ ...this.stateSignal(), brands: this.brands().map(item => item.id === id ? brand : item) });
    return brand;
  }

  replaceAssignments(categoryId: string, inputs: CategoryAttributeAssignmentInput[]): CategoryAttributeAssignment[] {
    this.requireCategory(categoryId);
    const seen = new Set<string>();
    const assignments = inputs.map((input, index) => {
      this.requireAttribute(input.attributeId);
      if (seen.has(input.attributeId)) throw new Error('An attribute can only be assigned once to a category.');
      seen.add(input.attributeId);
      return {
        ...input,
        id: input.id || this.createId('assignment'),
        categoryId,
        unit: input.unit.trim(),
        sortOrder: index + 1
      };
    });
    this.commit({
      ...this.stateSignal(),
      assignments: [...this.assignments().filter(item => item.categoryId !== categoryId), ...assignments]
    });
    return assignments;
  }

  private cleanAttributeInput(input: CatalogAttributeUpsert): CatalogAttributeUpsert {
    const supportsOptions = input.inputType === 'select' || input.inputType === 'multi-select';
    return {
      key: input.key.trim(),
      label: input.label.trim(),
      inputType: input.inputType,
      description: input.description.trim(),
      placeholder: input.placeholder.trim(),
      status: input.status,
      options: supportsOptions
        ? input.options.map((option, index) => ({ ...option, label: option.label.trim(), value: option.value.trim(), sortOrder: index + 1 }))
        : []
    };
  }

  private assertUniqueCategoryName(name: string, ignoreId?: string): void {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new Error('Category name is required.');
    if (this.categories().some(item => item.id !== ignoreId && item.name.toLowerCase() === normalized)) {
      throw new Error('A category with this name already exists.');
    }
  }

  private assertUniqueAttributeKey(key: string, ignoreId?: string): void {
    const normalized = key.trim().toLowerCase();
    if (!/^[a-z][a-zA-Z0-9]*$/.test(key.trim())) throw new Error('Attribute key must use camelCase letters and numbers.');
    if (this.attributes().some(item => item.id !== ignoreId && item.key.toLowerCase() === normalized)) {
      throw new Error('An attribute with this key already exists.');
    }
  }

  private assertUniqueBrandName(name: string, ignoreId?: string): void {
    const normalized = name.trim().toLowerCase();
    if (!normalized) throw new Error('Brand name is required.');
    if (this.brands().some(item => item.id !== ignoreId && item.name.toLowerCase() === normalized)) {
      throw new Error('A brand with this name already exists.');
    }
  }

  private assertParent(categoryId: string | null, parentId: string | null): void {
    if (!parentId) return;
    this.requireCategory(parentId);
    if (parentId === categoryId) throw new Error('A category cannot be its own parent.');
    let current = this.categories().find(item => item.id === parentId);
    const visited = new Set<string>();
    while (current) {
      if (current.id === categoryId) throw new Error('This parent would create a circular category hierarchy.');
      if (visited.has(current.id)) throw new Error('The category hierarchy contains a circular relationship.');
      visited.add(current.id);
      current = current.parentCategoryId
        ? this.categories().find(item => item.id === current?.parentCategoryId)
        : undefined;
    }
  }

  private requireCategory(id: string): CatalogCategory {
    const category = this.categories().find(item => item.id === id);
    if (!category) throw new Error('The selected category could not be found.');
    return category;
  }

  private requireAttribute(id: string): CatalogAttribute {
    const attribute = this.attributes().find(item => item.id === id);
    if (!attribute) throw new Error('The selected attribute could not be found.');
    return attribute;
  }

  private requireBrand(id: string): CatalogBrand {
    const brand = this.brands().find(item => item.id === id);
    if (!brand) throw new Error('The selected brand could not be found.');
    return brand;
  }

  private loadState(): CatalogState {
    const stored = this.storage.getItem<CatalogState>(CATALOG_STORAGE_KEY);
    if (stored?.categories?.length && stored.attributes && stored.assignments && stored.brands) return stored;
    const seed = createSeedState();
    this.storage.setItem(CATALOG_STORAGE_KEY, seed);
    return seed;
  }

  private commit(state: CatalogState): void {
    this.storage.setItem(CATALOG_STORAGE_KEY, state);
    this.stateSignal.set(state);
  }

  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

function createSeedState(): CatalogState {
  const categories: CatalogCategory[] = CATEGORY_NAMES.map(name => ({
    id: name,
    name,
    parentCategoryId: CATEGORY_PARENTS[name] ?? null,
    description: `${name} catalog configuration and product specifications.`,
    status: 'active',
    createdAt: SEED_TIMESTAMP,
    updatedAt: SEED_TIMESTAMP
  }));
  const attributesByKey = new Map<string, CatalogAttribute>();
  const assignments: CategoryAttributeAssignment[] = [];

  Object.entries(SEED_DEFINITIONS).forEach(([categoryId, fields]) => {
    fields.forEach(([key, label, inputType, required, options = [], unit = '', isVariantAttribute = false], index) => {
      const existing = attributesByKey.get(key);
      const optionValues = [...new Set([...(existing?.options.map(option => option.value) ?? []), ...options])];
      const attributeId = existing?.id ?? `attribute-${slug(key)}`;
      attributesByKey.set(key, {
        id: attributeId,
        key,
        label: existing?.label ?? label,
        inputType: existing?.inputType ?? inputType,
        description: existing?.description ?? `${label} product specification.`,
        placeholder: existing?.placeholder ?? (inputType === 'textarea' ? `Enter ${label.toLowerCase()}` : `Enter or select ${label.toLowerCase()}`),
        status: 'active',
        options: optionValues.map((value, optionIndex) => ({
          id: `${attributeId}-option-${slug(value)}`,
          label: value,
          value,
          status: 'active',
          sortOrder: optionIndex + 1
        })),
        createdAt: SEED_TIMESTAMP,
        updatedAt: SEED_TIMESTAMP
      });
      assignments.push({
        id: `${slug(categoryId)}-${key}`,
        categoryId,
        attributeId,
        required,
        isVariantAttribute,
        unit,
        sortOrder: index + 1
      });
    });
  });

  const brands = ['Atelier Bloom', 'Denim House', 'KeyForge', 'North & Hide', 'SonicPro', 'Terra Form', 'Unbranded']
    .map(name => ({
      id: `brand-${slug(name)}`,
      name,
      logoUrl: '',
      description: `${name} products.`,
      status: 'active' as const,
      createdAt: SEED_TIMESTAMP,
      updatedAt: SEED_TIMESTAMP
    }));

  return { categories, attributes: [...attributesByKey.values()], assignments, brands };
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
