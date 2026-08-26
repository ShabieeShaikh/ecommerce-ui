import { Injectable, inject, signal } from '@angular/core';

import {
  CreatePurchaseReturnRequest,
  PurchaseReturn,
  PurchaseReturnItem,
  PurchaseReturnReason,
} from '../components/store-admin/purchasing/purchase-returns/models/purchase-return.model';
import { GoodsReceipt, GoodsReceiptItem } from '../components/store-admin/purchasing/goods-receipts/models/goods-receipt.model';
import { InventoryTransaction, RemoveInventoryStockLine } from '../models/inventory.models';
import { GoodsReceiptService } from './goods-receipt.service';
import { InventoryService } from './inventory.service';
import { LocalStorageService } from './local-storage.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StoreService } from './store.service';

const PURCHASE_RETURNS_STORAGE_KEY = 'digishop_purchase_returns_v1';
const PURCHASE_RETURN_REASONS: readonly PurchaseReturnReason[] = [
  'damaged', 'defective', 'wrong_item', 'quality_issue', 'excess', 'other',
];

interface ValidatedReturnItem {
  goodsReceiptItem: GoodsReceiptItem;
  previouslyReturnedQuantity: number;
  returnNowQuantity: number;
}

@Injectable({ providedIn: 'root' })
export class PurchaseReturnService {
  private readonly storage = inject(LocalStorageService);
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly inventoryService = inject(InventoryService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);
  private readonly returnsState = signal<PurchaseReturn[]>(this.loadPurchaseReturns());

  readonly returns = this.returnsState.asReadonly();

  getPurchaseReturnsByStore(storeId: string): PurchaseReturn[] {
    return this.newestFirst(this.returnsState().filter((item) => item.storeId === storeId));
  }

  getPurchaseReturnById(id: string): PurchaseReturn | undefined {
    return this.returnsState().find((item) => item.id === id);
  }

  getPurchaseReturnsBySupplier(supplierId: number): PurchaseReturn[] {
    return this.newestFirst(this.returnsState().filter((item) => item.supplierId === supplierId));
  }

  getPurchaseReturnsByPurchaseOrder(purchaseOrderId: string): PurchaseReturn[] {
    return this.newestFirst(
      this.returnsState().filter((item) => item.purchaseOrderId === purchaseOrderId),
    );
  }

  getPurchaseReturnsByGoodsReceipt(goodsReceiptId: string): PurchaseReturn[] {
    return this.newestFirst(
      this.returnsState().filter((item) => item.goodsReceiptId === goodsReceiptId),
    );
  }

  getPreviouslyReturnedQuantity(goodsReceiptItemId: string): number {
    return this.returnsState().reduce(
      (total, purchaseReturn) =>
        total + purchaseReturn.items
          .filter((item) => item.goodsReceiptItemId === goodsReceiptItemId)
          .reduce((itemTotal, item) => itemTotal + item.returnNowQuantity, 0),
      0,
    );
  }

  getRemainingReturnableQuantity(goodsReceiptId: string, goodsReceiptItemId: string): number {
    const receipt = this.goodsReceiptService.getGoodsReceiptById(goodsReceiptId);
    const item = receipt?.items.find((candidate) => candidate.id === goodsReceiptItemId);
    if (!receipt || !item) return 0;
    return Math.max(0, item.receivedNowQuantity - this.getPreviouslyReturnedQuantity(item.id));
  }

  createPurchaseReturn(request: CreatePurchaseReturnRequest): PurchaseReturn {
    const receipt = this.requireGoodsReceipt(request.goodsReceiptId);
    const returnDate = this.requireDate(request.returnDate, receipt.receivedDate);
    const reason = this.requireReason(request.reason);
    const validatedItems = this.validateItems(receipt, request.items);
    const inventoryLines = this.aggregateInventoryLines(validatedItems);
    this.validateAvailableInventory(receipt, inventoryLines);

    const timestamp = new Date().toISOString();
    const purchaseReturnId = this.createId('purchase-return');
    const returnNumber = this.createReturnNumber(timestamp);
    const notes = this.optionalText(request.notes);
    let postedReturn: PurchaseReturn | undefined;

    this.inventoryService.removeStockBatch(
      {
        storeId: receipt.storeId,
        sourceLocationKey: receipt.receivingLocationId,
        supplierId: receipt.supplierId,
        supplierName: receipt.supplierName,
        referenceNumber: returnNumber,
        purchaseReturnId,
        purchaseReturnNumber: returnNumber,
        goodsReceiptId: receipt.id,
        goodsReceiptNumber: receipt.grnNumber,
        purchaseOrderId: receipt.purchaseOrderId,
        purchaseOrderNumber: receipt.poNumber,
        reason: this.reasonLabel(reason),
        note: notes ?? `Returned goods via ${returnNumber} against ${receipt.grnNumber}.`,
        occurredAt: returnDate,
        createdBy: this.inventoryService.currentUserName(),
        lines: inventoryLines,
      },
      (transactions) => {
        const transactionIds = this.indexTransactions(transactions);
        const purchaseReturn: PurchaseReturn = {
          id: purchaseReturnId,
          returnNumber,
          storeId: receipt.storeId,
          supplierId: receipt.supplierId,
          supplierName: receipt.supplierName,
          purchaseOrderId: receipt.purchaseOrderId,
          poNumber: receipt.poNumber,
          goodsReceiptId: receipt.id,
          grnNumber: receipt.grnNumber,
          returnLocationId: receipt.receivingLocationId,
          returnLocationName: receipt.receivingLocationName,
          returnLocationType: receipt.receivingLocationType,
          returnDate,
          reason,
          items: validatedItems.map((item) =>
            this.createReturnItem(
              item,
              transactionIds.get(this.inventoryItemKey(item.goodsReceiptItem.productId, item.goodsReceiptItem.variantId)) ?? '',
            ),
          ),
          notes,
          createdAt: timestamp,
        };
        this.commit([purchaseReturn, ...this.returnsState()]);
        postedReturn = purchaseReturn;
      },
    );

    if (!postedReturn) throw new Error('The purchase return could not be posted.');
    return postedReturn;
  }

  private requireGoodsReceipt(id: string): GoodsReceipt {
    const receipt = this.goodsReceiptService.getGoodsReceiptById(id.trim());
    if (!receipt) throw new Error('Goods Receipt not found.');
    if (receipt.storeId !== this.storeService.selectedStoreId()) {
      throw new Error('The Goods Receipt does not belong to the selected store.');
    }
    const purchaseOrder = this.purchaseOrderService.getPurchaseOrderById(receipt.purchaseOrderId);
    if (!purchaseOrder) throw new Error('The Purchase Order related to this Goods Receipt was not found.');
    if (
      purchaseOrder.storeId !== receipt.storeId ||
      purchaseOrder.supplierId !== receipt.supplierId ||
      purchaseOrder.poNumber !== receipt.poNumber ||
      purchaseOrder.receivingLocationId !== receipt.receivingLocationId
    ) {
      throw new Error('The Goods Receipt and Purchase Order relationship is inconsistent.');
    }
    for (const item of receipt.items) {
      const purchaseOrderItem = purchaseOrder.items.find((candidate) => candidate.id === item.purchaseOrderItemId);
      if (
        !purchaseOrderItem ||
        purchaseOrderItem.productId !== item.productId ||
        String(purchaseOrderItem.variantId ?? '') !== String(item.variantId ?? '')
      ) {
        throw new Error('A Goods Receipt item no longer matches its Purchase Order item.');
      }
    }
    return receipt;
  }

  private validateItems(
    receipt: GoodsReceipt,
    requests: CreatePurchaseReturnRequest['items'],
  ): ValidatedReturnItem[] {
    if (!requests.length) throw new Error('A purchase return must contain at least one item.');
    const itemIds = new Set<string>();
    return requests.map((request) => {
      if (itemIds.has(request.goodsReceiptItemId)) {
        throw new Error('A Goods Receipt item cannot appear more than once in one purchase return.');
      }
      itemIds.add(request.goodsReceiptItemId);
      const goodsReceiptItem = receipt.items.find((item) => item.id === request.goodsReceiptItemId);
      if (!goodsReceiptItem) {
        throw new Error('The selected Goods Receipt item does not belong to this Goods Receipt.');
      }
      if (!Number.isInteger(request.returnNowQuantity) || request.returnNowQuantity <= 0) {
        throw new Error('Return quantity must be a whole number greater than zero.');
      }
      const previouslyReturnedQuantity = this.getPreviouslyReturnedQuantity(goodsReceiptItem.id);
      const remaining = Math.max(0, goodsReceiptItem.receivedNowQuantity - previouslyReturnedQuantity);
      if (request.returnNowQuantity > remaining) {
        throw new Error(
          `Return quantity for ${goodsReceiptItem.productName} exceeds the remaining returnable quantity of ${remaining}.`,
        );
      }
      return { goodsReceiptItem, previouslyReturnedQuantity, returnNowQuantity: request.returnNowQuantity };
    });
  }

  private aggregateInventoryLines(items: ValidatedReturnItem[]): RemoveInventoryStockLine[] {
    const lines = new Map<string, RemoveInventoryStockLine>();
    for (const item of items) {
      const source = item.goodsReceiptItem;
      const key = this.inventoryItemKey(source.productId, source.variantId);
      const existing = lines.get(key);
      if (existing) existing.quantity += item.returnNowQuantity;
      else lines.set(key, {
        productId: source.productId,
        variantId: source.variantId === null ? null : String(source.variantId),
        quantity: item.returnNowQuantity,
      });
    }
    return [...lines.values()];
  }

  private validateAvailableInventory(receipt: GoodsReceipt, lines: RemoveInventoryStockLine[]): void {
    for (const line of lines) {
      const balance = this.inventoryService.getBalance(
        receipt.storeId, line.productId, receipt.receivingLocationId, line.variantId,
      );
      if (line.quantity > balance.availableQuantity) {
        throw new Error(
          `Return quantity for ${this.itemName(receipt, line)} exceeds current available stock of ${balance.availableQuantity} at ${receipt.receivingLocationName}.`,
        );
      }
    }
  }

  private createReturnItem(
    item: ValidatedReturnItem,
    inventoryTransactionId: string,
  ): PurchaseReturnItem {
    const source = item.goodsReceiptItem;
    const totalReturnedQuantity = item.previouslyReturnedQuantity + item.returnNowQuantity;
    return {
      id: this.createId('purchase-return-item'),
      goodsReceiptItemId: source.id,
      inventoryTransactionId,
      purchaseOrderItemId: source.purchaseOrderItemId,
      productId: source.productId,
      variantId: source.variantId,
      productName: source.productName,
      variantName: source.variantName,
      sku: source.sku,
      receivedQuantity: source.receivedNowQuantity,
      previouslyReturnedQuantity: item.previouslyReturnedQuantity,
      returnNowQuantity: item.returnNowQuantity,
      totalReturnedQuantity,
      remainingReturnableQuantity: Math.max(0, source.receivedNowQuantity - totalReturnedQuantity),
    };
  }

  private createReturnNumber(timestamp: string): string {
    const date = timestamp.slice(0, 10).replace(/-/g, '');
    const expression = new RegExp(`^PR-${date}-(\\d+)$`);
    const existing = new Set(this.returnsState().map((item) => item.returnNumber));
    let sequence = this.returnsState().reduce((highest, item) => {
      const match = expression.exec(item.returnNumber);
      return Math.max(highest, match ? Number(match[1]) || 0 : 0);
    }, 0);
    let result: string;
    do { result = `PR-${date}-${(++sequence).toString().padStart(4, '0')}`; } while (existing.has(result));
    return result;
  }

  private requireDate(value: string, receivedDate: string): string {
    const normalized = value.trim();
    const timestamp = Date.parse(normalized);
    if (!normalized || Number.isNaN(timestamp)) throw new Error('Return date is invalid.');
    if (timestamp < Date.parse(receivedDate)) {
      throw new Error('Return date cannot be earlier than the Goods Receipt date.');
    }
    return normalized;
  }

  private requireReason(value: PurchaseReturnReason): PurchaseReturnReason {
    if (!PURCHASE_RETURN_REASONS.includes(value)) throw new Error('Purchase return reason is invalid.');
    return value;
  }

  private indexTransactions(transactions: InventoryTransaction[]): Map<string, string> {
    return new Map(transactions.map((item) => [this.inventoryItemKey(item.productId, item.variantId), item.id]));
  }
  private itemName(receipt: GoodsReceipt, line: RemoveInventoryStockLine): string {
    return receipt.items.find((item) => item.productId === line.productId && item.variantId === line.variantId)?.productName ?? 'item';
  }
  private inventoryItemKey(productId: string, variantId: string | number | null): string {
    return `${productId}:${variantId === null ? 'simple' : String(variantId)}`;
  }
  private reasonLabel(value: PurchaseReturnReason): string {
    return `Supplier return: ${value.split('_').join(' ')}`;
  }
  private optionalText(value: string | undefined): string | undefined { return value?.trim() || undefined; }
  private newestFirst(items: PurchaseReturn[]): PurchaseReturn[] {
    return [...items].sort((left, right) => right.returnDate.localeCompare(left.returnDate) || right.createdAt.localeCompare(left.createdAt));
  }
  private commit(items: PurchaseReturn[]): void {
    this.storage.setItem(PURCHASE_RETURNS_STORAGE_KEY, items);
    this.returnsState.set(items);
  }
  private loadPurchaseReturns(): PurchaseReturn[] {
    try {
      const stored = this.storage.getItem<unknown>(PURCHASE_RETURNS_STORAGE_KEY);
      return Array.isArray(stored) && stored.every((item) => this.isPurchaseReturn(item)) ? stored : [];
    } catch { return []; }
  }
  private isPurchaseReturn(value: unknown): value is PurchaseReturn {
    if (!this.isRecord(value)) return false;
    const items = value['items'];
    return typeof value['id'] === 'string' && typeof value['returnNumber'] === 'string' &&
      typeof value['storeId'] === 'string' && typeof value['supplierId'] === 'number' && Number.isFinite(value['supplierId']) &&
      typeof value['supplierName'] === 'string' && typeof value['purchaseOrderId'] === 'string' &&
      typeof value['poNumber'] === 'string' && typeof value['goodsReceiptId'] === 'string' &&
      typeof value['grnNumber'] === 'string' && typeof value['returnLocationId'] === 'string' &&
      typeof value['returnLocationName'] === 'string' && this.isLocationType(value['returnLocationType']) &&
      this.isDate(value['returnDate']) && this.isReason(value['reason']) && Array.isArray(items) && items.length > 0 &&
      items.every((item) => this.isPurchaseReturnItem(item)) &&
      (value['notes'] === undefined || typeof value['notes'] === 'string') && this.isDate(value['createdAt']);
  }
  private isPurchaseReturnItem(value: unknown): value is PurchaseReturnItem {
    if (!this.isRecord(value)) return false;
    return typeof value['id'] === 'string' && typeof value['goodsReceiptItemId'] === 'string' &&
      typeof value['inventoryTransactionId'] === 'string' && typeof value['purchaseOrderItemId'] === 'string' &&
      typeof value['productId'] === 'string' && (value['variantId'] === null || typeof value['variantId'] === 'string' || typeof value['variantId'] === 'number') &&
      typeof value['productName'] === 'string' && (value['variantName'] === undefined || typeof value['variantName'] === 'string') &&
      typeof value['sku'] === 'string' && this.isNonNegativeInteger(value['receivedQuantity']) &&
      this.isNonNegativeInteger(value['previouslyReturnedQuantity']) && this.isPositiveInteger(value['returnNowQuantity']) &&
      this.isNonNegativeInteger(value['totalReturnedQuantity']) && this.isNonNegativeInteger(value['remainingReturnableQuantity']);
  }
  private isReason(value: unknown): value is PurchaseReturnReason { return PURCHASE_RETURN_REASONS.includes(value as PurchaseReturnReason); }
  private isLocationType(value: unknown): boolean { return value === 'store' || value === 'branch' || value === 'warehouse'; }
  private isDate(value: unknown): boolean { return typeof value === 'string' && !Number.isNaN(Date.parse(value)); }
  private isPositiveInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value > 0; }
  private isNonNegativeInteger(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 0; }
  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
