export type AttributeInputType = 'text' | 'number' | 'select' | 'multi-select' | 'boolean' | 'textarea';

export type CatalogEntityStatus = 'active' | 'inactive';

export type ProductAttributeData = string | number | boolean | string[];

export interface ProductCategoryOption {
  id: string;
  name: string;
}

export interface CatalogCategory {
  id: string;
  name: string;
  parentCategoryId: string | null;
  description: string;
  status: CatalogEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export type CatalogCategoryUpsert = Pick<CatalogCategory, 'name' | 'parentCategoryId' | 'description' | 'status'>;

export interface CatalogAttributeOption {
  id: string;
  label: string;
  value: string;
  status: CatalogEntityStatus;
  sortOrder: number;
}

export interface CatalogAttribute {
  id: string;
  key: string;
  label: string;
  inputType: AttributeInputType;
  description: string;
  placeholder: string;
  status: CatalogEntityStatus;
  options: CatalogAttributeOption[];
  createdAt: string;
  updatedAt: string;
}

export type CatalogAttributeUpsert = Pick<CatalogAttribute,
  'key' | 'label' | 'inputType' | 'description' | 'placeholder' | 'status' | 'options'>;

export interface CategoryAttributeAssignment {
  id: string;
  categoryId: string;
  attributeId: string;
  required: boolean;
  isVariantAttribute: boolean;
  unit: string;
  sortOrder: number;
}

export type CategoryAttributeAssignmentInput = Omit<CategoryAttributeAssignment, 'id' | 'categoryId'>
  & Partial<Pick<CategoryAttributeAssignment, 'id'>>;

export interface CatalogBrand {
  id: string;
  name: string;
  logoUrl: string;
  description: string;
  status: CatalogEntityStatus;
  createdAt: string;
  updatedAt: string;
}

export type CatalogBrandUpsert = Pick<CatalogBrand, 'name' | 'logoUrl' | 'description' | 'status'>;

export interface CategoryAttributeDefinition {
  id: string;
  categoryId: string;
  key: string;
  label: string;
  inputType: AttributeInputType;
  required: boolean;
  isVariantAttribute: boolean;
  options?: string[];
  unit?: string;
  placeholder?: string;
  sortOrder: number;
}

export interface ProductAttributeValue {
  attributeDefinitionId: string;
  key: string;
  value: ProductAttributeData;
}

export interface ProductVariantAttribute {
  attributeDefinitionId: string;
  attributeKey: string;
  value: string;
}

export type ProductVariantStatus = 'active' | 'inactive';

export interface ProductVariant {
  id?: string | number;
  productId?: string | number;
  sku: string;
  barcode?: string;
  priceOverride?: number;
  imageUrl?: string;
  status: ProductVariantStatus;
  attributes: ProductVariantAttribute[];
}
