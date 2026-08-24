import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import Swal from 'sweetalert2';

import { InventoryLocationType } from '../../../../../models/inventory.models';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier } from '../../suppliers/models/supplier.model';
import {
  PurchaseOrder,
  PurchaseOrderItem,
  PurchaseOrderStatus,
} from '../models/purchase-order.model';

@Component({
  selector: 'app-view-purchase-order',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './view-purchase-order.html',
  styleUrl: './view-purchase-order.css',
})
export class ViewPurchaseOrder {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);
  private readonly supplierService = inject(SupplierService);

  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  readonly purchaseOrderId = this.parsePurchaseOrderId(this.route.snapshot.paramMap.get('id'));

  readonly purchaseOrder = computed<PurchaseOrder | undefined>(() => {
    if (!this.purchaseOrderId) return undefined;
    const purchaseOrder = this.purchaseOrderService.getPurchaseOrderById(this.purchaseOrderId);
    return purchaseOrder?.storeId === this.storeService.selectedStoreId()
      ? purchaseOrder
      : undefined;
  });

  readonly supplier = computed<Supplier | undefined>(() => {
    const purchaseOrder = this.purchaseOrder();
    if (!purchaseOrder) return undefined;
    const supplier = this.supplierService.getSupplierById(purchaseOrder.supplierId);
    return supplier?.storeId === purchaseOrder.storeId ? supplier : undefined;
  });

  readonly totalOrderedQuantity = computed(
    () => this.purchaseOrder()?.items.reduce((total, item) => total + item.quantity, 0) ?? 0,
  );

  readonly totalReceivedQuantity = computed(
    () =>
      this.purchaseOrder()?.items.reduce((total, item) => total + item.receivedQuantity, 0) ?? 0,
  );

  readonly totalRemainingQuantity = computed(() =>
    Math.max(0, this.totalOrderedQuantity() - this.totalReceivedQuantity()),
  );

  readonly receivingProgress = computed(() => {
    const ordered = this.totalOrderedQuantity();
    return ordered > 0 ? Math.min(100, (this.totalReceivedQuantity() / ordered) * 100) : 0;
  });

  backToPurchaseOrders(): void {
    void this.router.navigate(['/store-admin/purchasing/purchase-orders']);
  }

  editPurchaseOrder(purchaseOrder: PurchaseOrder): void {
    if (purchaseOrder.status !== 'draft') return;
    void this.router.navigate([
      '/store-admin/purchasing/purchase-orders',
      purchaseOrder.id,
      'edit',
    ]);
  }

  async submitPurchaseOrder(purchaseOrder: PurchaseOrder): Promise<void> {
    if (purchaseOrder.status !== 'draft') return;

    const result = await Swal.fire({
      title: 'Submit purchase order?',
      text: `${purchaseOrder.poNumber} will be marked as Ordered. Once submitted, normal purchase order details can no longer be edited.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Submit Order',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#6437e8',
      cancelButtonColor: '#667085',
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    try {
      const updated = this.purchaseOrderService.changePurchaseOrderStatus(
        purchaseOrder.id,
        'ordered',
      );
      if (updated) {
        this.storeService.showToast('Purchase order submitted successfully.', 'success');
      }
    } catch (error: unknown) {
      this.storeService.showToast(this.errorMessage(error), 'danger');
    }
  }

  async cancelPurchaseOrder(purchaseOrder: PurchaseOrder): Promise<void> {
    if (!this.canCancel(purchaseOrder)) return;

    const result = await Swal.fire({
      title: 'Cancel purchase order?',
      text: `Are you sure you want to cancel ${purchaseOrder.poNumber}? This purchase order will remain in history and be marked as Cancelled.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Cancel Purchase Order',
      cancelButtonText: 'Keep Order',
      confirmButtonColor: '#d92d20',
      cancelButtonColor: '#667085',
      reverseButtons: true,
    });

    if (!result.isConfirmed) return;

    try {
      const updated = this.purchaseOrderService.changePurchaseOrderStatus(
        purchaseOrder.id,
        'cancelled',
      );
      if (updated) {
        this.storeService.showToast('Purchase order cancelled.', 'warning');
      }
    } catch (error: unknown) {
      this.storeService.showToast(this.errorMessage(error), 'danger');
    }
  }

  canCancel(purchaseOrder: PurchaseOrder): boolean {
    const cancellableStatus =
      purchaseOrder.status === 'draft' || purchaseOrder.status === 'ordered';
    return cancellableStatus && purchaseOrder.items.every((item) => item.receivedQuantity === 0);
  }

  remainingQuantity(item: PurchaseOrderItem): number {
    return Math.max(0, item.quantity - item.receivedQuantity);
  }

  displayValue(value: string | undefined): string {
    return value?.trim() || '—';
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  statusLabel(status: PurchaseOrderStatus): string {
    switch (status) {
      case 'draft':
        return 'Draft';
      case 'ordered':
        return 'Ordered';
      case 'partially_received':
        return 'Partially Received';
      case 'received':
        return 'Received';
      case 'cancelled':
        return 'Cancelled';
    }
  }

  locationTypeLabel(type: InventoryLocationType): string {
    switch (type) {
      case 'store':
        return 'Store';
      case 'branch':
        return 'Branch';
      case 'warehouse':
        return 'Warehouse';
    }
  }

  private parsePurchaseOrderId(value: string | null): string | null {
    const id = value?.trim();
    return id || null;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to update the purchase order.';
  }
}
