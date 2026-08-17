import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { CatalogBrand, CatalogBrandUpsert } from '../models/product-catalog.models';
import { CatalogRepositoryService } from './catalog-repository.service';

@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly repository = inject(CatalogRepositoryService);

  readonly brands = this.repository.brands;

  getBrands(includeInactive = false): Observable<CatalogBrand[]> {
    return of(this.repository.brands()
      .filter(brand => includeInactive || brand.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name))
      .map(brand => ({ ...brand })));
  }

  getBrandById(id: string): CatalogBrand | undefined {
    const brand = this.repository.brands().find(item => item.id === id);
    return brand ? { ...brand } : undefined;
  }

  createBrand(input: CatalogBrandUpsert): CatalogBrand {
    return this.repository.createBrand(input);
  }

  updateBrand(id: string, input: CatalogBrandUpsert): CatalogBrand {
    return this.repository.updateBrand(id, input);
  }

  setBrandStatus(id: string, status: CatalogBrand['status']): CatalogBrand {
    const brand = this.getBrandById(id);
    if (!brand) throw new Error('The selected brand could not be found.');
    return this.repository.updateBrand(id, { ...brand, status });
  }
}
