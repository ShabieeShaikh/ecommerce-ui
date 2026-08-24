import type { Product, Store } from '../../../../../models/admin.models';
import type {
  InventoryLocation,
  InventoryLocationType,
} from '../../../../../models/inventory.models';
import type { ProductVariant } from '../../../../../models/product-catalog.models';
import type { Supplier } from '../../suppliers/models/supplier.model';

export type PurchaseOrderStatus =
  'draft' | 'ordered' | 'partially_received' | 'received' | 'cancelled';

export type PurchaseOrderManualStatus = Extract<PurchaseOrderStatus, 'ordered' | 'cancelled'>;

export type PurchaseOrderStoreId = Store['id'];
export type PurchaseOrderSupplierId = Supplier['id'];
export type PurchaseOrderReceivingLocationId = InventoryLocation['key'];
export type PurchaseOrderProductId = Product['id'];
export type PurchaseOrderVariantId = NonNullable<ProductVariant['id']>;

export interface PurchaseOrderItem {
  id: string;
  productId: PurchaseOrderProductId;
  variantId: PurchaseOrderVariantId | null;
  productName: string;
  variantName?: string;
  sku: string;
  quantity: number;
  receivedQuantity: number;
  purchasePrice: number;
  lineTotal: number;
}

export interface PurchaseOrder {
  id: string;
  storeId: PurchaseOrderStoreId;
  poNumber: string;
  supplierId: PurchaseOrderSupplierId;
  supplierName: string;
  receivingLocationId: PurchaseOrderReceivingLocationId;
  receivingLocationName: string;
  receivingLocationType: InventoryLocationType;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: PurchaseOrderItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  notes?: string;
  status: PurchaseOrderStatus;
  createdAt: string;
  updatedAt?: string;
}

export interface CreatePurchaseOrderItemRequest {
  productId: PurchaseOrderProductId;
  variantId?: PurchaseOrderVariantId | null;
  productName: string;
  variantName?: string;
  sku: string;
  quantity: number;
  purchasePrice: number;
}

export interface UpdatePurchaseOrderItemRequest extends CreatePurchaseOrderItemRequest {
  id?: PurchaseOrderItem['id'];
}

export interface CreatePurchaseOrderRequest {
  storeId: PurchaseOrderStoreId;
  supplierId: PurchaseOrderSupplierId;
  supplierName: string;
  receivingLocationId: PurchaseOrderReceivingLocationId;
  receivingLocationName: string;
  receivingLocationType: InventoryLocationType;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: CreatePurchaseOrderItemRequest[];
  taxAmount: number;
  discountAmount: number;
  notes?: string;
}

export interface UpdatePurchaseOrderRequest {
  supplierId: PurchaseOrderSupplierId;
  supplierName: string;
  receivingLocationId: PurchaseOrderReceivingLocationId;
  receivingLocationName: string;
  receivingLocationType: InventoryLocationType;
  orderDate: string;
  expectedDeliveryDate?: string;
  items: UpdatePurchaseOrderItemRequest[];
  taxAmount: number;
  discountAmount: number;
  notes?: string;
}
