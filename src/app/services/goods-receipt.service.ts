import { Injectable, inject, signal } from '@angular/core';

import {
  CreateGoodsReceiptRequest,
  GoodsReceipt,
  GoodsReceiptItem,
} from '../components/store-admin/purchasing/goods-receipts/models/goods-receipt.model';
import {
  ApplyPurchaseOrderReceiptItem,
  PurchaseOrder,
  PurchaseOrderItem,
} from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { AddInventoryStockLine, InventoryTransaction } from '../models/inventory.models';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryService } from './inventory.service';
import { LocalStorageService } from './local-storage.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StoreService } from './store.service';

const GOODS_RECEIPTS_STORAGE_KEY = 'digishop_goods_receipts_v1';

interface ValidatedReceiptItem {
  purchaseOrderItem: PurchaseOrderItem;
  receivedNowQuantity: number;
}

interface InventoryReceiptLine extends AddInventoryStockLine {
  totalCost: number;
}

@Injectable({ providedIn: 'root' })
export class GoodsReceiptService {
  private readonly storage = inject(LocalStorageService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly inventoryService = inject(InventoryService);
  private readonly inventoryLocationService = inject(InventoryLocationService);
  private readonly storeService = inject(StoreService);

  private readonly receiptsState = signal<GoodsReceipt[]>(this.loadGoodsReceipts());

  readonly receipts = this.receiptsState.asReadonly();

  getGoodsReceiptsByStore(storeId: string): GoodsReceipt[] {
    return this.newestFirst(this.receiptsState().filter((receipt) => receipt.storeId === storeId));
  }

  getGoodsReceiptById(id: string): GoodsReceipt | undefined {
    return this.receiptsState().find((receipt) => receipt.id === id);
  }

  getGoodsReceiptsByPurchaseOrder(purchaseOrderId: string): GoodsReceipt[] {
    return this.newestFirst(
      this.receiptsState().filter((receipt) => receipt.purchaseOrderId === purchaseOrderId),
    );
  }

  receiveGoods(request: CreateGoodsReceiptRequest): GoodsReceipt {
    const purchaseOrder = this.requireReceivablePurchaseOrder(request.purchaseOrderId);
    const receivedDate = this.requireDate(request.receivedDate);
    const validatedItems = this.validateReceiptItems(purchaseOrder, request.items);
    const timestamp = new Date().toISOString();
    const receiptId = this.createId('goods-receipt');
    const grnNumber = this.createGoodsReceiptNumber(timestamp);
    const receiptItems = validatedItems.map(({ purchaseOrderItem, receivedNowQuantity }) =>
      this.createReceiptItem(purchaseOrderItem, receivedNowQuantity),
    );
    const inventoryLines = this.createInventoryLines(validatedItems);
    const purchaseOrderReceiptItems: ApplyPurchaseOrderReceiptItem[] = validatedItems.map(
      ({ purchaseOrderItem, receivedNowQuantity }) => ({
        purchaseOrderItemId: purchaseOrderItem.id,
        receivedNowQuantity,
      }),
    );
    let postedReceipt: GoodsReceipt | undefined;

    this.inventoryService.addStockBatch(
      {
        storeId: purchaseOrder.storeId,
        destinationLocationKey: purchaseOrder.receivingLocationId,
        supplierName: purchaseOrder.supplierName,
        referenceNumber: grnNumber,
        goodsReceiptId: receiptId,
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderNumber: purchaseOrder.poNumber,
        transactionType: 'receive',
        reason: 'Purchase order receipt',
        note: `Received goods via ${grnNumber} against ${purchaseOrder.poNumber} from ${purchaseOrder.supplierName}.`,
        occurredAt: receivedDate,
        createdBy: this.inventoryService.currentUserName(),
        lines: inventoryLines.map(({ totalCost: _totalCost, ...line }) => line),
      },
      (transactions) => {
        const transactionIds = this.indexTransactions(transactions);
        const receipt: GoodsReceipt = {
          id: receiptId,
          grnNumber,
          purchaseOrderId: purchaseOrder.id,
          poNumber: purchaseOrder.poNumber,
          storeId: purchaseOrder.storeId,
          supplierId: purchaseOrder.supplierId,
          supplierName: purchaseOrder.supplierName,
          receivingLocationId: purchaseOrder.receivingLocationId,
          receivingLocationName: purchaseOrder.receivingLocationName,
          receivingLocationType: purchaseOrder.receivingLocationType,
          receivedDate,
          items: receiptItems.map((item) => ({
            ...item,
            inventoryTransactionId:
              transactionIds.get(this.inventoryItemKey(item.productId, item.variantId)) ?? '',
          })),
          notes: this.optionalText(request.notes),
          createdAt: timestamp,
        };

        this.purchaseOrderService.applyReceipt(purchaseOrder.id, purchaseOrderReceiptItems, () => {
          this.commit([receipt, ...this.receiptsState()]);
          postedReceipt = receipt;
        });
      },
    );

    if (!postedReceipt) throw new Error('The goods receipt could not be posted.');
    return postedReceipt;
  }

  private requireReceivablePurchaseOrder(id: string): PurchaseOrder {
    const purchaseOrder = this.purchaseOrderService.getPurchaseOrderById(id);
    if (!purchaseOrder) throw new Error('Purchase order not found.');
    if (purchaseOrder.status !== 'ordered' && purchaseOrder.status !== 'partially_received') {
      throw new Error(
        'Goods can only be received against an ordered or partially received purchase order.',
      );
    }

    const selectedStoreId = this.storeService.selectedStoreId();
    if (selectedStoreId && selectedStoreId !== purchaseOrder.storeId) {
      throw new Error('The purchase order does not belong to the selected store.');
    }
    const destination = this.inventoryLocationService.getLocation(
      purchaseOrder.storeId,
      purchaseOrder.receivingLocationId,
    );
    if (!destination || destination.type !== purchaseOrder.receivingLocationType) {
      throw new Error('The purchase order receiving destination is unavailable.');
    }
    return purchaseOrder;
  }

  private validateReceiptItems(
    purchaseOrder: PurchaseOrder,
    requests: CreateGoodsReceiptRequest['items'],
  ): ValidatedReceiptItem[] {
    if (!requests.length) throw new Error('A goods receipt must contain at least one item.');

    const itemIds = new Set<string>();
    return requests.map((request) => {
      if (itemIds.has(request.purchaseOrderItemId)) {
        throw new Error('A purchase order item cannot be received more than once in one receipt.');
      }
      itemIds.add(request.purchaseOrderItemId);

      const purchaseOrderItem = purchaseOrder.items.find(
        (item) => item.id === request.purchaseOrderItemId,
      );
      if (!purchaseOrderItem) {
        throw new Error('The selected purchase order item could not be found.');
      }
      if (!Number.isInteger(request.receivedNowQuantity) || request.receivedNowQuantity <= 0) {
        throw new Error('Received quantity must be a whole number greater than zero.');
      }
      const remainingQuantity = purchaseOrderItem.quantity - purchaseOrderItem.receivedQuantity;
      if (request.receivedNowQuantity > remainingQuantity) {
        throw new Error(
          `Received quantity for ${purchaseOrderItem.productName} exceeds the remaining quantity of ${remainingQuantity}.`,
        );
      }
      return { purchaseOrderItem, receivedNowQuantity: request.receivedNowQuantity };
    });
  }

  private createReceiptItem(
    purchaseOrderItem: PurchaseOrderItem,
    receivedNowQuantity: number,
  ): Omit<GoodsReceiptItem, 'inventoryTransactionId'> {
    const totalReceivedQuantity = purchaseOrderItem.receivedQuantity + receivedNowQuantity;
    return {
      id: this.createId('goods-receipt-item'),
      purchaseOrderItemId: purchaseOrderItem.id,
      productId: purchaseOrderItem.productId,
      variantId: purchaseOrderItem.variantId,
      productName: purchaseOrderItem.productName,
      variantName: purchaseOrderItem.variantName,
      sku: purchaseOrderItem.sku,
      orderedQuantity: purchaseOrderItem.quantity,
      previouslyReceivedQuantity: purchaseOrderItem.receivedQuantity,
      receivedNowQuantity,
      totalReceivedQuantity,
      remainingQuantity: Math.max(0, purchaseOrderItem.quantity - totalReceivedQuantity),
    };
  }

  private createInventoryLines(items: ValidatedReceiptItem[]): InventoryReceiptLine[] {
    const lines = new Map<string, InventoryReceiptLine>();
    for (const { purchaseOrderItem, receivedNowQuantity } of items) {
      const variantId =
        purchaseOrderItem.variantId === null ? null : String(purchaseOrderItem.variantId);
      const key = this.inventoryItemKey(purchaseOrderItem.productId, variantId);
      const existing = lines.get(key);
      const totalCost = purchaseOrderItem.purchasePrice * receivedNowQuantity;
      if (existing) {
        existing.quantity += receivedNowQuantity;
        existing.totalCost += totalCost;
        existing.unitCost = existing.totalCost / existing.quantity;
      } else {
        lines.set(key, {
          productId: purchaseOrderItem.productId,
          variantId,
          quantity: receivedNowQuantity,
          unitCost: purchaseOrderItem.purchasePrice,
          totalCost,
        });
      }
    }
    return [...lines.values()];
  }

  private indexTransactions(transactions: InventoryTransaction[]): Map<string, string> {
    return new Map(
      transactions.map((transaction) => [
        this.inventoryItemKey(transaction.productId, transaction.variantId),
        transaction.id,
      ]),
    );
  }

  private inventoryItemKey(productId: string, variantId: string | number | null): string {
    return `${productId}:${variantId === null ? 'simple' : String(variantId)}`;
  }

  private createGoodsReceiptNumber(timestamp: string): string {
    const date = timestamp.slice(0, 10).replace(/-/g, '');
    const expression = new RegExp(`^GRN-${date}-(\\d+)$`);
    const existingNumbers = new Set(this.receiptsState().map((receipt) => receipt.grnNumber));
    let sequence = this.receiptsState().reduce((highest, receipt) => {
      const match = expression.exec(receipt.grnNumber);
      const value = match ? Number(match[1]) : 0;
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);
    let grnNumber: string;
    do {
      sequence += 1;
      grnNumber = `GRN-${date}-${sequence.toString().padStart(4, '0')}`;
    } while (existingNumbers.has(grnNumber));
    return grnNumber;
  }

  private requireDate(value: string): string {
    const normalized = value.trim();
    if (!normalized || Number.isNaN(Date.parse(normalized))) {
      throw new Error('Received date is invalid.');
    }
    return normalized;
  }

  private newestFirst(receipts: GoodsReceipt[]): GoodsReceipt[] {
    return [...receipts].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private loadGoodsReceipts(): GoodsReceipt[] {
    try {
      const stored = this.storage.getItem<unknown>(GOODS_RECEIPTS_STORAGE_KEY);
      return Array.isArray(stored) && stored.every((receipt) => this.isGoodsReceipt(receipt))
        ? stored
        : [];
    } catch {
      return [];
    }
  }

  private commit(receipts: GoodsReceipt[]): void {
    this.storage.setItem(GOODS_RECEIPTS_STORAGE_KEY, receipts);
    this.receiptsState.set(receipts);
  }

  private isGoodsReceipt(value: unknown): value is GoodsReceipt {
    if (!this.isRecord(value)) return false;
    const items = value['items'];
    return (
      typeof value['id'] === 'string' &&
      typeof value['grnNumber'] === 'string' &&
      typeof value['purchaseOrderId'] === 'string' &&
      typeof value['poNumber'] === 'string' &&
      typeof value['storeId'] === 'string' &&
      typeof value['supplierId'] === 'number' &&
      Number.isFinite(value['supplierId']) &&
      typeof value['supplierName'] === 'string' &&
      typeof value['receivingLocationId'] === 'string' &&
      typeof value['receivingLocationName'] === 'string' &&
      this.isLocationType(value['receivingLocationType']) &&
      typeof value['receivedDate'] === 'string' &&
      !Number.isNaN(Date.parse(value['receivedDate'])) &&
      Array.isArray(items) &&
      items.length > 0 &&
      items.every((item) => this.isGoodsReceiptItem(item)) &&
      (value['notes'] === undefined || typeof value['notes'] === 'string') &&
      typeof value['createdAt'] === 'string'
    );
  }

  private isGoodsReceiptItem(value: unknown): value is GoodsReceiptItem {
    if (!this.isRecord(value)) return false;
    return (
      typeof value['id'] === 'string' &&
      typeof value['purchaseOrderItemId'] === 'string' &&
      typeof value['inventoryTransactionId'] === 'string' &&
      typeof value['productId'] === 'string' &&
      this.isVariantId(value['variantId']) &&
      typeof value['productName'] === 'string' &&
      (value['variantName'] === undefined || typeof value['variantName'] === 'string') &&
      typeof value['sku'] === 'string' &&
      this.isNonNegativeInteger(value['orderedQuantity']) &&
      this.isNonNegativeInteger(value['previouslyReceivedQuantity']) &&
      this.isPositiveInteger(value['receivedNowQuantity']) &&
      this.isNonNegativeInteger(value['totalReceivedQuantity']) &&
      this.isNonNegativeInteger(value['remainingQuantity'])
    );
  }

  private isLocationType(value: unknown): boolean {
    return value === 'store' || value === 'branch' || value === 'warehouse';
  }

  private isVariantId(value: unknown): boolean {
    return (
      value === null ||
      (typeof value === 'string' && value.length > 0) ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }

  private isNonNegativeInteger(value: unknown): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= 0;
  }

  private isPositiveInteger(value: unknown): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value > 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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
}
