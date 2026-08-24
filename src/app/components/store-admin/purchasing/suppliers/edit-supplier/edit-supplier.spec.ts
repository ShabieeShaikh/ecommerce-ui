import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { LocationService } from '../../../../../services/location.service';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier } from '../models/supplier.model';
import { EditSupplier } from './edit-supplier';

const STORAGE_KEY = 'digishop_suppliers';

describe('EditSupplier', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('prefills all existing supplier values', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { component, fixture } = createComponent('101');
    const value = component.supplierForm.getRawValue();

    expect(value).toEqual({
      supplierCode: 'SUP-004',
      name: 'Test Supplier',
      contactPerson: 'Ali Khan',
      email: 'supplier@example.com',
      phone: '03001234567',
      alternatePhone: '03111234567',
      country: 'Pakistan',
      state: 'Sindh',
      city: 'Karachi',
      address: 'Shahrah-e-Faisal',
      postalCode: '75400',
      taxNumber: 'NTN-12345',
      paymentTerms: '30 Days',
      notes: 'Preferred supplier.',
      status: 'active',
    });
    expect(fixture.nativeElement.textContent as string).toContain('Edit Supplier');
  });

  it('prefills missing optional values with empty strings', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        supplierFixture({
          contactPerson: undefined,
          email: undefined,
          alternatePhone: undefined,
          country: undefined,
          state: undefined,
          city: undefined,
          address: undefined,
          postalCode: undefined,
          taxNumber: undefined,
          paymentTerms: undefined,
          notes: undefined,
        }),
      ]),
    );

    const { component } = createComponent('101');
    const value = component.supplierForm.getRawValue();

    expect(value.contactPerson).toBe('');
    expect(value.email).toBe('');
    expect(value.alternatePhone).toBe('');
    expect(value.country).toBe('');
    expect(value.notes).toBe('');
  });

  it('updates through SupplierService, preserves storeId, persists, and opens View Supplier', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { component, router, supplierService } = createComponent('101');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const updateSupplier = vi.spyOn(supplierService, 'updateSupplier');

    component.supplierForm.patchValue({
      name: 'Updated Supplier',
      contactPerson: '  Updated Contact  ',
      email: '',
      status: 'inactive',
    });
    component.submitSupplier();

    expect(updateSupplier).toHaveBeenCalledWith(
      101,
      expect.objectContaining({
        name: 'Updated Supplier',
        contactPerson: 'Updated Contact',
        email: undefined,
        status: 'inactive',
      }),
    );
    expect(supplierService.getSupplierById(101)).toEqual(
      expect.objectContaining({
        storeId: 'store-001',
        name: 'Updated Supplier',
        status: 'inactive',
      }),
    );
    expect(localStorage.getItem(STORAGE_KEY)).toContain('Updated Supplier');
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/suppliers', 101]);
  });

  it('marks invalid controls and does not update the supplier', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { component, supplierService } = createComponent('101');
    const updateSupplier = vi.spyOn(supplierService, 'updateSupplier');

    component.supplierForm.patchValue({
      supplierCode: '',
      name: 'A',
      phone: '',
      email: 'invalid-email',
    });
    component.submitSupplier();

    expect(component.supplierForm.controls.supplierCode.touched).toBe(true);
    expect(component.supplierForm.controls.name.hasError('minlength')).toBe(true);
    expect(component.supplierForm.controls.email.hasError('email')).toBe(true);
    expect(updateSupplier).not.toHaveBeenCalled();
  });

  it('allows the supplier to keep its own existing code', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { component, router, supplierService } = createComponent('101');
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    const updateSupplier = vi.spyOn(supplierService, 'updateSupplier');

    component.supplierForm.patchValue({
      supplierCode: '  sup-004  ',
      name: 'Updated Without Changing Code',
    });
    component.submitSupplier();

    expect(updateSupplier).toHaveBeenCalledOnce();
    expect(component.supplierForm.controls.supplierCode.hasError('supplierCodeExists')).toBe(false);
  });

  it('rejects another same-store supplier code while editing', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        supplierFixture({
          id: 101,
          supplierCode: 'SUP-001',
        }),
        supplierFixture({
          id: 102,
          supplierCode: 'SUP-002',
          name: 'Second Supplier',
        }),
      ]),
    );

    const { component, fixture, router, supplierService } = createComponent('102');
    const updateSupplier = vi.spyOn(supplierService, 'updateSupplier');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.supplierForm.controls.supplierCode.setValue('  sup-001  ');
    component.submitSupplier();
    fixture.detectChanges();

    expect(updateSupplier).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
    expect(component.supplierForm.controls.supplierCode.hasError('supplierCodeExists')).toBe(true);
    expect(fixture.nativeElement.textContent as string).toContain(
      'A supplier with this code already exists for the selected store.',
    );
    expect(supplierService.getSupplierById(102)?.supplierCode).toBe('SUP-002');
  });

  it('shows the unavailable state after switching to another store', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { fixture, storeService } = createComponent('101');
    expect(fixture.nativeElement.textContent as string).toContain('Update Supplier');

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    const content = fixture.nativeElement.textContent as string;
    expect(content).toContain('Supplier not found');
    expect(content).not.toContain('Update Supplier');
  });

  it('shows the not-found state for invalid and missing supplier IDs', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const invalid = createComponent('abc');
    expect(invalid.fixture.nativeElement.textContent as string).toContain('Supplier not found');

    TestBed.resetTestingModule();
    const missing = createComponent('999999999');
    expect(missing.fixture.nativeElement.textContent as string).toContain('Supplier not found');
  });

  it('cancels without saving and navigates to View Supplier', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { component, router, supplierService } = createComponent('101');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.supplierForm.patchValue({ name: 'Unsaved Supplier' });
    component.cancel();

    expect(supplierService.getSupplierById(101)?.name).toBe('Test Supplier');
    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/suppliers', 101]);
  });
});

function createComponent(routeId: string): {
  component: EditSupplier;
  fixture: ComponentFixture<EditSupplier>;
  router: Router;
  supplierService: SupplierService;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [EditSupplier],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: routeId }),
          },
        },
      },
      {
        provide: LocationService,
        useValue: {
          getCountries: () =>
            of([
              {
                name: 'Pakistan',
                iso3: 'PAK',
                states: [{ name: 'Sindh', code: 'SD' }],
              },
            ]),
          getCities: () => of(['Karachi']),
        },
      },
    ],
  });

  const fixture = TestBed.createComponent(EditSupplier);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    router: TestBed.inject(Router),
    supplierService: TestBed.inject(SupplierService),
    storeService: TestBed.inject(StoreService),
  };
}

function supplierFixture(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 101,
    storeId: 'store-001',
    supplierCode: 'SUP-004',
    name: 'Test Supplier',
    contactPerson: 'Ali Khan',
    email: 'supplier@example.com',
    phone: '03001234567',
    alternatePhone: '03111234567',
    country: 'Pakistan',
    state: 'Sindh',
    city: 'Karachi',
    address: 'Shahrah-e-Faisal',
    postalCode: '75400',
    taxNumber: 'NTN-12345',
    paymentTerms: '30 Days',
    notes: 'Preferred supplier.',
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}
