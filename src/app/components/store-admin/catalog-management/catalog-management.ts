import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  AttributeInputType,
  CatalogAttribute,
  CatalogAttributeOption,
  CatalogBrand,
  CatalogCategory,
  CatalogEntityStatus
} from '../../../models/product-catalog.models';
import { AttributeService } from '../../../services/attribute.service';
import { BrandService } from '../../../services/brand.service';
import { CategoryService } from '../../../services/category.service';
import { ProductService } from '../../../services/product.service';
import { StoreService } from '../../../services/store.service';

type CatalogSection = 'categories' | 'attributes' | 'brands';
type EditorMode = 'create' | 'edit';

interface CategoryDraft {
  id: string;
  name: string;
  parentCategoryId: string;
  description: string;
  status: CatalogEntityStatus;
}

interface AttributeDraft {
  id: string;
  key: string;
  label: string;
  inputType: AttributeInputType;
  description: string;
  placeholder: string;
  status: CatalogEntityStatus;
  options: CatalogAttributeOption[];
}

interface BrandDraft {
  id: string;
  name: string;
  logoUrl: string;
  description: string;
  status: CatalogEntityStatus;
}

@Component({
  selector: 'app-catalog-management',
  imports: [FormsModule, DatePipe],
  templateUrl: './catalog-management.html',
  styleUrl: './catalog-management.css'
})
export class CatalogManagement {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly attributeService = inject(AttributeService);
  private readonly brandService = inject(BrandService);
  private readonly productService = inject(ProductService);
  private readonly storeService = inject(StoreService);

  readonly section = signal<CatalogSection>(this.route.snapshot.data['catalogSection'] ?? 'categories');
  readonly searchQuery = signal('');
  readonly editorMode = signal<EditorMode>('create');
  readonly editorOpen = signal(false);
  readonly submitted = signal(false);
  readonly errorMessage = signal('');
  readonly optionLabel = signal('');
  readonly logoError = signal('');

  readonly categories = this.categoryService.categories;
  readonly attributes = this.attributeService.attributes;
  readonly brands = this.brandService.brands;
  readonly assignments = this.categoryService.assignments;

  readonly categoryDraft = signal<CategoryDraft>(this.emptyCategoryDraft());
  readonly attributeDraft = signal<AttributeDraft>(this.emptyAttributeDraft());
  readonly brandDraft = signal<BrandDraft>(this.emptyBrandDraft());

  readonly filteredCategories = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return this.categories().filter(category => !query
      || category.name.toLowerCase().includes(query)
      || this.parentName(category).toLowerCase().includes(query));
  });
  readonly filteredAttributes = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return this.attributes().filter(attribute => !query
      || attribute.label.toLowerCase().includes(query)
      || attribute.key.toLowerCase().includes(query)
      || attribute.inputType.includes(query));
  });
  readonly filteredBrands = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    return this.brands().filter(brand => !query || brand.name.toLowerCase().includes(query));
  });

  readonly activeCount = computed(() => this.section() === 'categories'
    ? this.categories().filter(item => item.status === 'active').length
    : this.section() === 'attributes'
      ? this.attributes().filter(item => item.status === 'active').length
      : this.brands().filter(item => item.status === 'active').length);

  readonly totalCount = computed(() => this.section() === 'categories'
    ? this.categories().length
      : this.section() === 'attributes' ? this.attributes().length : this.brands().length);
  readonly subcategoryTotal = computed(() => this.categories().filter(category => category.parentCategoryId).length);

  readonly inputTypes: Array<{ value: AttributeInputType; label: string }> = [
    { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' },
    { value: 'textarea', label: 'Textarea' }, { value: 'select', label: 'Select' },
    { value: 'multi-select', label: 'Multi Select' }, { value: 'boolean', label: 'Boolean' }
  ];

  openCreate(): void {
    this.editorMode.set('create');
    this.submitted.set(false);
    this.errorMessage.set('');
    this.logoError.set('');
    if (this.section() === 'categories') this.categoryDraft.set(this.emptyCategoryDraft());
    if (this.section() === 'attributes') this.attributeDraft.set(this.emptyAttributeDraft());
    if (this.section() === 'brands') this.brandDraft.set(this.emptyBrandDraft());
    this.editorOpen.set(true);
  }

  editCategory(category: CatalogCategory): void {
    this.editorMode.set('edit');
    this.categoryDraft.set({
      id: category.id, name: category.name, parentCategoryId: category.parentCategoryId ?? '',
      description: category.description, status: category.status
    });
    this.openEditor();
  }

  editAttribute(attribute: CatalogAttribute): void {
    this.editorMode.set('edit');
    this.attributeDraft.set({
      id: attribute.id, key: attribute.key, label: attribute.label, inputType: attribute.inputType,
      description: attribute.description, placeholder: attribute.placeholder, status: attribute.status,
      options: attribute.options.map(option => ({ ...option }))
    });
    this.openEditor();
  }

  editBrand(brand: CatalogBrand): void {
    this.editorMode.set('edit');
    this.brandDraft.set({ ...brand });
    this.openEditor();
  }

  closeEditor(): void {
    this.editorOpen.set(false);
    this.submitted.set(false);
    this.errorMessage.set('');
    this.optionLabel.set('');
  }

  saveCategory(): void {
    this.submitted.set(true);
    const draft = this.categoryDraft();
    if (!draft.name.trim()) return;
    this.execute(() => draft.id
      ? this.categoryService.updateCategory(draft.id, { ...draft, parentCategoryId: draft.parentCategoryId || null })
      : this.categoryService.createCategory({ ...draft, parentCategoryId: draft.parentCategoryId || null }), 'Category');
  }

  saveAttribute(): void {
    this.submitted.set(true);
    const draft = this.attributeDraft();
    if (!draft.label.trim() || !draft.key.trim()) return;
    if ((draft.inputType === 'select' || draft.inputType === 'multi-select')
      && !draft.options.some(option => option.status === 'active')) {
      this.errorMessage.set('Select and multi-select attributes need at least one active option.');
      return;
    }
    this.execute(() => draft.id
      ? this.attributeService.updateAttribute(draft.id, draft)
      : this.attributeService.createAttribute(draft), 'Attribute');
  }

  saveBrand(): void {
    this.submitted.set(true);
    const draft = this.brandDraft();
    if (!draft.name.trim() || this.logoError()) return;
    this.execute(() => draft.id
      ? this.brandService.updateBrand(draft.id, draft)
      : this.brandService.createBrand(draft), 'Brand');
  }

  toggleCategoryStatus(category: CatalogCategory): void {
    const status = category.status === 'active' ? 'inactive' : 'active';
    this.categoryService.setCategoryStatus(category.id, status);
    this.storeService.showToast(`${category.name} is now ${status}.`, status === 'active' ? 'success' : 'warning');
  }

  toggleAttributeStatus(attribute: CatalogAttribute): void {
    const status = attribute.status === 'active' ? 'inactive' : 'active';
    if (status === 'inactive' && this.assignmentCount(attribute.id) > 0
      && !confirm(`This attribute is assigned to ${this.assignmentCount(attribute.id)} categories. Deactivate it? Existing product values will be retained.`)) return;
    this.attributeService.setAttributeStatus(attribute.id, status);
    this.storeService.showToast(`${attribute.label} is now ${status}.`, status === 'active' ? 'success' : 'warning');
  }

  toggleBrandStatus(brand: CatalogBrand): void {
    const status = brand.status === 'active' ? 'inactive' : 'active';
    this.brandService.setBrandStatus(brand.id, status);
    this.storeService.showToast(`${brand.name} is now ${status}.`, status === 'active' ? 'success' : 'warning');
  }

  addOption(): void {
    const label = this.optionLabel().trim();
    if (!label) return;
    const draft = this.attributeDraft();
    if (draft.options.some(option => option.value.toLowerCase() === label.toLowerCase())) {
      this.errorMessage.set('This option already exists.');
      return;
    }
    const option: CatalogAttributeOption = {
      id: `option-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      label, value: label, status: 'active', sortOrder: draft.options.length + 1
    };
    this.attributeDraft.set({ ...draft, options: [...draft.options, option] });
    this.optionLabel.set('');
    this.errorMessage.set('');
  }

  updateOption(optionId: string, label: string): void {
    this.attributeDraft.update(draft => ({
      ...draft,
      options: draft.options.map(option => option.id === optionId ? { ...option, label, value: label } : option)
    }));
  }

  toggleOption(optionId: string): void {
    this.attributeDraft.update(draft => ({
      ...draft,
      options: draft.options.map(option => option.id === optionId
        ? { ...option, status: option.status === 'active' ? 'inactive' : 'active' }
        : option)
    }));
  }

  moveOption(index: number, direction: -1 | 1): void {
    const destination = index + direction;
    const options = [...this.attributeDraft().options];
    if (destination < 0 || destination >= options.length) return;
    [options[index], options[destination]] = [options[destination], options[index]];
    this.attributeDraft.update(draft => ({ ...draft, options }));
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      this.logoError.set('Use a PNG, JPG, or WEBP image up to 2MB.');
      input.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      this.brandDraft.update(draft => ({ ...draft, logoUrl: String(reader.result ?? '') }));
      this.logoError.set('');
    };
    reader.readAsDataURL(file);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  updateCategoryDraft(field: keyof CategoryDraft, value: string): void {
    this.categoryDraft.update(draft => ({ ...draft, [field]: value }));
  }

  updateAttributeDraft(field: keyof AttributeDraft, value: string): void {
    this.attributeDraft.update(draft => ({ ...draft, [field]: value }));
  }

  updateBrandDraft(field: keyof BrandDraft, value: string): void {
    this.brandDraft.update(draft => ({ ...draft, [field]: value }));
  }

  viewCategory(category: CatalogCategory): void {
    void this.router.navigate(['/store-admin/catalog/categories', category.id]);
  }

  parentName(category: CatalogCategory): string {
    return category.parentCategoryId
      ? this.categories().find(item => item.id === category.parentCategoryId)?.name ?? 'Unknown'
      : 'Top level';
  }

  attributeCount(categoryId: string): number {
    return this.assignments().filter(assignment => assignment.categoryId === categoryId).length;
  }

  subcategoryCount(categoryId: string): number {
    return this.categories().filter(category => category.parentCategoryId === categoryId).length;
  }

  assignmentCount(attributeId: string): number {
    return this.assignments().filter(assignment => assignment.attributeId === attributeId).length;
  }

  productCount(categoryId: string): number {
    return this.productService.products().filter(product => (product.categoryId ?? product.category) === categoryId).length;
  }

  supportsOptions(): boolean {
    return this.attributeDraft().inputType === 'select' || this.attributeDraft().inputType === 'multi-select';
  }

  private openEditor(): void {
    this.submitted.set(false);
    this.errorMessage.set('');
    this.logoError.set('');
    this.editorOpen.set(true);
  }

  private execute(action: () => unknown, entityName: string): void {
    try {
      action();
      this.storeService.showToast(`${entityName} ${this.editorMode() === 'create' ? 'created' : 'updated'} successfully.`, 'success');
      this.closeEditor();
    } catch (error) {
      this.errorMessage.set(error instanceof Error ? error.message : `${entityName} could not be saved.`);
    }
  }

  private emptyCategoryDraft(): CategoryDraft {
    return { id: '', name: '', parentCategoryId: '', description: '', status: 'active' };
  }

  private emptyAttributeDraft(): AttributeDraft {
    return { id: '', key: '', label: '', inputType: 'text', description: '', placeholder: '', status: 'active', options: [] };
  }

  private emptyBrandDraft(): BrandDraft {
    return { id: '', name: '', logoUrl: '', description: '', status: 'active' };
  }
}
