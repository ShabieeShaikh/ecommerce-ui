import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import {
  CatalogCategory,
  CatalogCategoryUpsert,
  CategoryAttributeAssignment,
  CategoryAttributeAssignmentInput,
  CategoryAttributeDefinition,
  ProductCategoryOption
} from '../models/product-catalog.models';
import { CatalogRepositoryService } from './catalog-repository.service';

@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly repository = inject(CatalogRepositoryService);

  readonly categories = this.repository.categories;
  readonly assignments = this.repository.assignments;

  getCategories(includeInactive = false): Observable<ProductCategoryOption[]> {
    const categories = this.repository.categories()
      .filter(category => includeInactive || category.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(category => ({ id: category.id, name: category.name }));
    return of(categories);
  }

  getCatalogCategories(): Observable<CatalogCategory[]> {
    return of(this.repository.categories().map(category => ({ ...category })));
  }

  getCategoryById(id: string): CatalogCategory | undefined {
    const category = this.repository.categories().find(item => item.id === id);
    return category ? { ...category } : undefined;
  }

  getSubcategories(parentCategoryId: string): Observable<CatalogCategory[]> {
    return of(this.repository.categories()
      .filter(category => category.parentCategoryId === parentCategoryId)
      .map(category => ({ ...category })));
  }

  createCategory(input: CatalogCategoryUpsert): CatalogCategory {
    return this.repository.createCategory(input);
  }

  updateCategory(id: string, input: CatalogCategoryUpsert): CatalogCategory {
    return this.repository.updateCategory(id, input);
  }

  setCategoryStatus(id: string, status: CatalogCategory['status']): CatalogCategory {
    const category = this.requireCategory(id);
    return this.repository.updateCategory(id, { ...category, status });
  }

  getAssignments(categoryId: string): CategoryAttributeAssignment[] {
    return this.repository.assignments()
      .filter(assignment => assignment.categoryId === categoryId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .map(assignment => ({ ...assignment }));
  }

  assignAttributes(categoryId: string, assignments: CategoryAttributeAssignmentInput[]): CategoryAttributeAssignment[] {
    return this.repository.replaceAssignments(categoryId, assignments);
  }

  getCategoryAttributes(categoryId: string): Observable<CategoryAttributeDefinition[]> {
    const attributes = new Map(this.repository.attributes().map(attribute => [attribute.id, attribute]));
    const definitions = this.repository.assignments()
      .filter(assignment => assignment.categoryId === categoryId)
      .sort((left, right) => left.sortOrder - right.sortOrder)
      .flatMap(assignment => {
        const attribute = attributes.get(assignment.attributeId);
        if (!attribute || attribute.status !== 'active') return [];
        return [{
          id: assignment.id,
          categoryId,
          key: attribute.key,
          label: attribute.label,
          inputType: attribute.inputType,
          required: assignment.required,
          isVariantAttribute: assignment.isVariantAttribute,
          options: attribute.options
            .filter(option => option.status === 'active')
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map(option => option.value),
          unit: assignment.unit || undefined,
          placeholder: attribute.placeholder,
          sortOrder: assignment.sortOrder
        } satisfies CategoryAttributeDefinition];
      });
    return of(definitions);
  }

  private requireCategory(id: string): CatalogCategory {
    const category = this.getCategoryById(id);
    if (!category) throw new Error('The selected category could not be found.');
    return category;
  }
}
