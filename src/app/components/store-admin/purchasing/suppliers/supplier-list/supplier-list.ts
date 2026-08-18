import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier, SupplierStatus } from '../models/supplier.model';


@Component({
  selector: 'app-supplier-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './supplier-list.html',
  styleUrl: './supplier-list.css'
})
export class SupplierList {

  private readonly supplierService = inject(SupplierService);
  private readonly router = inject(Router);
  private readonly storeService = inject(StoreService);

  readonly selectedStoreId = this.storeService.selectedStoreId;


  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | SupplierStatus>('all');

  readonly suppliers = computed(() =>
    this.supplierService.getSuppliersByStore(this.selectedStoreId())
  );

  readonly filteredSuppliers = computed(() => {
    const search = this.searchTerm().trim().toLowerCase();
    const status = this.statusFilter();

    return this.suppliers().filter(supplier => {

      const matchesSearch =
        !search ||
        supplier.name.toLowerCase().includes(search) ||
        supplier.supplierCode.toLowerCase().includes(search) ||
        supplier.contactPerson?.toLowerCase().includes(search) ||
        supplier.email?.toLowerCase().includes(search) ||
        supplier.phone.toLowerCase().includes(search);

      const matchesStatus =
        status === 'all' ||
        supplier.status === status;

      return matchesSearch && matchesStatus;
    });
  });

  readonly totalSuppliers = computed(() => this.suppliers().length);

  readonly activeSuppliers = computed(() =>
    this.suppliers().filter(
      supplier => supplier.status === 'active'
    ).length
  );

  readonly inactiveSuppliers = computed(() =>
    this.suppliers().filter(
      supplier => supplier.status === 'inactive'
    ).length
  );

  onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
  }

  onStatusChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value as
      | 'all'
      | SupplierStatus;

    this.statusFilter.set(value);
  }

  addSupplier(): void {
    this.router.navigate(['/store-admin/purchasing/suppliers/add']);
  }

  viewSupplier(id: number): void {
    this.router.navigate([
      '/store-admin/purchasing/suppliers',
      id
    ]);
  }

  editSupplier(id: number): void {
    this.router.navigate([
      '/store-admin/purchasing/suppliers',
      id,
      'edit'
    ]);
  }

  toggleSupplierStatus(supplier: Supplier): void {
    const newStatus: SupplierStatus =
      supplier.status === 'active'
        ? 'inactive'
        : 'active';

    this.supplierService.changeSupplierStatus(
      supplier.id,
      newStatus
    );
  }
}