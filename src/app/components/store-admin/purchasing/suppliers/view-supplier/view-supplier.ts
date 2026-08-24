import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier, SupplierStatus } from '../models/supplier.model';

@Component({
  selector: 'app-view-supplier',
  imports: [DatePipe],
  templateUrl: './view-supplier.html',
  styleUrl: './view-supplier.css'
})
export class ViewSupplier {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supplierService = inject(SupplierService);
  private readonly storeService = inject(StoreService);

  readonly supplierId = this.parseSupplierId(
    this.route.snapshot.paramMap.get('id')
  );

  readonly supplier = computed<Supplier | undefined>(() => {
    if (this.supplierId === null) return undefined;

    const supplier = this.supplierService.getSupplierById(this.supplierId);
    return supplier?.storeId === this.storeService.selectedStoreId()
      ? supplier
      : undefined;
  });

  readonly supplierInitial = computed(() =>
    this.supplier()?.name.trim().charAt(0).toUpperCase() || 'S'
  );

  backToSuppliers(): void {
    void this.router.navigate(['/store-admin/purchasing/suppliers']);
  }

  displayValue(value: string | undefined): string {
    return value?.trim() || '—';
  }

  statusLabel(status: SupplierStatus): string {
    return status === 'active' ? 'Active' : 'Inactive';
  }

  private parseSupplierId(value: string | null): number | null {
    if (value === null || value.trim() === '') return null;

    const id = Number(value);
    return Number.isSafeInteger(id) && id >= 0 ? id : null;
  }
}
