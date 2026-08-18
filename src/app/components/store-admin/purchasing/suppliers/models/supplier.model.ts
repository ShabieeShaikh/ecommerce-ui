export type SupplierStatus = 'active' | 'inactive';

export interface Supplier {
  id: number;
  storeId: string;

  supplierCode: string;
  name: string;

  contactPerson?: string;

  email?: string;
  phone: string;
  alternatePhone?: string;

  country?: string;
  state?: string;
  city?: string;
  address?: string;
  postalCode?: string;

  taxNumber?: string;
  paymentTerms?: string;

  notes?: string;

  status: SupplierStatus;

  createdAt: string;
  updatedAt?: string;
}


export interface CreateSupplierRequest {
  storeId: string;

  supplierCode: string;
  name: string;

  contactPerson?: string;

  email?: string;
  phone: string;
  alternatePhone?: string;

  country?: string;
  state?: string;
  city?: string;
  address?: string;
  postalCode?: string;

  taxNumber?: string;
  paymentTerms?: string;

  notes?: string;

  status: SupplierStatus;
}


export interface UpdateSupplierRequest {
  supplierCode: string;
  name: string;

  contactPerson?: string;

  email?: string;
  phone: string;
  alternatePhone?: string;

  country?: string;
  state?: string;
  city?: string;
  address?: string;
  postalCode?: string;

  taxNumber?: string;
  paymentTerms?: string;

  notes?: string;

  status: SupplierStatus;
}
