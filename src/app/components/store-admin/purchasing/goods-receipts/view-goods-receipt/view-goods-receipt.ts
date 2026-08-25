import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { GoodsReceiptService } from '../../../../../services/goods-receipt.service';
import { InventoryService } from '../../../../../services/inventory.service';
import { StoreService } from '../../../../../services/store.service';
import {
  InventoryLocationType,
  InventoryTransaction,
} from '../../../../../models/inventory.models';
import { GoodsReceipt, GoodsReceiptItem } from '../models/goods-receipt.model';

@Component({
  selector: 'app-view-goods-receipt',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './view-goods-receipt.html',
  styleUrl: './view-goods-receipt.css',
})
export class ViewGoodsReceipt {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly inventoryService = inject(InventoryService);
  private readonly storeService = inject(StoreService);

  readonly receiptId = this.route.snapshot.paramMap.get('id')?.trim() || null;

  readonly receipt = computed<GoodsReceipt | undefined>(() => {
    if (!this.receiptId) return undefined;
    const receipt = this.goodsReceiptService.getGoodsReceiptById(this.receiptId);
    return receipt?.storeId === this.storeService.selectedStoreId() ? receipt : undefined;
  });

  readonly inventoryMovements = computed<InventoryTransaction[]>(() => {
    const receipt = this.receipt();
    if (!receipt) return [];
    return this.inventoryService
      .getTransactionsByStore(receipt.storeId)
      .filter((transaction) => transaction.goodsReceiptId === receipt.id);
  });

  readonly totalUnits = computed(
    () => this.receipt()?.items.reduce((total, item) => total + item.receivedNowQuantity, 0) ?? 0,
  );

  backToReceipts(): void {
    void this.router.navigate(['/store-admin/purchasing/goods-receipts']);
  }

  viewPurchaseOrder(receipt: GoodsReceipt): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders', receipt.purchaseOrderId]);
  }

  displayValue(value: string | undefined): string {
    return value?.trim() || '—';
  }

  locationTypeLabel(type: InventoryLocationType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  movementProductName(transaction: InventoryTransaction): string {
    const receipt = this.receipt();
    const item = receipt?.items.find(
      (candidate) =>
        candidate.inventoryTransactionId === transaction.id ||
        (candidate.productId === transaction.productId &&
          this.variantKey(candidate.variantId) === this.variantKey(transaction.variantId)),
    );
    return item?.productName ?? 'Received product';
  }

  itemTotalLabel(item: GoodsReceiptItem): string {
    return `${item.totalReceivedQuantity} / ${item.orderedQuantity}`;
  }

  private variantKey(value: string | number | null): string {
    return value === null ? 'simple' : String(value);
  }
}
