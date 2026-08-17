export type WarehouseStatus = 'active' | 'inactive';
export type WarehouseTransactionType = 'receive' | 'transfer' | 'adjustment';
export type StockAdjustmentType = 'increase' | 'decrease';

export interface Warehouse {
  id: string;
  storeId: string;
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  managerKey: string;
  managerName: string;
  managerEmail: string;
  status: WarehouseStatus;
  createdAt: string;
  updatedAt: string;
}

export type WarehouseUpsert = Omit<Warehouse, 'id' | 'createdAt' | 'updatedAt'>;

export interface WarehouseStock {
  id: string;
  storeId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  averageUnitCost: number;
  updatedAt: string;
}

export interface WarehouseTransactionLine {
  productId: string;
  variantId: string | null;
  batchNumber: string;
  quantity: number;
  unitCost: number;
  previousQuantity: number;
  newQuantity: number;
}

export interface WarehouseTransaction {
  id: string;
  storeId: string;
  warehouseId: string;
  type: WarehouseTransactionType;
  referenceNumber: string;
  occurredAt: string;
  supplierName?: string;
  branchId?: string;
  sourceLocationKey?: string | null;
  destinationLocationKey?: string | null;
  adjustmentType?: StockAdjustmentType;
  reason?: string;
  note?: string;
  lines: WarehouseTransactionLine[];
  totalCost: number;
  createdBy: string;
  createdAt: string;
}

export interface ReceiveStockInput {
  storeId: string;
  warehouseId: string;
  supplierName: string;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
  lines: Array<
    Pick<
      WarehouseTransactionLine,
      'productId' | 'variantId' | 'batchNumber' | 'quantity' | 'unitCost'
    >
  >;
}

export interface TransferStockInput {
  storeId: string;
  sourceLocationKey: string;
  destinationLocationKey: string;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
  lines: Array<Pick<WarehouseTransactionLine, 'productId' | 'variantId' | 'quantity'>>;
}

export interface AdjustStockInput {
  storeId: string;
  warehouseId: string;
  productId: string;
  variantId: string | null;
  adjustmentType: StockAdjustmentType;
  quantity: number;
  reason: string;
  note: string;
  referenceNumber: string;
  occurredAt: string;
  createdBy: string;
}
