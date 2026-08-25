import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { GoodsReceiptService } from '../../../../../services/goods-receipt.service';
import { StoreService } from '../../../../../services/store.service';
import { InventoryLocationType } from '../../../../../models/inventory.models';
import { GoodsReceipt } from '../models/goods-receipt.model';

interface ReceiptLocationOption {
  id: string;
  name: string;
  type: InventoryLocationType;
}

@Component({
  selector: 'app-goods-receipt-list',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './goods-receipt-list.html',
  styleUrl: './goods-receipt-list.css',
})
export class GoodsReceiptList {
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly searchTerm = signal('');
  readonly locationFilter = signal('all');

  readonly receipts = computed(() =>
    this.goodsReceiptService.getGoodsReceiptsByStore(this.storeService.selectedStoreId()),
  );

  readonly locationOptions = computed<ReceiptLocationOption[]>(() => {
    const locations = new Map<string, ReceiptLocationOption>();
    for (const receipt of this.receipts()) {
      if (!locations.has(receipt.receivingLocationId)) {
        locations.set(receipt.receivingLocationId, {
          id: receipt.receivingLocationId,
          name: receipt.receivingLocationName,
          type: receipt.receivingLocationType,
        });
      }
    }
    return [...locations.values()].sort((left, right) => left.name.localeCompare(right.name));
  });

  readonly filteredReceipts = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    const locationId = this.locationFilter();
    return this.receipts().filter((receipt) => {
      if (locationId !== 'all' && receipt.receivingLocationId !== locationId) return false;
      if (!query) return true;
      return [
        receipt.grnNumber,
        receipt.poNumber,
        receipt.supplierName,
        receipt.receivingLocationName,
        ...receipt.items.flatMap((item) => [item.productName, item.variantName ?? '', item.sku]),
      ].some((value) => value.toLowerCase().includes(query));
    });
  });

  readonly receiptsThisMonth = computed(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return this.receipts().filter((receipt) => receipt.receivedDate.slice(0, 7) === currentMonth)
      .length;
  });

  readonly totalUnitsReceived = computed(() =>
    this.receipts().reduce((total, receipt) => total + this.unitCount(receipt), 0),
  );

  readonly distinctPurchaseOrders = computed(
    () => new Set(this.receipts().map((receipt) => receipt.purchaseOrderId)).size,
  );

  setSearchTerm(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  setLocationFilter(event: Event): void {
    this.locationFilter.set((event.target as HTMLSelectElement).value);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.locationFilter.set('all');
  }

  viewReceipt(receiptId: GoodsReceipt['id']): void {
    void this.router.navigate(['/store-admin/purchasing/goods-receipts', receiptId]);
  }

  viewPurchaseOrder(purchaseOrderId: GoodsReceipt['purchaseOrderId']): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders', purchaseOrderId]);
  }

  viewPurchaseOrders(): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
  }

  unitCount(receipt: GoodsReceipt): number {
    return receipt.items.reduce((total, item) => total + item.receivedNowQuantity, 0);
  }

  locationTypeLabel(type: InventoryLocationType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }
}
