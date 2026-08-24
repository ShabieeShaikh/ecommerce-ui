import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';

import { StoreService } from '../../../../../services/store.service';
import { Supplier } from '../models/supplier.model';
import { ViewSupplier } from './view-supplier';

const STORAGE_KEY = 'digishop_suppliers';

describe('ViewSupplier', () => {
  afterEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('loads and displays a persisted supplier for the selected store', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { fixture } = createComponent('101');
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('Supplier Details');
    expect(content).toContain('Test Supplier');
    expect(content).toContain('SUP-004');
    expect(content).toContain('03001234567');
    expect(content).toContain('Pakistan');
  });

  it('shows the unavailable state when the selected store changes', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { fixture, storeService } = createComponent('101');
    expect(fixture.nativeElement.textContent as string).toContain('Test Supplier');

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent as string).toContain('Supplier not found');
    expect(fixture.nativeElement.textContent as string).not.toContain('Test Supplier');
  });

  it('uses placeholders for missing optional data and notes', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        supplierFixture({
          contactPerson: undefined,
          email: undefined,
          alternatePhone: undefined,
          taxNumber: undefined,
          notes: undefined
        })
      ])
    );

    const { fixture } = createComponent('101');
    const content = fixture.nativeElement.textContent as string;

    expect(content).toContain('—');
    expect(content).toContain('No notes added.');
    expect(content).not.toContain('undefined');
    expect(content).not.toContain('null');
  });

  it('shows the not-found state for an invalid route ID', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { fixture } = createComponent('abc');

    expect(fixture.nativeElement.textContent as string).toContain('Supplier not found');
  });

  it('shows the not-found state for a missing supplier', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { fixture } = createComponent('999999999');

    expect(fixture.nativeElement.textContent as string).toContain('Supplier not found');
  });

  it('navigates back to the Supplier List', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([supplierFixture()]));

    const { component, router } = createComponent('101');
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component.backToSuppliers();

    expect(navigate).toHaveBeenCalledWith(['/store-admin/purchasing/suppliers']);
  });
});

function createComponent(routeId: string): {
  component: ViewSupplier;
  fixture: ComponentFixture<ViewSupplier>;
  router: Router;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [ViewSupplier],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: {
          snapshot: {
            paramMap: convertToParamMap({ id: routeId })
          }
        }
      }
    ]
  });

  const fixture = TestBed.createComponent(ViewSupplier);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    router: TestBed.inject(Router),
    storeService: TestBed.inject(StoreService)
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
    ...overrides
  };
}
