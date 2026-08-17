import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CatalogAttribute, CatalogAttributeOption, CatalogAttributeUpsert } from '../models/product-catalog.models';
import { CatalogRepositoryService } from './catalog-repository.service';

@Injectable({ providedIn: 'root' })
export class AttributeService {
  private readonly repository = inject(CatalogRepositoryService);

  readonly attributes = this.repository.attributes;

  getAttributes(): Observable<CatalogAttribute[]> {
    return of(this.repository.attributes().map(attribute => this.clone(attribute)));
  }

  getAttributeById(id: string): CatalogAttribute | undefined {
    const attribute = this.repository.attributes().find(item => item.id === id);
    return attribute ? this.clone(attribute) : undefined;
  }

  getAttributeOptions(attributeId: string): Observable<CatalogAttributeOption[]> {
    return of((this.getAttributeById(attributeId)?.options ?? []).map(option => ({ ...option })));
  }

  createAttribute(input: CatalogAttributeUpsert): CatalogAttribute {
    return this.repository.createAttribute(input);
  }

  updateAttribute(id: string, input: CatalogAttributeUpsert): CatalogAttribute {
    return this.repository.updateAttribute(id, input);
  }

  setAttributeStatus(id: string, status: CatalogAttribute['status']): CatalogAttribute {
    const attribute = this.getAttributeById(id);
    if (!attribute) throw new Error('The selected attribute could not be found.');
    return this.repository.updateAttribute(id, { ...attribute, status });
  }

  private clone(attribute: CatalogAttribute): CatalogAttribute {
    return { ...attribute, options: attribute.options.map(option => ({ ...option })) };
  }
}
