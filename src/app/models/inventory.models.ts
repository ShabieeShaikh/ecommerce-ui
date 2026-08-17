export type InventoryLocationType = 'store' | 'branch' | 'warehouse';
export type InventoryTransactionType =
  | 'add'
  | 'allocate'
  | 'transfer'
  | 'adjustment'
  | 'receive'
  | 'return'
  | 'sale'
  | 'reserve'
  | 'release';
export type InventoryAdjustmentType = 'increase' | 'decrease';
export type InventoryOrderStatus = 'reserved' | 'confirmed' | 'shipped' | 'cancelled' | 'returned';

export interface InventoryLocation {
  key: string;
  storeId: string;
  type: InventoryLocationType;
  entityId: string | null;
  name: string;
  code: string;
  active: boolean;
}

export interface InventoryBalance {
  id: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  locationId: string;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  averageUnitCost: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryBalanceView extends InventoryBalance {
  location: InventoryLocation;
  availableQuantity: number;
}

export interface InventoryTransaction {
  id: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  type: InventoryTransactionType;
  quantity: number;
  unitCost?: number;
  batchNumber?: string;
  sourceLocationKey: string | null;
  destinationLocationKey: string | null;
  sourceBeforeQuantity: number | null;
  sourceAfterQuantity: number | null;
  destinationBeforeQuantity: number | null;
  destinationAfterQuantity: number | null;
  referenceNumber: string;
  reason: string;
  note: string;
  occurredAt: string;
  createdBy: string;
  createdAt: string;
}

export interface InventoryItemSelection {
  productId: string;
  variantId: string | null;
}

export interface AddInventoryStockInput extends InventoryItemSelection {
  storeId: string;
  destinationLocationKey: string;
  quantity: number;
  unitCost: number;
  supplierName: string;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
}

export interface AddInventoryStockLine extends InventoryItemSelection {
  quantity: number;
  unitCost: number;
  batchNumber?: string;
}

export interface AddInventoryStockBatchInput {
  storeId: string;
  destinationLocationKey: string;
  supplierName: string;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
  lines: AddInventoryStockLine[];
}

export interface AllocateInventoryStockInput extends InventoryItemSelection {
  storeId: string;
  sourceLocationKey: string;
  allocations: Array<{ branchId: string; quantity: number }>;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
}

export interface TransferInventoryStockInput extends InventoryItemSelection {
  storeId: string;
  sourceLocationKey: string;
  destinationLocationKey: string;
  quantity: number;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
}

export interface AdjustInventoryStockInput extends InventoryItemSelection {
  storeId: string;
  locationKey: string;
  adjustmentType: InventoryAdjustmentType;
  quantity: number;
  reason: string;
  note: string;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
}

export interface InventoryOrder extends InventoryItemSelection {
  id: string;
  storeId: string;
  referenceNumber: string;
  customerName: string;
  branchId: string;
  quantity: number;
  status: InventoryOrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateInventoryOrderInput extends InventoryItemSelection {
  storeId: string;
  customerName: string;
  branchId: string;
  quantity: number;
  referenceNumber: string;
  createdBy: string;
}
