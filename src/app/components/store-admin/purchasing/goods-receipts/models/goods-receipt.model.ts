import type { InventoryLocationType } from '../../../../../models/inventory.models';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderProductId,
  PurchaseOrderReceivingLocationId,
  PurchaseOrderStoreId,
  PurchaseOrderSupplierId,
  PurchaseOrderVariantId,
} from '../../purchase-orders/models/purchase-order.model';

export interface GoodsReceiptItem {
  id: string;
  purchaseOrderItemId: PurchaseOrderItem['id'];
  inventoryTransactionId: string;
  productId: PurchaseOrderProductId;
  variantId: PurchaseOrderVariantId | null;
  productName: string;
  variantName?: string;
  sku: string;
  orderedQuantity: number;
  previouslyReceivedQuantity: number;
  receivedNowQuantity: number;
  totalReceivedQuantity: number;
  remainingQuantity: number;
}

export interface GoodsReceipt {
  id: string;
  grnNumber: string;
  purchaseOrderId: PurchaseOrder['id'];
  poNumber: PurchaseOrder['poNumber'];
  storeId: PurchaseOrderStoreId;
  supplierId: PurchaseOrderSupplierId;
  supplierName: string;
  receivingLocationId: PurchaseOrderReceivingLocationId;
  receivingLocationName: string;
  receivingLocationType: InventoryLocationType;
  receivedDate: string;
  items: GoodsReceiptItem[];
  notes?: string;
  createdAt: string;
}

export interface CreateGoodsReceiptItemRequest {
  purchaseOrderItemId: PurchaseOrderItem['id'];
  receivedNowQuantity: number;
}

export interface CreateGoodsReceiptRequest {
  purchaseOrderId: PurchaseOrder['id'];
  receivedDate: string;
  items: CreateGoodsReceiptItemRequest[];
  notes?: string;
}
