import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { StoreService, Store } from '../../../services/store.service';
import { InventoryService } from '../../../services/inventory.service';

@Component({
  selector: 'app-store-listing',
  imports: [],
  templateUrl: './store-listing.html',
  styleUrl: './store-listing.css'
})
export class StoreListing {
  readonly storeService = inject(StoreService);
  private readonly router = inject(Router);
  private readonly inventoryService = inject(InventoryService);

  readonly stores = this.storeService.stores;
  readonly searchQuery = signal('');

  readonly filteredStores = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.stores();
    }

    return this.stores().filter(store =>
      store.name.toLowerCase().includes(query) ||
      store.email.toLowerCase().includes(query) ||
      store.owner.toLowerCase().includes(query) ||
      store.city.toLowerCase().includes(query) ||
      store.country.toLowerCase().includes(query)
    );
  });

  readonly stats = computed(() => {
    const stores = this.stores();
    const total = stores.length;
    const active = stores.filter(store => store.status === 'active').length;
    const inactive = stores.filter(store => store.status === 'disabled').length;
    const draft = stores.filter(store => store.status === 'pending').length;

    return [
      { label: 'Total Stores', value: total, helper: 'All Locations', tone: 'purple', icon: 'store' },
      { label: 'Active Stores', value: active, helper: `${this.percent(active, total)}% of total`, tone: 'green', icon: 'active' },
      { label: 'Inactive Stores', value: inactive, helper: `${this.percent(inactive, total)}% of total`, tone: 'orange', icon: 'inactive' },
      { label: 'Draft Stores', value: draft, helper: `${this.percent(draft, total)}% of total`, tone: 'violet', icon: 'draft' }
    ];
  });

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreatePanel(): void {
    this.router.navigate(['/store-admin/stores/create']);
  }

  openDetails(store: Store): void {
    this.storeService.changeSelectedStore(store.id, false);
    this.router.navigate(['/store-admin/stores', store.id]);
  }

  openEditPanel(store: Store): void {
    this.router.navigate(['/store-admin/stores', store.id, 'edit']);
  }

  deleteStore(store: Store, event?: Event): void {
    event?.stopPropagation();
    if (confirm(`Are you sure you want to delete "${store.name}"?`)) {
      try {
        this.inventoryService.deleteStore(store.id);
      } catch (error) {
        this.storeService.showToast(error instanceof Error ? error.message : 'The store could not be deleted.', 'warning');
      }
    }
  }

  locationValue(store: Store | undefined): string {
    return store ? `${store.city}, ${store.country === 'United States' ? 'USA' : store.country}` : '';
  }

  statusLabel(status: Store['status']): string {
    if (status === 'disabled') return 'Inactive';
    if (status === 'pending') return 'Draft';
    return 'Active';
  }

  logoUrl(store: Store): string {
    return this.storeService.resolveMediaUrl(store.logoUrl);
  }

  private percent(value: number, total: number): number {
    return total ? Math.round((value / total) * 100) : 0;
  }
}
