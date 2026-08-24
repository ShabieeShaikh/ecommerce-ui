import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LocationService } from '../../../../../services/location.service';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier } from '../models/supplier.model';
import { AddSupplier } from './add-supplier';

const STORAGE_KEY = 'digishop_suppliers';

describe('AddSupplier', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps the existing required field validation', () => {
    const { component, fixture, supplierService } = createComponent();
    const createSupplier = vi.spyOn(supplierService, 'createSupplier');

    component.submitSupplier();
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Supplier code is required.');
    expect(content).toContain('Supplier name is required.');
    expect(content).toContain('Phone number is required.');
    expect(createSupplier).not.toHaveBeenCalled();
  });

  it.each(['SUP-001', 'sup-001', '  Sup-001  '])(
    'rejects the normalized same-store duplicate code %s',
    (supplierCode) => {
      seedSuppliers([supplierFixture()]);
      const { component, fixture, router, supplierService } = createComponent();
      const createSupplier = vi.spyOn(supplierService, 'createSupplier');
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fillRequiredFields(component, supplierCode);
      component.submitSupplier();
      fixture.detectChanges();

      expect(createSupplier).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
      expect(component.supplierForm.controls.supplierCode.hasError('supplierCodeExists')).toBe(
        true,
      );
      expect(fixture.nativeElement.textContent as string).toContain(
        'A supplier with this code already exists for the selected store.',
      );
      expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify([supplierFixture()]));
    },
  );

  it('allows the same code in a different selected store and persists it', () => {
    seedSuppliers([supplierFixture()]);
    const { component, router, supplierService } = createComponent('store-002');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    fillRequiredFields(component, ' sup-001 ');
    component.submitSupplier();

    const storeTwoSuppliers = supplierService.getSuppliersByStore('store-002');
    expect(storeTwoSuppliers).toHaveLength(1);
    expect(storeTwoSuppliers[0]).toEqual(
      expect.objectContaining({
        storeId: 'store-002',
        supplierCode: 'sup-001',
      }),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toContain('store-002');
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/suppliers']);
  });

  it('clears the duplicate error when the supplier code changes', () => {
    seedSuppliers([supplierFixture()]);
    const { component } = createComponent();

    fillRequiredFields(component, 'SUP-001');
    component.submitSupplier();
    expect(component.supplierForm.controls.supplierCode.hasError('supplierCodeExists')).toBe(true);

    component.supplierForm.controls.supplierCode.setValue('SUP-NEW');

    expect(component.supplierForm.controls.supplierCode.hasError('supplierCodeExists')).toBe(false);
  });
});

function createComponent(selectedStoreId = 'store-001'): {
  component: AddSupplier;
  fixture: ComponentFixture<AddSupplier>;
  router: Router;
  supplierService: SupplierService;
} {
  TestBed.configureTestingModule({
    imports: [AddSupplier],
    providers: [
      provideRouter([]),
      {
        provide: LocationService,
        useValue: {
          getCountries: () => of([]),
          getCities: () => of([]),
        },
      },
    ],
  });

  const storeService = TestBed.inject(StoreService);
  storeService.changeSelectedStore(selectedStoreId, false);

  const fixture = TestBed.createComponent(AddSupplier);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    router: TestBed.inject(Router),
    supplierService: TestBed.inject(SupplierService),
  };
}

function fillRequiredFields(component: AddSupplier, supplierCode: string): void {
  component.supplierForm.patchValue({
    supplierCode,
    name: 'New Supplier',
    phone: '03001234567',
  });
}

function seedSuppliers(suppliers: Supplier[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(suppliers));
}

function supplierFixture(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 101,
    storeId: 'store-001',
    supplierCode: 'SUP-001',
    name: 'Existing Supplier',
    phone: '03001234567',
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}
