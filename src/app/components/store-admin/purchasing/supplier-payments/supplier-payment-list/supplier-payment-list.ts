import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { StoreService } from '../../../../../services/store.service';
import { SupplierPaymentService } from '../../../../../services/supplier-payment.service';
import { SupplierPaymentMethod } from '../models/supplier-payment.model';

@Component({
  selector: 'app-supplier-payment-list', standalone: true, imports: [CurrencyPipe, DatePipe],
  templateUrl: './supplier-payment-list.html', styleUrl: './supplier-payment-list.css',
})
export class SupplierPaymentList {
  private readonly paymentService = inject(SupplierPaymentService);
  private readonly storeService = inject(StoreService);
  private readonly router = inject(Router);
  readonly searchTerm = signal('');
  readonly methodFilter = signal<'all' | SupplierPaymentMethod>('all');
  readonly supplierFilter = signal('all');
  readonly payments = computed(() => this.paymentService.getSupplierPaymentsByStore(this.storeService.selectedStoreId()));
  readonly suppliers = computed(() => {
    const values = new Map<number, string>();
    this.payments().forEach((payment) => values.set(payment.supplierId, payment.supplierName));
    return [...values.entries()].sort((left, right) => left[1].localeCompare(right[1]));
  });
  readonly filteredPayments = computed(() => {
    const query = this.searchTerm().trim().toLowerCase();
    return this.payments().filter((payment) => {
      if (this.methodFilter() !== 'all' && payment.paymentMethod !== this.methodFilter()) return false;
      if (this.supplierFilter() !== 'all' && String(payment.supplierId) !== this.supplierFilter()) return false;
      return !query || [payment.paymentNumber, payment.invoiceNumber, payment.supplierName, payment.referenceNumber ?? ''].some((value) => value.toLowerCase().includes(query));
    });
  });
  readonly paymentsThisMonth = computed(() => {
    const month = new Date().toISOString().slice(0, 7);
    return this.payments().filter((payment) => payment.paymentDate.slice(0, 7) === month).length;
  });
  readonly totalAmountPaid = computed(() => this.payments().reduce((total, payment) => total + payment.amount, 0));
  readonly suppliersPaid = computed(() => new Set(this.payments().map((payment) => payment.supplierId)).size);
  setSearch(event: Event): void { this.searchTerm.set((event.target as HTMLInputElement).value); }
  setMethod(event: Event): void { this.methodFilter.set((event.target as HTMLSelectElement).value as 'all' | SupplierPaymentMethod); }
  setSupplier(event: Event): void { this.supplierFilter.set((event.target as HTMLSelectElement).value); }
  clearFilters(): void { this.searchTerm.set(''); this.methodFilter.set('all'); this.supplierFilter.set('all'); }
  methodLabel(value: SupplierPaymentMethod): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
  recordPayment(): void { void this.router.navigate(['/store-admin/purchasing/supplier-payments/add']); }
  viewPayment(id: string): void { void this.router.navigate(['/store-admin/purchasing/supplier-payments', id]); }
}
