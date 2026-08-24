import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import Swal from 'sweetalert2';

import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier } from '../models/supplier.model';
import { SupplierList } from './supplier-list';

const STORAGE_KEY = 'digishop_suppliers';

describe('SupplierList', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        supplierFixture(),
        supplierFixture({
          id: 102,
          supplierCode: 'SUP-002',
          name: 'Inactive Traders',
          contactPerson: 'Sara Ahmed',
          email: 'sara@example.com',
          phone: '03110000000',
          status: 'inactive',
        }),
        supplierFixture({
          id: 201,
          storeId: 'store-002',
          supplierCode: 'SUP-001',
          name: 'Other Store Supplier',
        }),
      ]),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps search, status filtering, summary counts, and store isolation working', () => {
    const { component, fixture, storeService } = createComponent();

    expect(component.totalSuppliers()).toBe(2);
    expect(component.activeSuppliers()).toBe(1);
    expect(component.inactiveSuppliers()).toBe(1);

    component.searchTerm.set('ali khan');
    expect(component.filteredSuppliers().map((supplier) => supplier.id)).toEqual([101]);

    component.searchTerm.set('03110000000');
    expect(component.filteredSuppliers().map((supplier) => supplier.id)).toEqual([102]);

    component.searchTerm.set('');
    component.statusFilter.set('inactive');
    expect(component.filteredSuppliers().map((supplier) => supplier.id)).toEqual([102]);

    storeService.changeSelectedStore('store-002', false);
    fixture.detectChanges();

    expect(component.totalSuppliers()).toBe(1);
    expect(component.suppliers()[0]?.name).toBe('Other Store Supplier');
  });

  it('does not change status when confirmation is cancelled', async () => {
    const { component, supplierService, storeService } = createComponent();
    const changeSupplierStatus = vi.spyOn(supplierService, 'changeSupplierStatus');
    const showToast = vi.spyOn(storeService, 'showToast');
    const fire = vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: false,
      isDenied: false,
      isDismissed: true,
    });
    const supplier = component.suppliers().find((item) => item.id === 101);

    expect(supplier).toBeDefined();
    await component.toggleSupplierStatus(supplier as Supplier);

    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Deactivate supplier?',
        confirmButtonText: 'Deactivate',
        cancelButtonText: 'Cancel',
      }),
    );
    expect(changeSupplierStatus).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(supplierService.getSupplierById(101)?.status).toBe('active');
  });

  it('confirms deactivation, updates counts, persists, and shows feedback', async () => {
    const { component, supplierService, storeService } = createComponent();
    const showToast = vi.spyOn(storeService, 'showToast');
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });
    const supplier = component.suppliers().find((item) => item.id === 101);

    expect(supplier).toBeDefined();
    await component.toggleSupplierStatus(supplier as Supplier);

    expect(component.activeSuppliers()).toBe(0);
    expect(component.inactiveSuppliers()).toBe(2);
    expect(supplierService.getSupplierById(101)?.status).toBe('inactive');
    expect(readStoredSuppliers().find((item) => item.id === 101)?.status).toBe('inactive');
    expect(showToast).toHaveBeenCalledWith('Supplier deactivated successfully.', 'warning');
  });

  it('confirms activation and uses the activation copy', async () => {
    const { component, supplierService, storeService } = createComponent();
    const showToast = vi.spyOn(storeService, 'showToast');
    const fire = vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });
    const supplier = component.suppliers().find((item) => item.id === 102);

    expect(supplier).toBeDefined();
    await component.toggleSupplierStatus(supplier as Supplier);

    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Activate supplier?',
        text: 'Are you sure you want to activate "Inactive Traders"?',
        confirmButtonText: 'Activate',
      }),
    );
    expect(supplierService.getSupplierById(102)?.status).toBe('active');
    expect(readStoredSuppliers().find((item) => item.id === 102)?.status).toBe('active');
    expect(showToast).toHaveBeenCalledWith('Supplier activated successfully.', 'success');
  });

  it('does not delete a supplier when confirmation is cancelled', async () => {
    const { component, supplierService, storeService } = createComponent();
    const deleteSupplier = vi.spyOn(supplierService, 'deleteSupplier');
    const showToast = vi.spyOn(storeService, 'showToast');
    const fire = vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: false,
      isDenied: false,
      isDismissed: true,
    });
    const supplier = component.suppliers().find((item) => item.id === 101);

    expect(supplier).toBeDefined();
    await component.deleteSupplier(supplier as Supplier);

    expect(fire).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Delete supplier?',
        confirmButtonText: 'Delete',
        cancelButtonText: 'Cancel',
      }),
    );
    expect(deleteSupplier).not.toHaveBeenCalled();
    expect(showToast).not.toHaveBeenCalled();
    expect(component.totalSuppliers()).toBe(2);
  });

  it('deletes a confirmed supplier, updates counts, and persists the removal', async () => {
    const { component, supplierService, storeService } = createComponent();
    const showToast = vi.spyOn(storeService, 'showToast');
    vi.spyOn(Swal, 'fire').mockResolvedValue({
      isConfirmed: true,
      isDenied: false,
      isDismissed: false,
    });
    const supplier = component.suppliers().find((item) => item.id === 101);

    expect(supplier).toBeDefined();
    await component.deleteSupplier(supplier as Supplier);

    expect(component.totalSuppliers()).toBe(1);
    expect(component.activeSuppliers()).toBe(0);
    expect(supplierService.getSupplierById(101)).toBeUndefined();
    expect(readStoredSuppliers().some((item) => item.id === 101)).toBe(false);
    expect(readStoredSuppliers().some((item) => item.id === 201)).toBe(true);
    expect(showToast).toHaveBeenCalledWith('Supplier deleted successfully.', 'danger');
  });
});

function createComponent(): {
  component: SupplierList;
  fixture: ComponentFixture<SupplierList>;
  supplierService: SupplierService;
  storeService: StoreService;
} {
  TestBed.configureTestingModule({
    imports: [SupplierList],
    providers: [provideRouter([])],
  });

  const fixture = TestBed.createComponent(SupplierList);
  fixture.detectChanges();

  return {
    component: fixture.componentInstance,
    fixture,
    supplierService: TestBed.inject(SupplierService),
    storeService: TestBed.inject(StoreService),
  };
}

function supplierFixture(overrides: Partial<Supplier> = {}): Supplier {
  return {
    id: 101,
    storeId: 'store-001',
    supplierCode: 'SUP-001',
    name: 'Tech Distribution Ltd.',
    contactPerson: 'Ali Khan',
    email: 'ali@example.com',
    phone: '03001234567',
    status: 'active',
    createdAt: '2026-08-20T06:30:00.000Z',
    ...overrides,
  };
}

function readStoredSuppliers(): Supplier[] {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as Supplier[];
}
