import { Component, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CatalogCategory,
  CatalogEntityStatus,
  CategoryAttributeAssignment,
  CategoryAttributeAssignmentInput
} from '../../../models/product-catalog.models';
import { AttributeService } from '../../../services/attribute.service';
import { CategoryService } from '../../../services/category.service';
import { ProductService } from '../../../services/product.service';
import { StoreService } from '../../../services/store.service';

interface CategoryEditDraft {
  name: string;
  parentCategoryId: string;
  description: string;
  status: CatalogEntityStatus;
}

@Component({
  selector: 'app-category-details',
  imports: [FormsModule, RouterLink],
  templateUrl: './category-details.html',
  styleUrl: './category-details.css'
})
export class CategoryDetails {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly categoryService = inject(CategoryService);
  private readonly attributeService = inject(AttributeService);
  private readonly productService = inject(ProductService);
  private readonly storeService = inject(StoreService);

  readonly categoryId = signal(this.route.snapshot.paramMap.get('id') ?? '');
  readonly categories = this.categoryService.categories;
  readonly attributes = this.attributeService.attributes;
  readonly allAssignments = this.categoryService.assignments;
  readonly category = computed(() => this.categories().find(item => item.id === this.categoryId()));
  readonly parent = computed(() => this.categories().find(item => item.id === this.category()?.parentCategoryId));
  readonly subcategories = computed(() => this.categories().filter(item => item.parentCategoryId === this.categoryId()));
  readonly assignments = computed(() => this.allAssignments()
    .filter(item => item.categoryId === this.categoryId())
    .sort((left, right) => left.sortOrder - right.sortOrder));
  readonly availableAttributes = computed(() => {
    const assignedIds = new Set(this.assignments().map(item => item.attributeId));
    return this.attributes().filter(attribute => !assignedIds.has(attribute.id) && attribute.status === 'active');
  });
  readonly productsUsingCategory = computed(() => this.productService.products()
    .filter(product => (product.categoryId ?? product.category) === this.categoryId()));

  readonly selectedAttributeId = signal('');
  readonly editOpen = signal(false);
  readonly editError = signal('');
  readonly editDraft = signal<CategoryEditDraft>({ name: '', parentCategoryId: '', description: '', status: 'active' });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.categoryId.set(params.get('id') ?? '');
      this.selectedAttributeId.set('');
    });
    effect(() => {
      if (!this.categoryId() || this.category()) return;
      this.storeService.showToast('The selected category could not be found.', 'warning');
      void this.router.navigate(['/store-admin/catalog/categories']);
    });
  }

  attributeName(assignment: CategoryAttributeAssignment): string {
    return this.attributes().find(item => item.id === assignment.attributeId)?.label ?? 'Unknown attribute';
  }

  attributeType(assignment: CategoryAttributeAssignment): string {
    return this.attributes().find(item => item.id === assignment.attributeId)?.inputType ?? '-';
  }

  attributeOptions(assignment: CategoryAttributeAssignment): number {
    return this.attributes().find(item => item.id === assignment.attributeId)?.options.filter(option => option.status === 'active').length ?? 0;
  }

  addAssignment(): void {
    const attributeId = this.selectedAttributeId();
    if (!attributeId) return;
    const next: CategoryAttributeAssignmentInput[] = [
      ...this.assignments().map(assignment => this.toInput(assignment)),
      { attributeId, required: false, isVariantAttribute: false, unit: '', sortOrder: this.assignments().length + 1 }
    ];
    this.categoryService.assignAttributes(this.categoryId(), next);
    this.selectedAttributeId.set('');
    this.storeService.showToast('Attribute assigned to category.', 'success');
  }

  updateAssignment(assignment: CategoryAttributeAssignment, field: 'required' | 'isVariantAttribute', value: boolean): void {
    this.replaceAssignment(assignment.id, { [field]: value });
  }

  updateUnit(assignment: CategoryAttributeAssignment, unit: string): void {
    this.replaceAssignment(assignment.id, { unit });
  }

  moveAssignment(index: number, direction: -1 | 1): void {
    const destination = index + direction;
    const assignments = this.assignments().map(item => this.toInput(item));
    if (destination < 0 || destination >= assignments.length) return;
    [assignments[index], assignments[destination]] = [assignments[destination], assignments[index]];
    this.categoryService.assignAttributes(this.categoryId(), assignments);
  }

  removeAssignment(assignment: CategoryAttributeAssignment): void {
    const products = this.productsUsingCategory().length;
    const warning = products
      ? `This category is used by ${products} products. Removing ${this.attributeName(assignment)} will hide the field for future edits, but stored product values will be retained. Continue?`
      : `Remove ${this.attributeName(assignment)} from this category?`;
    if (!confirm(warning)) return;
    this.categoryService.assignAttributes(
      this.categoryId(),
      this.assignments().filter(item => item.id !== assignment.id).map(item => this.toInput(item))
    );
    this.storeService.showToast('Attribute assignment removed. Existing product data was retained.', 'warning');
  }

  openEdit(): void {
    const category = this.category();
    if (!category) return;
    this.editDraft.set({
      name: category.name,
      parentCategoryId: category.parentCategoryId ?? '',
      description: category.description,
      status: category.status
    });
    this.editError.set('');
    this.editOpen.set(true);
  }

  saveCategory(): void {
    const draft = this.editDraft();
    if (!draft.name.trim()) {
      this.editError.set('Category name is required.');
      return;
    }
    try {
      this.categoryService.updateCategory(this.categoryId(), { ...draft, parentCategoryId: draft.parentCategoryId || null });
      this.editOpen.set(false);
      this.storeService.showToast('Category updated successfully.', 'success');
    } catch (error) {
      this.editError.set(error instanceof Error ? error.message : 'Category could not be updated.');
    }
  }

  updateEditDraft(field: keyof CategoryEditDraft, value: string): void {
    this.editDraft.update(draft => ({ ...draft, [field]: value } as CategoryEditDraft));
  }

  private replaceAssignment(id: string, changes: Partial<CategoryAttributeAssignmentInput>): void {
    const assignments = this.assignments().map(assignment => assignment.id === id
      ? { ...this.toInput(assignment), ...changes }
      : this.toInput(assignment));
    this.categoryService.assignAttributes(this.categoryId(), assignments);
  }

  private toInput(assignment: CategoryAttributeAssignment): CategoryAttributeAssignmentInput {
    return {
      id: assignment.id,
      attributeId: assignment.attributeId,
      required: assignment.required,
      isVariantAttribute: assignment.isVariantAttribute,
      unit: assignment.unit,
      sortOrder: assignment.sortOrder
    };
  }
}
