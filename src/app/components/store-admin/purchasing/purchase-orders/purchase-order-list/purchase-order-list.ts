import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

import { InventoryLocationType } from '../../../../../models/inventory.models';
import { PurchaseOrderService } from '../../../../../services/purchase-order.service';
import { StoreService } from '../../../../../services/store.service';
import {
  PurchaseOrder,
  PurchaseOrderStatus,
  PurchaseOrderSupplierId,
} from '../models/purchase-order.model';

type StatusFilter = 'all' | PurchaseOrderStatus;
type SupplierFilter = 'all' | PurchaseOrderSupplierId;

interface SupplierFilterOption {
  id: PurchaseOrderSupplierId;
  name: string;
}

@Component({
  selector: 'app-purchase-order-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './purchase-order-list.html',
  styleUrl: './purchase-order-list.css',
})
export class PurchaseOrderList {
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly searchTerm = signal('');
  readonly statusFilter = signal<StatusFilter>('all');
  readonly supplierFilter = signal<SupplierFilter>('all');

  readonly statusOptions: ReadonlyArray<{ value: StatusFilter; label: string }> = [
    { value: 'all', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'ordered', label: 'Ordered' },
    { value: 'partially_received', label: 'Partially Received' },
    { value: 'received', label: 'Received' },
    { value: 'cancelled', label: 'Cancelled' },
  ];

  readonly purchaseOrders = computed(() =>
    this.purchaseOrderService.getPurchaseOrdersByStore(this.selectedStoreId()),
  );

  readonly supplierOptions = computed<SupplierFilterOption[]>(() => {
    const suppliers = new Map<PurchaseOrderSupplierId, string>();
    for (const purchaseOrder of this.purchaseOrders()) {
      if (!suppliers.has(purchaseOrder.supplierId)) {
        suppliers.set(purchaseOrder.supplierId, purchaseOrder.supplierName);
      }
    }

    return Array.from(suppliers, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  });

  readonly filteredPurchaseOrders = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();
    const supplierId = this.supplierFilter();

    return this.purchaseOrders().filter((purchaseOrder) => {
      const matchesSearch =
        !search ||
        purchaseOrder.poNumber.toLowerCase().includes(search) ||
        purchaseOrder.supplierName.toLowerCase().includes(search) ||
        purchaseOrder.receivingLocationName.toLowerCase().includes(search);
      const matchesStatus = status === 'all' || purchaseOrder.status === status;
      const matchesSupplier = supplierId === 'all' || purchaseOrder.supplierId === supplierId;

      return matchesSearch && matchesStatus && matchesSupplier;
    });
  });

  readonly totalPurchaseOrders = computed(() => this.purchaseOrders().length);
  readonly draftPurchaseOrders = computed(() => this.countByStatus('draft'));
  readonly orderedPurchaseOrders = computed(() => this.countByStatus('ordered'));
  readonly partiallyReceivedPurchaseOrders = computed(() =>
    this.countByStatus('partially_received'),
  );
  readonly receivedPurchaseOrders = computed(() => this.countByStatus('received'));
  readonly cancelledPurchaseOrders = computed(() => this.countByStatus('cancelled'));

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'all' || this.isPurchaseOrderStatus(value)) {
      this.statusFilter.set(value);
    }
  }

  onSupplierChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'all') {
      this.supplierFilter.set('all');
      return;
    }

    const supplierId = Number(value);
    if (this.supplierOptions().some((supplier) => supplier.id === supplierId)) {
      this.supplierFilter.set(supplierId);
    }
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.statusFilter.set('all');
    this.supplierFilter.set('all');
  }

  createPurchaseOrder(): void {
    this.router.navigate(['/store-admin/purchasing/purchase-orders/add']);
  }

  viewPurchaseOrder(id: PurchaseOrder['id']): void {
    this.router.navigate(['/store-admin/purchasing/purchase-orders', id]);
  }

  editPurchaseOrder(id: PurchaseOrder['id']): void {
    this.router.navigate(['/store-admin/purchasing/purchase-orders', id, 'edit']);
  }

  async submitPurchaseOrder(purchaseOrder: PurchaseOrder): Promise<void> {
    if (purchaseOrder.status !== 'draft') return;

    const result = await Swal.fire({
      title: 'Submit purchase order?',
      text: `${purchaseOrder.poNumber} will be marked as Ordered. After submission, normal purchase order details can no longer be edited.`,
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
      text: `${purchaseOrder.poNumber} will be cancelled and remain available in your purchasing history.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Cancel Order',
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

  statusLabel(status: PurchaseOrderStatus): string {
    switch (status) {
      case 'partially_received':
        return 'Partially Received';
      case 'draft':
        return 'Draft';
      case 'ordered':
        return 'Ordered';
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

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  private countByStatus(status: PurchaseOrderStatus): number {
    return this.purchaseOrders().filter((purchaseOrder) => purchaseOrder.status === status).length;
  }

  private isPurchaseOrderStatus(value: string): value is PurchaseOrderStatus {
    return (
      value === 'draft' ||
      value === 'ordered' ||
      value === 'partially_received' ||
      value === 'received' ||
      value === 'cancelled'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Unable to update the purchase order.';
  }
}
