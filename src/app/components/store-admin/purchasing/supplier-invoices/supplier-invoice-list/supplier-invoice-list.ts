import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { StoreService } from '../../../../../services/store.service';
import { SupplierInvoiceService } from '../../../../../services/supplier-invoice.service';
import {
  SupplierInvoice,
  SupplierInvoiceMatchStatus,
  SupplierInvoiceStatus,
} from '../models/supplier-invoice.model';

@Component({
  selector: 'app-supplier-invoice-list',
  standalone: true,
  imports: [CurrencyPipe, DatePipe],
  templateUrl: './supplier-invoice-list.html',
  styleUrl: './supplier-invoice-list.css',
})
export class SupplierInvoiceList {
  private readonly invoiceService = inject(SupplierInvoiceService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);

  readonly searchTerm = signal('');
  readonly statusFilter = signal<'all' | SupplierInvoiceStatus>('all');
  readonly matchFilter = signal<'all' | SupplierInvoiceMatchStatus>('all');
  readonly supplierFilter = signal('all');

  readonly invoices = computed(() =>
    this.invoiceService.getSupplierInvoicesByStore(this.storeService.selectedStoreId()),
  );
  readonly suppliers = computed(() => {
    const suppliers = new Map<number, string>();
    this.invoices().forEach((invoice) => suppliers.set(invoice.supplierId, invoice.supplierName));
    return [...suppliers.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  });
  readonly filteredInvoices = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    return this.invoices().filter((invoice) => {
      if (this.statusFilter() !== 'all' && invoice.status !== this.statusFilter()) return false;
      if (this.matchFilter() !== 'all' && invoice.matchStatus !== this.matchFilter()) return false;
      if (this.supplierFilter() !== 'all' && String(invoice.supplierId) !== this.supplierFilter()) {
        return false;
      }
      return !query || [invoice.invoiceNumber, invoice.poNumber, invoice.supplierName]
        .some((value) => value.toLowerCase().includes(query));
    });
  });
  readonly draftCount = computed(() => this.invoices().filter((item) => item.status === 'draft').length);
  readonly pendingCount = computed(() =>
    this.invoices().filter((item) => item.status === 'pending_review').length,
  );
  readonly paidCount = computed(() => this.invoices().filter((item) => item.status === 'paid').length);
  readonly outstandingBalance = computed(() =>
    this.invoices()
      .filter((item) => item.status !== 'cancelled')
      .reduce((total, item) => total + item.balanceAmount, 0),
  );

  setSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); }
  setStatus(event: Event): void {
    this.statusFilter.set((event.target as HTMLSelectElement).value as 'all' | SupplierInvoiceStatus);
  }
  setMatch(event: Event): void {
    this.matchFilter.set((event.target as HTMLSelectElement).value as 'all' | SupplierInvoiceMatchStatus);
  }
  setSupplier(event: Event): void { this.supplierFilter.set((event.target as HTMLSelectElement).value); }
  clearFilters(): void {
    this.searchTerm.set(''); this.statusFilter.set('all'); this.matchFilter.set('all'); this.supplierFilter.set('all');
  }
  createInvoice(): void { void this.router.navigate(['/store-admin/purchasing/supplier-invoices/add']); }
  viewInvoice(id: string): void { void this.router.navigate(['/store-admin/purchasing/supplier-invoices', id]); }
  editInvoice(id: string): void { void this.router.navigate(['/store-admin/purchasing/supplier-invoices', id, 'edit']); }
  statusLabel(status: SupplierInvoiceStatus): string { return status.split('_').map(this.capitalize).join(' '); }
  matchLabel(status: SupplierInvoiceMatchStatus): string { return status.split('_').map(this.capitalize).join(' '); }
  private capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
  trackInvoice(_index: number, invoice: SupplierInvoice): string { return invoice.id; }
}
