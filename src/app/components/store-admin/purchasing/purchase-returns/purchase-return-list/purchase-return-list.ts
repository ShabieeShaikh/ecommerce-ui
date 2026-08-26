import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { PurchaseReturnService } from '../../../../../services/purchase-return.service';
import { StoreService } from '../../../../../services/store.service';
import { PurchaseReturn, PurchaseReturnReason } from '../models/purchase-return.model';

@Component({
  selector: 'app-purchase-return-list',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './purchase-return-list.html',
  styleUrl: './purchase-return-list.css',
})
export class PurchaseReturnList {
  private readonly returnService = inject(PurchaseReturnService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly searchTerm = signal('');
  readonly reasonFilter = signal<'all' | PurchaseReturnReason>('all');
  readonly supplierFilter = signal('all');
  readonly locationFilter = signal('all');
  readonly returns = computed(() =>
    this.returnService.getPurchaseReturnsByStore(this.storeService.selectedStoreId()),
  );
  readonly suppliers = computed(() => this.distinctOptions('supplierId', 'supplierName'));
  readonly locations = computed(() => this.distinctOptions('returnLocationId', 'returnLocationName'));
  readonly filteredReturns = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    return this.returns().filter((item) => {
      if (this.reasonFilter() !== 'all' && item.reason !== this.reasonFilter()) return false;
      if (this.supplierFilter() !== 'all' && String(item.supplierId) !== this.supplierFilter()) return false;
      if (this.locationFilter() !== 'all' && item.returnLocationId !== this.locationFilter()) return false;
      return !query || [
        item.returnNumber, item.grnNumber, item.poNumber, item.supplierName,
        ...item.items.flatMap((line) => [line.productName, line.sku]),
      ].some((value) => value.toLowerCase().includes(query));
    });
  });
  readonly returnsThisMonth = computed(() => {
    const month = new Date().toISOString().slice(0, 7);
    return this.returns().filter((item) => item.returnDate.slice(0, 7) === month).length;
  });
  readonly unitsReturned = computed(() => this.returns().reduce((sum, item) => sum + this.totalUnits(item), 0));
  readonly suppliersAffected = computed(() => new Set(this.returns().map((item) => item.supplierId)).size);

  totalUnits(item: PurchaseReturn): number { return item.items.reduce((sum, line) => sum + line.returnNowQuantity, 0); }
  reasonLabel(value: PurchaseReturnReason): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  setSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); }
  setReason(event: Event): void { this.reasonFilter.set((event.target as HTMLSelectElement).value as 'all' | PurchaseReturnReason); }
  setSupplier(event: Event): void { this.supplierFilter.set((event.target as HTMLSelectElement).value); }
  setLocation(event: Event): void { this.locationFilter.set((event.target as HTMLSelectElement).value); }
  clearFilters(): void { this.searchTerm.set(''); this.reasonFilter.set('all'); this.supplierFilter.set('all'); this.locationFilter.set('all'); }
  createReturn(): void { void this.router.navigate(['/store-admin/purchasing/purchase-returns/add']); }
  viewReturn(id: string): void { void this.router.navigate(['/store-admin/purchasing/purchase-returns', id]); }

  private distinctOptions(idKey: 'supplierId' | 'returnLocationId', nameKey: 'supplierName' | 'returnLocationName'): Array<[string, string]> {
    const values = new Map<string, string>();
    this.returns().forEach((item) => values.set(String(item[idKey]), item[nameKey]));
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  }
}
