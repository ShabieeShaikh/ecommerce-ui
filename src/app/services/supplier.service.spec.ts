import { TestBed } from '@angular/core/testing';
import {
  CreateSupplierRequest,
  UpdateSupplierRequest,
} from '../components/store-admin/purchasing/suppliers/models/supplier.model';
import { SupplierService } from './supplier.service';

const STORAGE_KEY = 'digishop_suppliers';

describe('SupplierService persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('persists created suppliers and reloads them from storage', () => {
    const service = TestBed.inject(SupplierService);
    const created = service.createSupplier(createRequest());

    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([created]);

    const reloadedService = recreateService();
    expect(reloadedService.getSupplierById(created.id)).toEqual(created);
  });

  it('keeps suppliers filtered by their string store ID after reload', () => {
    const service = TestBed.inject(SupplierService);
    service.createSupplier(createRequest('store-a', 'SUP-A'));
    service.createSupplier(createRequest('store-b', 'SUP-B'));

    const reloadedService = recreateService();
    expect(
      reloadedService.getSuppliersByStore('store-a').map((supplier) => supplier.supplierCode),
    ).toEqual(['SUP-A']);
    expect(
      reloadedService.getSuppliersByStore('store-b').map((supplier) => supplier.supplierCode),
    ).toEqual(['SUP-B']);
  });

  it('detects normalized duplicate codes only within the same store', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(101).mockReturnValueOnce(102);
    const service = TestBed.inject(SupplierService);
    const firstSupplier = service.createSupplier(createRequest('store-a', 'SUP-001'));
    const secondSupplier = service.createSupplier(createRequest('store-a', 'SUP-002'));

    expect(service.isSupplierCodeExists('store-a', 'SUP-001')).toBe(true);
    expect(service.isSupplierCodeExists('store-a', 'sup-001')).toBe(true);
    expect(service.isSupplierCodeExists('store-a', '  Sup-001  ')).toBe(true);
    expect(service.isSupplierCodeExists('store-b', 'SUP-001')).toBe(false);
    expect(service.isSupplierCodeExists('store-a', 'SUP-001', firstSupplier.id)).toBe(false);
    expect(service.isSupplierCodeExists('store-a', 'SUP-001', secondSupplier.id)).toBe(true);
  });

  it('persists successful updates without writing for a missing supplier', () => {
    const service = TestBed.inject(SupplierService);
    const created = service.createSupplier(createRequest());
    const update = updateRequest('Updated Supplier');
    const updated = service.updateSupplier(created.id, update);

    expect(updated?.name).toBe('Updated Supplier');
    expect(recreateService().getSupplierById(created.id)?.name).toBe('Updated Supplier');

    const storedBeforeMissingUpdate = localStorage.getItem(STORAGE_KEY);
    expect(recreateService().updateSupplier(-1, update)).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedBeforeMissingUpdate);
  });

  it('persists supplier status changes', () => {
    const service = TestBed.inject(SupplierService);
    const created = service.createSupplier(createRequest());

    service.changeSupplierStatus(created.id, 'inactive');

    const reloadedService = recreateService();
    expect(reloadedService.getSupplierById(created.id)?.status).toBe('inactive');

    reloadedService.changeSupplierStatus(created.id, 'active');

    expect(recreateService().getSupplierById(created.id)?.status).toBe('active');
  });

  it('persists deletion and avoids writing for a missing supplier', () => {
    const service = TestBed.inject(SupplierService);
    const created = service.createSupplier(createRequest());

    expect(service.deleteSupplier(created.id)).toBe(true);
    expect(service.getSupplierById(created.id)).toBeUndefined();
    expect(recreateService().getSupplierById(created.id)).toBeUndefined();

    const storedBeforeMissingDelete = localStorage.getItem(STORAGE_KEY);
    expect(recreateService().deleteSupplier(-1)).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY)).toBe(storedBeforeMissingDelete);
  });

  it('falls back to an empty array when stored JSON is corrupted', () => {
    TestBed.resetTestingModule();
    localStorage.setItem(STORAGE_KEY, '{invalid json');
    TestBed.configureTestingModule({});

    expect(TestBed.inject(SupplierService).suppliers()).toEqual([]);
  });
});

function recreateService(): SupplierService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({});
  return TestBed.inject(SupplierService);
}

function createRequest(storeId = 'store-a', supplierCode = 'SUP-004'): CreateSupplierRequest {
  return {
    storeId,
    supplierCode,
    name: 'Test Supplier',
    phone: '03001234567',
    status: 'active',
  };
}

function updateRequest(name: string): UpdateSupplierRequest {
  return {
    supplierCode: 'SUP-004',
    name,
    phone: '03001234567',
    status: 'active',
  };
}
