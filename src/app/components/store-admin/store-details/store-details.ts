import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Branch, Product, Store } from '../../../models/admin.models';
import { BranchService } from '../../../services/branch.service';
import { ProductService } from '../../../services/product.service';
import { InventoryService } from '../../../services/inventory.service';
import { StoreService } from '../../../services/store.service';

type ActivityType = 'branch' | 'product' | 'store';

interface StoreActivity {
  id: string;
  type: ActivityType;
  message: string;
  occurredAt: Date;
}

@Component({
  selector: 'app-store-details',
  imports: [RouterLink],
  templateUrl: './store-details.html',
  styleUrl: './store-details.css'
})
export class StoreDetails {
  readonly storeService = inject(StoreService);
  private readonly branchService = inject(BranchService);
  private readonly productService = inject(ProductService);
  private readonly inventoryService = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly store = this.storeService.selectedStore;
  readonly branches = computed(() => this.branchService.branches().filter(branch => branch.storeId === this.store().id));
  readonly products = computed(() => this.productService.products().filter(product => product.storeId === this.store().id));
  readonly allocatedInventory = computed(() => this.inventoryService.getTotalStock(this.store().id));
  readonly availableInventory = computed(() => Math.max(0, this.store().inventoryAllocationLimit - this.allocatedInventory()));

  readonly stats = computed(() => {
    const store = this.store();
    return [
      { label: 'Total Branches', value: this.branches().length.toLocaleString('en-US'), icon: 'branch', tone: 'purple' },
      { label: 'Total Products', value: this.products().length.toLocaleString('en-US'), icon: 'product', tone: 'blue' },
      { label: 'Total Orders', value: store.orders.toLocaleString('en-US'), icon: 'orders', tone: 'green' },
      { label: 'Store Revenue', value: this.formatCurrency(store.revenue), icon: 'revenue', tone: 'orange' }
    ];
  });

  readonly activities = computed<StoreActivity[]>(() => {
    const store = this.store();
    const activities: StoreActivity[] = [
      ...this.branches().map(branch => this.branchActivity(branch)),
      ...this.products().flatMap(product => this.productActivity(product)),
      ...this.storeActivity(store)
    ];

    return activities
      .sort((left, right) => right.occurredAt.getTime() - left.occurredAt.getTime())
      .slice(0, 6);
  });

  constructor() {
    const routeStoreId = this.route.snapshot.paramMap.get('id');
    const routeStore = routeStoreId ? this.storeService.getStoreById(routeStoreId) : undefined;

    if (!routeStore) {
      this.storeService.showToast('The selected store could not be found.', 'warning');
      void this.router.navigate(['/store-admin/stores']);
      return;
    }

    if (this.storeService.selectedStoreId() !== routeStore.id) {
      this.storeService.changeSelectedStore(routeStore.id, false);
    }

    effect(() => {
      const selectedStoreId = this.store().id;
      const currentRouteId = this.route.snapshot.paramMap.get('id');
      if (selectedStoreId !== currentRouteId) {
        void this.router.navigate(['/store-admin/stores', selectedStoreId], { replaceUrl: true });
      }
    });
  }

  editStore(): void {
    void this.router.navigate(['/store-admin/stores', this.store().id, 'edit']);
  }

  manageBranches(): void {
    this.storeService.changeSelectedStore(this.store().id, false);
    void this.router.navigate(['/store-admin/branches']);
  }

  viewProducts(): void {
    this.storeService.changeSelectedStore(this.store().id, false);
    void this.router.navigate(['/store-admin/products']);
  }

  logoUrl(store: Store): string {
    return this.storeService.resolveMediaUrl(store.logoUrl);
  }

  storeInitials(store: Store): string {
    return store.name.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase();
  }

  ownerInitials(store: Store): string {
    return store.owner.split(/\s+/).filter(Boolean).map(word => word[0]).join('').slice(0, 2).toUpperCase() || 'SO';
  }

  statusLabel(status: Store['status']): string {
    if (status === 'disabled') return 'Inactive';
    if (status === 'pending') return 'Draft';
    return 'Active';
  }

  displayStoreId(store: Store): string {
    return store.id.startsWith('store-') ? `ST-${store.id.slice(6).toUpperCase()}` : store.id.toUpperCase();
  }

  fullAddress(store: Store): string {
    return [store.address, store.city, store.state, store.postalCode, store.country].filter(Boolean).join(', ');
  }

  formatDate(value: string): string {
    const date = this.parseDate(value);
    return date
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(date)
      : value;
  }

  relativeTime(date: Date): string {
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
    if (elapsedSeconds < 60) return 'Just now';
    const minutes = Math.floor(elapsedSeconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  }

  private branchActivity(branch: Branch): StoreActivity {
    return {
      id: `branch-${branch.id}`,
      type: 'branch',
      message: `Branch "${branch.name}" was added.`,
      occurredAt: this.parseDate(branch.createdAt) ?? new Date(0)
    };
  }

  private productActivity(product: Product): StoreActivity[] {
    const createdAt = this.parseDate(product.createdAt);
    if (!createdAt) return [];
    return [{
      id: `product-${product.id}`,
      type: 'product',
      message: `Product "${product.name}" was added.`,
      occurredAt: createdAt
    }];
  }

  private storeActivity(store: Store): StoreActivity[] {
    const createdAt = this.parseDate(store.createdAt);
    if (!createdAt) return [];
    return [{
      id: `store-${store.id}`,
      type: 'store',
      message: `Store "${store.name}" was created.`,
      occurredAt: createdAt
    }];
  }

  private parseDate(value?: string): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }
}
