import { Component, signal, computed, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { StoreService, Store } from '../../../services/store.service';

export interface Pagination {
  page: number; pageSize: number; total: number; totalPages: number;
}

@Component({
  selector: 'app-store-listing',
  imports: [RouterLink],
  templateUrl: './store-listing.html',
  styleUrl: './store-listing.css'
})
export class StoreListing {
  readonly storeService = inject(StoreService);
  readonly router = inject(Router);

  viewMode = signal<'table' | 'card'>('table');
  isLoading = signal(false);
  hasError  = signal(false);

  // Filter signals
  searchQuery   = signal('');
  selectedStatus = signal('');
  selectedCategory = signal('');
  sortBy         = signal('created_desc');

  // Filtered stores computed
  filteredStores = computed(() => {
    let list = [...this.storeService.stores()];

    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(s =>
        s.name.toLowerCase().includes(query) ||
        s.category.toLowerCase().includes(query) ||
        s.owner.toLowerCase().includes(query) ||
        s.city.toLowerCase().includes(query)
      );
    }

    const status = this.selectedStatus();
    if (status) {
      list = list.filter(s => s.status === status);
    }

    const category = this.selectedCategory();
    if (category) {
      list = list.filter(s => s.category === category);
    }

    const sort = this.sortBy();
    if (sort === 'revenue_desc') {
      list.sort((a, b) => b.revenue - a.revenue);
    } else if (sort === 'orders_desc') {
      list.sort((a, b) => b.orders - a.orders);
    } else if (sort === 'rating_desc') {
      list.sort((a, b) => b.rating - a.rating);
    }

    return list;
  });

  pagination = computed<Pagination>(() => ({
    page: 1,
    pageSize: 10,
    total: this.filteredStores().length,
    totalPages: Math.max(1, Math.ceil(this.filteredStores().length / 10))
  }));

  pageNumbers = computed(() => Array.from({ length: this.pagination().totalPages }, (_, i) => i + 1));

  setView(mode: 'table' | 'card') { this.viewMode.set(mode); }

  onSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
  }

  onStatusFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedStatus.set(val);
  }

  onCategoryFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.selectedCategory.set(val);
  }

  onSortChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.sortBy.set(val);
  }

  // Action handlers
  onToggleStatus(id: string, event: Event): void {
    event.stopPropagation();
    this.storeService.toggleStoreStatus(id);
  }

  onDeleteStore(id: string, name: string, event: Event): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      this.storeService.deleteStore(id);
    }
  }

  onViewStore(id: string): void {
    this.storeService.showToast(`Opening preview for store ID ${id}`, 'info');
  }

  onEditStore(id: string): void {
    this.storeService.showToast(`Edit panel opened for store ID ${id}`, 'info');
  }

  onAnalytics(id: string): void {
    this.router.navigate(['/store-admin/analytics']);
  }

  onLocation(id: string): void {
    this.router.navigate(['/store-admin/locations']);
  }

  formatRevenue(n: number): string {
    if (n === 0) return '–';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n}`;
  }
  formatNum(n: number): string {
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  }
  capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
}
