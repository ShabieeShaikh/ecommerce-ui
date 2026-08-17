import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { BranchManagerRecord, BranchService } from '../../../services/branch.service';
import { StoreService } from '../../../services/store.service';

@Component({
  selector: 'app-manager-listing',
  imports: [],
  templateUrl: './manager-listing.html',
  styleUrl: './manager-listing.css'
})
export class ManagerListing {
  private readonly branchService = inject(BranchService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly selectedStore = this.storeService.selectedStore;
  readonly searchQuery = signal('');
  readonly managers = computed<BranchManagerRecord[]>(() => this.branchService.getManagersByStore(this.selectedStore().id));
  readonly filteredManagers = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.managers();
    return this.managers().filter(manager =>
      manager.name.toLowerCase().includes(query)
      || manager.email.toLowerCase().includes(query)
      || manager.phone.toLowerCase().includes(query)
      || manager.branches.some(branch => branch.name.toLowerCase().includes(query) || branch.city.toLowerCase().includes(query))
    );
  });
  readonly stats = computed(() => {
    const managers = this.managers();
    const assignedBranches = managers.reduce((total, manager) => total + manager.branches.length, 0);
    const activeAssignments = managers.reduce(
      (total, manager) => total + manager.branches.filter(branch => branch.status === 'active').length,
      0
    );
    const withEmail = managers.filter(manager => manager.email).length;
    return [
      { label: 'Total Managers', value: managers.length, helper: `For ${this.selectedStore().name}`, tone: 'purple' },
      { label: 'Assigned Branches', value: assignedBranches, helper: 'All manager assignments', tone: 'blue' },
      { label: 'Active Assignments', value: activeAssignments, helper: 'Branches currently active', tone: 'green' },
      { label: 'Email Contacts', value: withEmail, helper: 'Managers with email', tone: 'orange' }
    ];
  });

  constructor() {
    effect(() => {
      this.selectedStore();
      this.searchQuery.set('');
    });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  editManager(manager: BranchManagerRecord): void {
    const branch = manager.branches[0];
    if (branch) this.router.navigate(['/store-admin/branches', branch.id, 'edit']);
  }

  openCreateBranch(): void {
    this.router.navigate(['/store-admin/branches/create']);
  }

  initials(name: string): string {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('');
  }

  branchNames(manager: BranchManagerRecord): string {
    return manager.branches.map(branch => branch.name).join(', ');
  }

  locations(manager: BranchManagerRecord): string {
    return [...new Set(manager.branches.map(branch => `${branch.city}, ${branch.country}`))].join(' / ');
  }

  activeAssignments(manager: BranchManagerRecord): number {
    return manager.branches.filter(branch => branch.status === 'active').length;
  }
}
