import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { StoreService } from '../../../../../services/store.service';
import { SupplierPaymentService } from '../../../../../services/supplier-payment.service';
import { SupplierPaymentMethod } from '../models/supplier-payment.model';

@Component({ selector: 'app-view-supplier-payment', standalone: true, imports: [CurrencyPipe, DatePipe], templateUrl: './view-supplier-payment.html', styleUrl: './view-supplier-payment.css' })
export class ViewSupplierPayment {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly paymentService = inject(SupplierPaymentService);
  private readonly storeService = inject(StoreService);
  readonly paymentId = this.route.snapshot.paramMap.get('id')?.trim() || null;
  readonly payment = computed(() => {
    if (!this.paymentId) return undefined;
    const payment = this.paymentService.getSupplierPaymentById(this.paymentId);
    return payment?.storeId === this.storeService.selectedStoreId() ? payment : undefined;
  });
  back(): void { void this.router.navigate(['/store-admin/purchasing/supplier-payments']); }
  viewInvoice(): void { const payment = this.payment(); if (payment) void this.router.navigate(['/store-admin/purchasing/supplier-invoices', payment.supplierInvoiceId]); }
  methodLabel(value: SupplierPaymentMethod): string { return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' '); }
}
