import { Injectable, signal } from '@angular/core';

import {
  Supplier,
  CreateSupplierRequest,
  UpdateSupplierRequest,
  SupplierStatus
} from '../components/store-admin/purchasing/suppliers/models/supplier.model';

@Injectable({
  providedIn: 'root'
})
export class SupplierService {

  private readonly suppliersState = signal<Supplier[]>([{
    id: 1,
    storeId: 'store-2158',
    supplierCode: 'SUP-001',
    name: 'Tech Distribution Ltd.',
    contactPerson: 'Ali Khan',
    email: 'ali@techdistribution.com',
    phone: '03001234567',
    country: 'Pakistan',
    state: 'Sindh',
    city: 'Karachi',
    address: 'Shahrah-e-Faisal',
    paymentTerms: '30 Days',
    status: 'active',
    createdAt: new Date().toISOString()
  },
  {
    id: 2,
    storeId: 'store-2158',
    supplierCode: 'SUP-002',
    name: 'Global Traders',
    contactPerson: 'Ahmed Raza',
    email: 'ahmed@globaltraders.com',
    phone: '03111234567',
    country: 'Pakistan',
    state: 'Sindh',
    city: 'Karachi',
    address: 'Clifton',
    paymentTerms: '15 Days',
    status: 'inactive',
    createdAt: new Date().toISOString()
  }]);

  readonly suppliers = this.suppliersState.asReadonly();

  getSuppliersByStore(storeId: string): Supplier[] {
    return this.suppliersState().filter(
      supplier => supplier.storeId === storeId
    );
  }

  getSupplierById(id: number): Supplier | undefined {
    return this.suppliersState().find(
      supplier => supplier.id === id
    );
  }

  createSupplier(request: CreateSupplierRequest): Supplier {

    const newSupplier: Supplier = {
      id: Date.now(),

      ...request,

      createdAt: new Date().toISOString()
    };

    this.suppliersState.update(currentSuppliers => [
      ...currentSuppliers,
      newSupplier
    ]);

    return newSupplier;
  }

  updateSupplier(
    id: number,
    request: UpdateSupplierRequest
  ): Supplier | undefined {

    const existingSupplier = this.getSupplierById(id);

    if (!existingSupplier) {
      return undefined;
    }

    const updatedSupplier: Supplier = {
      ...existingSupplier,
      ...request,
      updatedAt: new Date().toISOString()
    };

    this.suppliersState.update(currentSuppliers =>
      currentSuppliers.map(supplier =>
        supplier.id === id
          ? updatedSupplier
          : supplier
      )
    );

    return updatedSupplier;
  }

  changeSupplierStatus(
    id: number,
    status: SupplierStatus
  ): void {

    this.suppliersState.update(currentSuppliers =>
      currentSuppliers.map(supplier =>
        supplier.id === id
          ? {
              ...supplier,
              status,
              updatedAt: new Date().toISOString()
            }
          : supplier
      )
    );
  }

}

