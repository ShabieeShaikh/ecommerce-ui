import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { InventoryService } from '../../../../../services/inventory.service';
import { PurchaseReturnService } from '../../../../../services/purchase-return.service';
import { StoreService } from '../../../../../services/store.service';
import { PurchaseReturnReason } from '../models/purchase-return.model';

@Component({
  selector: 'app-view-purchase-return', standalone: true, imports: [DatePipe],
  templateUrl: './view-purchase-return.html', styleUrl: './view-purchase-return.css',
})
export class ViewPurchaseReturn {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly returnService = inject(PurchaseReturnService);
  private readonly inventoryService = inject(InventoryService);
  private readonly storeService = inject(StoreService);
  readonly returnId = this.route.snapshot.paramMap.get('id')?.trim() || null;
  readonly purchaseReturn = computed(() => {
    if (!this.returnId) return undefined;
    const item = this.returnService.getPurchaseReturnById(this.returnId);
    return item?.storeId === this.storeService.selectedStoreId() ? item : undefined;
  });
  readonly totalUnits = computed(() => this.purchaseReturn()?.items.reduce((sum, item) => sum + item.returnNowQuantity, 0) ?? 0);
  readonly transactions = computed(() => {
    const item = this.purchaseReturn();
    return item ? this.inventoryService.getTransactionsByStore(item.storeId).filter((transaction) => transaction.purchaseReturnId === item.id) : [];
  });
  back(): void { void this.router.navigate(['/store-admin/purchasing/purchase-returns']); }
  viewReceipt(): void { const item = this.purchaseReturn(); if (item) void this.router.navigate(['/store-admin/purchasing/goods-receipts', item.goodsReceiptId]); }
  viewPurchaseOrder(): void { const item = this.purchaseReturn(); if (item) void this.router.navigate(['/store-admin/purchasing/purchase-orders', item.purchaseOrderId]); }
  reasonLabel(value: PurchaseReturnReason): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  display(value: string | undefined): string { return value?.trim() || '—'; }
}
