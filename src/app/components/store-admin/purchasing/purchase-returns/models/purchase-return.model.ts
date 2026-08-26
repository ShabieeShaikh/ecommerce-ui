import type { InventoryLocationType, InventoryTransaction } from '../../../../../models/inventory.models';
import type { GoodsReceipt, GoodsReceiptItem } from '../../goods-receipts/models/goods-receipt.model';
import type {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderProductId,
  PurchaseOrderReceivingLocationId,
  PurchaseOrderStoreId,
  PurchaseOrderSupplierId,
  PurchaseOrderVariantId,
} from '../../purchase-orders/models/purchase-order.model';

export type PurchaseReturnReason =
  | 'damaged'
  | 'defective'
  | 'wrong_item'
  | 'quality_issue'
  | 'excess'
  | 'other';

export interface PurchaseReturnItem {
  id: string;
  goodsReceiptItemId: GoodsReceiptItem['id'];
  inventoryTransactionId: InventoryTransaction['id'];
  purchaseOrderItemId: PurchaseOrderItem['id'];
  productId: PurchaseOrderProductId;
  variantId: PurchaseOrderVariantId | null;
  productName: string;
  variantName?: string;
  sku: string;
  receivedQuantity: number;
  previouslyReturnedQuantity: number;
  returnNowQuantity: number;
  totalReturnedQuantity: number;
  remainingReturnableQuantity: number;
}

export interface PurchaseReturn {
  id: string;
  returnNumber: string;
  storeId: PurchaseOrderStoreId;
  supplierId: PurchaseOrderSupplierId;
  supplierName: string;
  purchaseOrderId: PurchaseOrder['id'];
  poNumber: PurchaseOrder['poNumber'];
  goodsReceiptId: GoodsReceipt['id'];
  grnNumber: GoodsReceipt['grnNumber'];
  returnLocationId: PurchaseOrderReceivingLocationId;
  returnLocationName: string;
  returnLocationType: InventoryLocationType;
  returnDate: string;
  reason: PurchaseReturnReason;
  items: PurchaseReturnItem[];
  notes?: string;
  createdAt: string;
}

export interface CreatePurchaseReturnItemRequest {
  goodsReceiptItemId: GoodsReceiptItem['id'];
  returnNowQuantity: number;
}

export interface CreatePurchaseReturnRequest {
  goodsReceiptId: GoodsReceipt['id'];
  returnDate: string;
  reason: PurchaseReturnReason;
  items: CreatePurchaseReturnItemRequest[];
  notes?: string;
}
