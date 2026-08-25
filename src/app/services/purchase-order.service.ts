import { Injectable, inject, signal } from '@angular/core';

import {
  ApplyPurchaseOrderReceiptItem,
  CreatePurchaseOrderItemRequest,
  CreatePurchaseOrderRequest,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderManualStatus,
  PurchaseOrderStatus,
  PurchaseOrderVariantId,
  UpdatePurchaseOrderItemRequest,
  UpdatePurchaseOrderRequest,
} from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import type { ProductVariant } from '../models/product-catalog.models';
import type { InventoryLocationType } from '../models/inventory.models';
import { InventoryLocationService } from './inventory-location.service';
import { LocalStorageService } from './local-storage.service';
import { ProductService } from './product.service';
import { StoreService } from './store.service';
import { SupplierService } from './supplier.service';

const PURCHASE_ORDERS_STORAGE_KEY = 'digishop_purchase_orders';

interface PurchaseOrderTotals {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
}

type LegacyWarehousePurchaseOrder = Omit<
  PurchaseOrder,
  'receivingLocationId' | 'receivingLocationName' | 'receivingLocationType'
> & {
  warehouseId: string;
  warehouseName: string;
};

@Injectable({
  providedIn: 'root',
})
export class PurchaseOrderService {
  private readonly storage = inject(LocalStorageService);
  private readonly storeService = inject(StoreService);
  private readonly supplierService = inject(SupplierService);
  private readonly inventoryLocationService = inject(InventoryLocationService);
  private readonly productService = inject(ProductService);

  private readonly purchaseOrdersState = signal<PurchaseOrder[]>(this.loadPurchaseOrders());

  readonly purchaseOrders = this.purchaseOrdersState.asReadonly();

  getPurchaseOrdersByStore(storeId: string): PurchaseOrder[] {
    return this.purchaseOrdersState().filter((purchaseOrder) => purchaseOrder.storeId === storeId);
  }

  getPurchaseOrderById(id: string): PurchaseOrder | undefined {
    return this.purchaseOrdersState().find((purchaseOrder) => purchaseOrder.id === id);
  }

  createPurchaseOrder(request: CreatePurchaseOrderRequest): PurchaseOrder {
    this.assertReferences(
      request.storeId,
      request.supplierId,
      request.supplierName,
      request.receivingLocationId,
      request.receivingLocationName,
      request.receivingLocationType,
    );
    this.assertDate(request.orderDate, 'Order date is required.');
    this.assertOptionalDate(request.expectedDeliveryDate, 'Expected delivery date is invalid.');

    const items = this.normalizeCreateItems(request.storeId, request.items);
    const totals = this.calculateTotals(items, request.taxAmount, request.discountAmount);
    const timestamp = new Date().toISOString();
    const purchaseOrder: PurchaseOrder = {
      id: this.createId('purchase-order'),
      storeId: request.storeId.trim(),
      poNumber: this.createPurchaseOrderNumber(timestamp),
      supplierId: request.supplierId,
      supplierName: request.supplierName.trim(),
      receivingLocationId: request.receivingLocationId.trim(),
      receivingLocationName: request.receivingLocationName.trim(),
      receivingLocationType: request.receivingLocationType,
      orderDate: request.orderDate.trim(),
      expectedDeliveryDate: this.optionalText(request.expectedDeliveryDate),
      items,
      ...totals,
      notes: this.optionalText(request.notes),
      status: 'draft',
      createdAt: timestamp,
    };

    this.commit([purchaseOrder, ...this.purchaseOrdersState()]);
    return purchaseOrder;
  }

  updatePurchaseOrder(id: string, request: UpdatePurchaseOrderRequest): PurchaseOrder | undefined {
    const existing = this.getPurchaseOrderById(id);
    if (!existing) return undefined;
    if (existing.status !== 'draft') {
      throw new Error('Only draft purchase orders can be edited.');
    }

    this.assertReferences(
      existing.storeId,
      request.supplierId,
      request.supplierName,
      request.receivingLocationId,
      request.receivingLocationName,
      request.receivingLocationType,
    );
    this.assertDate(request.orderDate, 'Order date is required.');
    this.assertOptionalDate(request.expectedDeliveryDate, 'Expected delivery date is invalid.');

    const items = this.normalizeUpdateItems(existing, request.items);
    const totals = this.calculateTotals(items, request.taxAmount, request.discountAmount);
    const updated: PurchaseOrder = {
      ...existing,
      supplierId: request.supplierId,
      supplierName: request.supplierName.trim(),
      receivingLocationId: request.receivingLocationId.trim(),
      receivingLocationName: request.receivingLocationName.trim(),
      receivingLocationType: request.receivingLocationType,
      orderDate: request.orderDate.trim(),
      expectedDeliveryDate: this.optionalText(request.expectedDeliveryDate),
      items,
      ...totals,
      notes: this.optionalText(request.notes),
      updatedAt: new Date().toISOString(),
    };

    this.commit(
      this.purchaseOrdersState().map((purchaseOrder) =>
        purchaseOrder.id === id ? updated : purchaseOrder,
      ),
    );
    return updated;
  }

  changePurchaseOrderStatus(
    id: string,
    status: PurchaseOrderManualStatus,
  ): PurchaseOrder | undefined {
    const existing = this.getPurchaseOrderById(id);
    if (!existing) return undefined;
    if (existing.status === status) return existing;

    this.assertManualStatusTransition(existing, status);
    const updated: PurchaseOrder = {
      ...existing,
      status,
      updatedAt: new Date().toISOString(),
    };

    this.commit(
      this.purchaseOrdersState().map((purchaseOrder) =>
        purchaseOrder.id === id ? updated : purchaseOrder,
      ),
    );
    return updated;
  }

  applyReceipt(
    id: string,
    receiptItems: ApplyPurchaseOrderReceiptItem[],
    afterCommit?: (purchaseOrder: PurchaseOrder) => void,
  ): PurchaseOrder {
    const existing = this.getPurchaseOrderById(id);
    if (!existing) throw new Error('Purchase order not found.');
    if (existing.status !== 'ordered' && existing.status !== 'partially_received') {
      throw new Error(
        'Goods can only be received against an ordered or partially received purchase order.',
      );
    }
    if (!receiptItems.length) throw new Error('A goods receipt must contain at least one item.');

    const itemIds = new Set<string>();
    const receivedByItemId = new Map<string, number>();
    for (const receiptItem of receiptItems) {
      if (itemIds.has(receiptItem.purchaseOrderItemId)) {
        throw new Error('A purchase order item cannot be received more than once in one receipt.');
      }
      itemIds.add(receiptItem.purchaseOrderItemId);

      const item = existing.items.find(
        (candidate) => candidate.id === receiptItem.purchaseOrderItemId,
      );
      if (!item) throw new Error('The selected purchase order item could not be found.');
      const receivedNowQuantity = this.positiveInteger(
        receiptItem.receivedNowQuantity,
        'Received quantity must be a whole number greater than zero.',
      );
      if (receivedNowQuantity > item.quantity - item.receivedQuantity) {
        throw new Error(
          `Received quantity for ${item.productName} exceeds the remaining quantity.`,
        );
      }
      receivedByItemId.set(item.id, receivedNowQuantity);
    }

    const items = existing.items.map((item) => ({
      ...item,
      receivedQuantity: item.receivedQuantity + (receivedByItemId.get(item.id) ?? 0),
    }));
    const hasReceivedItems = items.some((item) => item.receivedQuantity > 0);
    const isComplete = items.every((item) => item.receivedQuantity >= item.quantity);
    const updated: PurchaseOrder = {
      ...existing,
      items,
      status: isComplete ? 'received' : hasReceivedItems ? 'partially_received' : 'ordered',
      updatedAt: new Date().toISOString(),
    };
    const previous = this.purchaseOrdersState();

    this.commit(
      previous.map((purchaseOrder) => (purchaseOrder.id === id ? updated : purchaseOrder)),
    );
    try {
      afterCommit?.(updated);
    } catch (error) {
      this.commit(previous);
      throw error;
    }
    return updated;
  }

  private normalizeCreateItems(
    storeId: string,
    requests: CreatePurchaseOrderItemRequest[],
  ): PurchaseOrderItem[] {
    if (!requests.length) throw new Error('A purchase order must contain at least one item.');
    return requests.map((request) => this.normalizeItem(storeId, request, 0));
  }

  private normalizeUpdateItems(
    purchaseOrder: PurchaseOrder,
    requests: UpdatePurchaseOrderItemRequest[],
  ): PurchaseOrderItem[] {
    if (!requests.length) throw new Error('A purchase order must contain at least one item.');

    const requestedItemIds = new Set(
      requests.flatMap((request) => (request.id ? [request.id] : [])),
    );
    const requestIdCount = requests.filter((request) => request.id).length;
    if (requestedItemIds.size !== requestIdCount) {
      throw new Error('A purchase order item cannot be included more than once.');
    }
    if (
      purchaseOrder.items.some(
        (item) => item.receivedQuantity > 0 && !requestedItemIds.has(item.id),
      )
    ) {
      throw new Error('A line with received goods cannot be removed.');
    }

    return requests.map((request) => {
      const existingItem = request.id
        ? purchaseOrder.items.find((item) => item.id === request.id)
        : undefined;
      if (request.id && !existingItem) {
        throw new Error('The selected purchase order item could not be found.');
      }
      return this.normalizeItem(
        purchaseOrder.storeId,
        request,
        existingItem?.receivedQuantity ?? 0,
        existingItem?.id,
      );
    });
  }

  private normalizeItem(
    storeId: string,
    request: CreatePurchaseOrderItemRequest,
    receivedQuantity: number,
    itemId?: string,
  ): PurchaseOrderItem {
    const product = this.productService.getProductById(request.productId);
    if (!product || product.storeId !== storeId) {
      throw new Error('The selected product does not belong to this store.');
    }

    const variantId = this.requireVariant(product.variants ?? [], request.variantId);
    const productName = request.productName.trim();
    const variantName = this.optionalText(request.variantName);
    const sku = request.sku.trim();
    if (!productName) throw new Error('Product name is required for each purchase order item.');
    if (!sku) throw new Error('SKU is required for each purchase order item.');

    const quantity = this.positiveInteger(
      request.quantity,
      'Item quantity must be greater than zero.',
    );
    if (receivedQuantity > quantity) {
      throw new Error('Ordered quantity cannot be lower than the quantity already received.');
    }
    const purchasePrice = this.nonNegativeMoney(
      request.purchasePrice,
      'Purchase price cannot be negative.',
    );

    return {
      id: itemId ?? this.createId('purchase-order-item'),
      productId: product.id,
      variantId,
      productName,
      variantName,
      sku,
      quantity,
      receivedQuantity,
      purchasePrice,
      lineTotal: this.roundMoney(quantity * purchasePrice),
    };
  }

  private requireVariant(
    variants: ProductVariant[],
    requestedId?: PurchaseOrderVariantId | null,
  ): PurchaseOrderVariantId | null {
    const hasRequestedId = requestedId !== undefined && requestedId !== null && requestedId !== '';
    if (!variants.length) {
      if (hasRequestedId) throw new Error('This product does not have variants.');
      return null;
    }
    if (!hasRequestedId) throw new Error('Select a product variant.');

    const variant = variants.find((item) => String(item.id) === String(requestedId));
    if (variant?.id === undefined || variant.id === null) {
      throw new Error('The selected product variant could not be found.');
    }
    return variant.id;
  }

  private calculateTotals(
    items: PurchaseOrderItem[],
    requestedTaxAmount: number,
    requestedDiscountAmount: number,
  ): PurchaseOrderTotals {
    const subtotal = this.roundMoney(
      items.reduce((total, item) => total + item.quantity * item.purchasePrice, 0),
    );
    const taxAmount = this.nonNegativeMoney(requestedTaxAmount, 'Tax amount cannot be negative.');
    const discountAmount = this.nonNegativeMoney(
      requestedDiscountAmount,
      'Discount amount cannot be negative.',
    );
    return {
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount: this.roundMoney(Math.max(0, subtotal + taxAmount - discountAmount)),
    };
  }

  private assertReferences(
    storeId: string,
    supplierId: number,
    supplierName: string,
    receivingLocationId: string,
    receivingLocationName: string,
    receivingLocationType: InventoryLocationType,
  ): void {
    const normalizedStoreId = storeId.trim();
    if (!normalizedStoreId || !this.storeService.getStoreById(normalizedStoreId)) {
      throw new Error('The selected store could not be found.');
    }
    if (!Number.isFinite(supplierId) || supplierId <= 0) {
      throw new Error('A valid supplier is required.');
    }
    const supplier = this.supplierService.getSupplierById(supplierId);
    if (!supplier || supplier.storeId !== normalizedStoreId) {
      throw new Error('The selected supplier does not belong to this store.');
    }
    const normalizedLocationId = receivingLocationId.trim();
    const receivingLocation = normalizedLocationId
      ? this.inventoryLocationService.getLocation(normalizedStoreId, normalizedLocationId)
      : undefined;
    if (!receivingLocation || receivingLocation.storeId !== normalizedStoreId) {
      throw new Error('The selected receiving location is unavailable for this store.');
    }
    if (receivingLocation.type !== receivingLocationType) {
      throw new Error('The selected receiving location type is invalid.');
    }
    if (!supplierName.trim()) throw new Error('Supplier name is required.');
    if (!receivingLocationName.trim()) throw new Error('Receiving location name is required.');
  }

  private assertManualStatusTransition(
    purchaseOrder: PurchaseOrder,
    targetStatus: PurchaseOrderManualStatus,
  ): void {
    if (targetStatus === 'ordered' && purchaseOrder.status !== 'draft') {
      throw new Error('Only a draft purchase order can be marked as ordered.');
    }
    if (targetStatus === 'cancelled') {
      const canCancel = purchaseOrder.status === 'draft' || purchaseOrder.status === 'ordered';
      if (!canCancel) throw new Error('This purchase order cannot be cancelled.');
      if (purchaseOrder.items.some((item) => item.receivedQuantity > 0)) {
        throw new Error('A purchase order with received goods cannot be cancelled.');
      }
    }
  }

  private createPurchaseOrderNumber(timestamp: string): string {
    const date = timestamp.slice(0, 10).replace(/-/g, '');
    const expression = new RegExp(`^PO-${date}-(\\d+)$`);
    const existingNumbers = new Set(this.purchaseOrdersState().map((order) => order.poNumber));
    let sequence = this.purchaseOrdersState().reduce((highest, order) => {
      const match = expression.exec(order.poNumber);
      if (!match) return highest;
      const value = Number(match[1]);
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);

    let poNumber: string;
    do {
      sequence += 1;
      poNumber = `PO-${date}-${sequence.toString().padStart(4, '0')}`;
    } while (existingNumbers.has(poNumber));
    return poNumber;
  }

  private loadPurchaseOrders(): PurchaseOrder[] {
    try {
      const stored = this.storage.getItem<unknown>(PURCHASE_ORDERS_STORAGE_KEY);
      if (!Array.isArray(stored)) return [];

      const purchaseOrders: PurchaseOrder[] = [];
      let migratedLegacyRecords = false;
      for (const value of stored) {
        if (this.isPurchaseOrder(value)) {
          purchaseOrders.push(this.normalizeStoredPurchaseOrder(value));
          continue;
        }
        if (this.isLegacyWarehousePurchaseOrder(value)) {
          purchaseOrders.push(
            this.normalizeStoredPurchaseOrder(this.migrateLegacyPurchaseOrder(value)),
          );
          migratedLegacyRecords = true;
          continue;
        }
        return [];
      }

      if (migratedLegacyRecords) {
        this.storage.setItem(PURCHASE_ORDERS_STORAGE_KEY, purchaseOrders);
      }
      return purchaseOrders;
    } catch {
      return [];
    }
  }

  private migrateLegacyPurchaseOrder(legacy: LegacyWarehousePurchaseOrder): PurchaseOrder {
    const { warehouseId, warehouseName, ...purchaseOrder } = legacy;
    return {
      ...purchaseOrder,
      receivingLocationId: warehouseId.startsWith('warehouse:')
        ? warehouseId
        : `warehouse:${warehouseId}`,
      receivingLocationName: warehouseName,
      receivingLocationType: 'warehouse',
    };
  }

  private normalizeStoredPurchaseOrder(purchaseOrder: PurchaseOrder): PurchaseOrder {
    const items = purchaseOrder.items.map((item) => ({
      ...item,
      lineTotal: this.roundMoney(item.quantity * item.purchasePrice),
    }));
    return {
      ...purchaseOrder,
      items,
      ...this.calculateTotals(items, purchaseOrder.taxAmount, purchaseOrder.discountAmount),
    };
  }

  private savePurchaseOrders(): void {
    this.storage.setItem(PURCHASE_ORDERS_STORAGE_KEY, this.purchaseOrdersState());
  }

  private commit(purchaseOrders: PurchaseOrder[]): void {
    const previous = this.purchaseOrdersState();
    this.purchaseOrdersState.set(purchaseOrders);
    try {
      this.savePurchaseOrders();
    } catch (error) {
      this.purchaseOrdersState.set(previous);
      throw error;
    }
  }

  private assertDate(value: string, message: string): void {
    if (!value.trim() || Number.isNaN(Date.parse(value))) throw new Error(message);
  }

  private assertOptionalDate(value: string | undefined, message: string): void {
    if (value?.trim()) this.assertDate(value, message);
  }

  private positiveInteger(value: number, message: string): number {
    if (!Number.isInteger(value) || value <= 0) throw new Error(message);
    return value;
  }

  private nonNegativeMoney(value: number, message: string): number {
    if (!Number.isFinite(value) || value < 0) throw new Error(message);
    return this.roundMoney(value);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private optionalText(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }

  private createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }

  private isPurchaseOrder(value: unknown): value is PurchaseOrder {
    if (!this.isRecord(value)) return false;
    return (
      this.hasPurchaseOrderCore(value) &&
      typeof value['receivingLocationId'] === 'string' &&
      typeof value['receivingLocationName'] === 'string' &&
      this.isInventoryLocationType(value['receivingLocationType'])
    );
  }

  private isLegacyWarehousePurchaseOrder(value: unknown): value is LegacyWarehousePurchaseOrder {
    return (
      this.isRecord(value) &&
      this.hasPurchaseOrderCore(value) &&
      typeof value['warehouseId'] === 'string' &&
      typeof value['warehouseName'] === 'string'
    );
  }

  private hasPurchaseOrderCore(value: Record<string, unknown>): boolean {
    const items = value['items'];
    return (
      typeof value['id'] === 'string' &&
      typeof value['storeId'] === 'string' &&
      typeof value['poNumber'] === 'string' &&
      typeof value['supplierId'] === 'number' &&
      Number.isFinite(value['supplierId']) &&
      typeof value['supplierName'] === 'string' &&
      typeof value['orderDate'] === 'string' &&
      this.isOptionalString(value['expectedDeliveryDate']) &&
      Array.isArray(items) &&
      items.length > 0 &&
      items.every((item) => this.isPurchaseOrderItem(item)) &&
      this.isNonNegativeFiniteNumber(value['subtotal']) &&
      this.isNonNegativeFiniteNumber(value['taxAmount']) &&
      this.isNonNegativeFiniteNumber(value['discountAmount']) &&
      this.isNonNegativeFiniteNumber(value['totalAmount']) &&
      this.isOptionalString(value['notes']) &&
      this.isPurchaseOrderStatus(value['status']) &&
      typeof value['createdAt'] === 'string' &&
      this.isOptionalString(value['updatedAt'])
    );
  }

  private isInventoryLocationType(value: unknown): value is InventoryLocationType {
    return value === 'store' || value === 'branch' || value === 'warehouse';
  }

  private isPurchaseOrderItem(value: unknown): value is PurchaseOrderItem {
    if (!this.isRecord(value)) return false;
    const quantity = value['quantity'];
    const receivedQuantity = value['receivedQuantity'];
    return (
      typeof value['id'] === 'string' &&
      typeof value['productId'] === 'string' &&
      this.isVariantId(value['variantId']) &&
      typeof value['productName'] === 'string' &&
      this.isOptionalString(value['variantName']) &&
      typeof value['sku'] === 'string' &&
      typeof quantity === 'number' &&
      Number.isInteger(quantity) &&
      quantity > 0 &&
      typeof receivedQuantity === 'number' &&
      Number.isInteger(receivedQuantity) &&
      receivedQuantity >= 0 &&
      receivedQuantity <= quantity &&
      this.isNonNegativeFiniteNumber(value['purchasePrice']) &&
      this.isNonNegativeFiniteNumber(value['lineTotal'])
    );
  }

  private isVariantId(value: unknown): value is PurchaseOrderVariantId | null {
    return (
      value === null ||
      (typeof value === 'string' && value.length > 0) ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }

  private isPurchaseOrderStatus(value: unknown): value is PurchaseOrderStatus {
    return (
      value === 'draft' ||
      value === 'ordered' ||
      value === 'partially_received' ||
      value === 'received' ||
      value === 'cancelled'
    );
  }

  private isNonNegativeFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  private isOptionalString(value: unknown): value is string | undefined {
    return value === undefined || typeof value === 'string';
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
