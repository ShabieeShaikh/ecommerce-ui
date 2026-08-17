import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Branch } from '../../../models/admin.models';
import { BranchService } from '../../../services/branch.service';
import { InventoryService } from '../../../services/inventory.service';
import { StoreService } from '../../../services/store.service';

type BranchFilter = 'all' | Branch['status'];

@Component({
  selector: 'app-branch-listing',
  imports: [],
  templateUrl: './branch-listing.html',
  styleUrl: './branch-listing.css'
})
export class BranchListing {
  private readonly branchService = inject(BranchService);
  private readonly inventoryService = inject(InventoryService);
  readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly selectedStore = this.storeService.selectedStore;
  readonly searchQuery = signal('');
  readonly statusFilter = signal<BranchFilter>('all');
  readonly currentPage = signal(1);
  readonly pageSize = 5;
  readonly selectedBranchId = signal<string | null>(null);

  readonly storeBranches = computed(() => {
    const storeId = this.selectedStore().id;
    return this.branchService.branches().filter(branch => branch.storeId === storeId);
  });

  readonly filteredBranches = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.statusFilter();
    return this.storeBranches().filter(branch => {
      const matchesStatus = status === 'all' || branch.status === status;
      const matchesQuery = !query || [branch.name, branch.code, branch.city, branch.state, branch.managerName]
        .some(value => value.toLowerCase().includes(query));
      return matchesStatus && matchesQuery;
    });
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filteredBranches().length / this.pageSize)));
  readonly visibleBranches = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.filteredBranches().slice(start, start + this.pageSize);
  });

  readonly selectedBranch = computed(() => {
    const id = this.selectedBranchId();
    return id ? this.branchService.getById(id) : undefined;
  });

  readonly branchInventory = computed(() => {
    const totals = new Map<string, number>();
    for (const balance of this.inventoryService.getBalances(this.selectedStore().id)) {
      if (balance.location.type !== 'branch' || !balance.location.entityId) continue;
      totals.set(balance.location.entityId, (totals.get(balance.location.entityId) ?? 0) + balance.quantity);
    }
    return totals;
  });

  readonly stats = computed(() => {
    const branches = this.storeBranches();
    const total = branches.length;
    const active = branches.filter(branch => branch.status === 'active').length;
    const inactive = total - active;
    const inventory = branches.reduce((sum, branch) => sum + this.inventoryForBranch(branch), 0);
    return [
      { label: 'Total Branches', value: total.toLocaleString(), helper: 'All locations', tone: 'purple', icon: 'store' },
      { label: 'Active Branches', value: active.toLocaleString(), helper: `${this.percent(active, total)}% of total`, tone: 'green', icon: 'active' },
      { label: 'Inactive Branches', value: inactive.toLocaleString(), helper: `${this.percent(inactive, total)}% of total`, tone: 'orange', icon: 'inactive' },
      { label: 'Total Inventory', value: inventory.toLocaleString(), helper: 'All branches', tone: 'blue', icon: 'inventory' }
    ];
  });

  constructor() {
    effect(() => {
      this.selectedStore().id;
      this.searchQuery.set('');
      this.statusFilter.set('all');
      this.currentPage.set(1);
      this.selectedBranchId.set(null);
    });

    effect(() => {
      const maxPage = this.totalPages();
      if (this.currentPage() > maxPage) this.currentPage.set(maxPage);
    });
  }

  openCreate(): void {
    this.router.navigate(['/store-admin/branches/create']);
  }

  openEdit(branch: Branch): void {
    this.router.navigate(['/store-admin/branches', branch.id, 'edit']);
  }

  openDetails(branch: Branch): void {
    this.selectedBranchId.set(branch.id);
  }

  closeDetails(): void {
    this.selectedBranchId.set(null);
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  onStatusFilter(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as BranchFilter);
    this.currentPage.set(1);
  }

  previousPage(): void {
    if (this.currentPage() > 1) this.currentPage.update(page => page - 1);
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) this.currentPage.update(page => page + 1);
  }

  deleteBranch(branch: Branch): void {
    if (!confirm(`Delete "${branch.name}"? This action cannot be undone.`)) return;
    try {
      this.inventoryService.deleteBranch(branch.id);
      if (this.selectedBranchId() === branch.id) this.closeDetails();
      this.storeService.showToast(`Branch "${branch.name}" deleted.`, 'danger');
    } catch (error) {
      this.storeService.showToast(error instanceof Error ? error.message : 'The branch could not be deleted.', 'warning');
    }
  }

  toggleStatus(branch: Branch): void {
    const updated = this.branchService.toggleStatus(branch.id);
    if (updated) {
      this.storeService.showToast(
        `Branch "${updated.name}" is now ${updated.status}.`,
        updated.status === 'active' ? 'success' : 'warning'
      );
    }
  }

  branchInitials(branch: Branch): string {
    return branch.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase();
  }

  branchColor(branch: Branch): string {
    const colors = ['#10B981', '#F59E0B', '#7C3AED', '#06B6D4', '#EC4899', '#2563EB'];
    const total = [...branch.id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
    return colors[total % colors.length];
  }

  location(branch: Branch): string {
    return `${branch.city}, ${branch.country}`;
  }

  inventoryForBranch(branch: Branch): number {
    return this.branchInventory().get(branch.id) ?? 0;
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit', year: 'numeric' }).format(new Date(value));
  }

  formatTime(value: string): string {
    const [hours, minutes] = value.split(':').map(Number);
    const date = new Date(2000, 0, 1, hours, minutes);
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(date);
  }

  operatingHoursSummary(branch: Branch): string {
    const openDays = branch.operatingHours.filter(day => day.isOpen);
    if (!openDays.length) return 'Closed all week';
    return openDays.map(day => {
      const slots = day.timeSlots
        .map(slot => `${this.formatTime(slot.openingTime)}-${this.formatTime(slot.closingTime)}`)
        .join(', ');
      return `${day.day.slice(0, 3)}: ${slots}`;
    }).join(' | ');
  }

  openDaysSummary(branch: Branch): string {
    const openDays = branch.operatingHours.filter(day => day.isOpen).map(day => day.day);
    return openDays.length ? openDays.join(', ') : 'None';
  }

  pageStart(): number {
    return this.filteredBranches().length ? (this.currentPage() - 1) * this.pageSize + 1 : 0;
  }

  pageEnd(): number {
    return Math.min(this.currentPage() * this.pageSize, this.filteredBranches().length);
  }

  private percent(value: number, total: number): number {
    return total ? Math.round((value / total) * 100) : 0;
  }
}
