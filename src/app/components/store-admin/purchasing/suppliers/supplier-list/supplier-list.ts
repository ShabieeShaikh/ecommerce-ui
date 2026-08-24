import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier, SupplierStatus } from '../models/supplier.model';

@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './supplier-list.html',
  styleUrl: './supplier-list.css',
})
export class SupplierList {
  private readonly supplierService = inject(SupplierService);
  private readonly router = inject(Router);
  private readonly storeService = inject(StoreService);

  readonly selectedStoreId = this.storeService.selectedStoreId;

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | SupplierStatus>('all');

  readonly suppliers = computed(() =>
    this.supplierService.getSuppliersByStore(this.selectedStoreId()),
  );

  readonly filteredSuppliers = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.suppliers().filter((supplier) => {
      const matchesSearch =
        !search ||
        supplier.name.toLowerCase().includes(search) ||
        supplier.supplierCode.toLowerCase().includes(search) ||
        supplier.contactPerson?.toLowerCase().includes(search) ||
        supplier.email?.toLowerCase().includes(search) ||
        supplier.phone.toLowerCase().includes(search);

      const matchesStatus = status === 'all' || supplier.status === status;

      return matchesSearch && matchesStatus;
    });
  });

  readonly totalSuppliers = computed(() => this.suppliers().length);

  readonly activeSuppliers = computed(
    () => this.suppliers().filter((supplier) => supplier.status === 'active').length,
  );

  readonly inactiveSuppliers = computed(
    () => this.suppliers().filter((supplier) => supplier.status === 'inactive').length,
  );

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as 'all' | SupplierStatus;

    this.statusFilter.set(value);
  }

  addSupplier(): void {
    this.router.navigate(['/store-admin/purchasing/suppliers/add']);
  }

  viewSupplier(id: number): void {
    this.router.navigate(['/store-admin/purchasing/suppliers', id]);
  }

  editSupplier(id: number): void {
    this.router.navigate(['/store-admin/purchasing/suppliers', id, 'edit']);
  }

  async toggleSupplierStatus(supplier: Supplier): Promise<void> {
    const isDeactivating = supplier.status === 'active';
    const newStatus: SupplierStatus = isDeactivating ? 'inactive' : 'active';

    const result = await Swal.fire({
      title: isDeactivating ? 'Deactivate supplier?' : 'Activate supplier?',
      text: isDeactivating
        ? `Are you sure you want to deactivate "${supplier.name}"? The supplier will remain in your records but will be marked as inactive.`
        : `Are you sure you want to activate "${supplier.name}"?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: isDeactivating ? 'Deactivate' : 'Activate',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#6437e8',
      cancelButtonColor: '#667085',
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    this.supplierService.changeSupplierStatus(supplier.id, newStatus);

    this.storeService.showToast(
      isDeactivating ? 'Supplier deactivated successfully.' : 'Supplier activated successfully.',
      isDeactivating ? 'warning' : 'success',
    );
  }

  async deleteSupplier(supplier: Supplier): Promise<void> {
    const result = await Swal.fire({
      title: 'Delete supplier?',
      text: `Are you sure you want to permanently delete "${supplier.name}"? This action cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Delete',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#d92d20',
      cancelButtonColor: '#667085',
      reverseButtons: true,
    });

    if (!result.isConfirmed) {
      return;
    }

    if (this.supplierService.deleteSupplier(supplier.id)) {
      this.storeService.showToast('Supplier deleted successfully.', 'danger');
    }
  }
}
