import { Injectable, inject, signal } from '@angular/core';

import {
  Supplier,
  CreateSupplierRequest,
  UpdateSupplierRequest,
  SupplierStatus,
} from '../components/store-admin/purchasing/suppliers/models/supplier.model';
import { LocalStorageService } from './local-storage.service';

@Injectable({
  providedIn: 'root',
})
export class SupplierService {
  private readonly storage = inject(LocalStorageService);
  private readonly storageKey = 'digishop_suppliers';
  private readonly suppliersState = signal<Supplier[]>(this.loadSuppliers());

  readonly suppliers = this.suppliersState.asReadonly();

  getSuppliersByStore(storeId: string): Supplier[] {
    return this.suppliersState().filter((supplier) => supplier.storeId === storeId);
  }

  getSupplierById(id: number): Supplier | undefined {
    return this.suppliersState().find((supplier) => supplier.id === id);
  }

  isSupplierCodeExists(storeId: string, supplierCode: string, excludeSupplierId?: number): boolean {
    const normalizedCode = this.normalizeSupplierCode(supplierCode);

    if (!normalizedCode) {
      return false;
    }

    return this.suppliersState().some(
      (supplier) =>
        supplier.storeId === storeId &&
        supplier.id !== excludeSupplierId &&
        this.normalizeSupplierCode(supplier.supplierCode) === normalizedCode,
    );
  }

  createSupplier(request: CreateSupplierRequest): Supplier {
    const newSupplier: Supplier = {
      id: Date.now(),

      ...request,

      createdAt: new Date().toISOString(),
    };

    this.suppliersState.update((currentSuppliers) => [...currentSuppliers, newSupplier]);
    this.saveSuppliers();

    return newSupplier;
  }

  updateSupplier(id: number, request: UpdateSupplierRequest): Supplier | undefined {
    const existingSupplier = this.getSupplierById(id);

    if (!existingSupplier) {
      return undefined;
    }

    const updatedSupplier: Supplier = {
      ...existingSupplier,
      ...request,
      updatedAt: new Date().toISOString(),
    };

    this.suppliersState.update((currentSuppliers) =>
      currentSuppliers.map((supplier) => (supplier.id === id ? updatedSupplier : supplier)),
    );
    this.saveSuppliers();

    return updatedSupplier;
  }

  changeSupplierStatus(id: number, status: SupplierStatus): void {
    this.suppliersState.update((currentSuppliers) =>
      currentSuppliers.map((supplier) =>
        supplier.id === id
          ? {
              ...supplier,
              status,
              updatedAt: new Date().toISOString(),
            }
          : supplier,
      ),
    );
    this.saveSuppliers();
  }

  deleteSupplier(id: number): boolean {
    const existingSupplier = this.getSupplierById(id);

    if (!existingSupplier) {
      return false;
    }

    this.suppliersState.update((currentSuppliers) =>
      currentSuppliers.filter((supplier) => supplier.id !== id),
    );
    this.saveSuppliers();

    return true;
  }

  private loadSuppliers(): Supplier[] {
    try {
      const storedSuppliers = this.storage.getItem<unknown>(this.storageKey);
      return this.isSupplierArray(storedSuppliers) ? storedSuppliers : [];
    } catch {
      return [];
    }
  }

  private saveSuppliers(): void {
    this.storage.setItem(this.storageKey, this.suppliersState());
  }

  private normalizeSupplierCode(supplierCode: string): string {
    return supplierCode.trim().toLowerCase();
  }

  private isSupplierArray(value: unknown): value is Supplier[] {
    return Array.isArray(value) && value.every((item) => this.isSupplier(item));
  }

  private isSupplier(value: unknown): value is Supplier {
    if (!this.isRecord(value)) return false;

    const optionalStringFields = [
      'contactPerson',
      'email',
      'alternatePhone',
      'country',
      'state',
      'city',
      'address',
      'postalCode',
      'taxNumber',
      'paymentTerms',
      'notes',
      'updatedAt',
    ] as const;

    return (
      typeof value['id'] === 'number' &&
      Number.isFinite(value['id']) &&
      typeof value['storeId'] === 'string' &&
      typeof value['supplierCode'] === 'string' &&
      typeof value['name'] === 'string' &&
      typeof value['phone'] === 'string' &&
      (value['status'] === 'active' || value['status'] === 'inactive') &&
      typeof value['createdAt'] === 'string' &&
      optionalStringFields.every(
        (field) => value[field] === undefined || typeof value[field] === 'string',
      )
    );
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
