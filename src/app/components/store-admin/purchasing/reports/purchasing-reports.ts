import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import type {
  PurchasingReportFilters,
  PurchasingReportPreset,
} from './models/purchasing-report.model';
import type { PurchaseOrderStatus } from '../purchase-orders/models/purchase-order.model';
import type { SupplierInvoiceStatus } from '../supplier-invoices/models/supplier-invoice.model';
import { PurchasingReportService } from '../../../../services/purchasing-report.service';
import { StoreService } from '../../../../services/store.service';

type ReportTab =
  | 'overview'
  | 'purchase_orders'
  | 'receiving'
  | 'suppliers'
  | 'invoices'
  | 'payments'
  | 'returns';

interface ReportFilterState {
  preset: PurchasingReportPreset;
  fromDate: string;
  toDate: string;
  supplierId: number | null;
  purchaseOrderStatus: PurchaseOrderStatus | 'all';
  invoiceStatus: SupplierInvoiceStatus | 'all';
}

@Component({
  selector: 'app-purchasing-reports',
  standalone: true,
  imports: [RouterLink, DatePipe, DecimalPipe],
  templateUrl: './purchasing-reports.html',
  styleUrl: './purchasing-reports.css',
})
export class PurchasingReports {
  private readonly storeService = inject(StoreService);
  private readonly reportService = inject(PurchasingReportService);
  private readonly currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });

  readonly selectedStore = this.storeService.selectedStore;
  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly activeTab = signal<ReportTab>('overview');
  readonly filters = signal<ReportFilterState>(this.defaultFilters());
  readonly suppliers = computed(() =>
    this.reportService.suppliersForStore(this.selectedStoreId()).sort((a, b) => a.name.localeCompare(b.name)),
  );
  readonly invalidDateRange = computed(() => {
    const filters = this.filters();
    return Boolean(filters.fromDate && filters.toDate && filters.fromDate > filters.toDate);
  });
  readonly report = computed(() => {
    const state = this.filters();
    const filters: PurchasingReportFilters = {
      storeId: this.selectedStoreId(),
      fromDate: this.invalidDateRange() ? undefined : state.fromDate,
      toDate: this.invalidDateRange() ? undefined : state.toDate,
      supplierId: state.supplierId,
      purchaseOrderStatus: state.purchaseOrderStatus,
      invoiceStatus: state.invoiceStatus,
    };
    return this.reportService.buildReport(filters);
  });

  readonly tabs: readonly { key: ReportTab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'purchase_orders', label: 'Purchase Orders' },
    { key: 'receiving', label: 'Receiving' },
    { key: 'suppliers', label: 'Suppliers' },
    { key: 'invoices', label: 'Invoices & Payables' },
    { key: 'payments', label: 'Payments' },
    { key: 'returns', label: 'Returns' },
  ];

  private readonly storeFilterEffect = effect(() => {
    const supplierIds = new Set(this.suppliers().map((supplier) => supplier.id));
    const selectedSupplierId = this.filters().supplierId;
    if (selectedSupplierId !== null && !supplierIds.has(selectedSupplierId)) {
      this.filters.update((filters) => ({ ...filters, supplierId: null }));
    }
  });

  setTab(tab: ReportTab): void {
    this.activeTab.set(tab);
  }

  setPreset(event: Event): void {
    const preset = this.selectValue(event) as PurchasingReportPreset;
    const range = this.rangeForPreset(preset);
    this.filters.update((filters) => ({ ...filters, preset, ...range }));
  }

  setSupplier(event: Event): void {
    const value = this.selectValue(event);
    this.filters.update((filters) => ({
      ...filters,
      supplierId: value ? Number(value) : null,
    }));
  }

  setPurchaseOrderStatus(event: Event): void {
    const purchaseOrderStatus = this.selectValue(event) as PurchaseOrderStatus | 'all';
    this.filters.update((filters) => ({ ...filters, purchaseOrderStatus }));
  }

  setInvoiceStatus(event: Event): void {
    const invoiceStatus = this.selectValue(event) as SupplierInvoiceStatus | 'all';
    this.filters.update((filters) => ({ ...filters, invoiceStatus }));
  }

  setFromDate(event: Event): void {
    this.filters.update((filters) => ({
      ...filters,
      preset: 'custom',
      fromDate: this.inputValue(event),
    }));
  }

  setToDate(event: Event): void {
    this.filters.update((filters) => ({
      ...filters,
      preset: 'custom',
      toDate: this.inputValue(event),
    }));
  }

  resetFilters(): void {
    this.filters.set(this.defaultFilters());
  }

  formatCurrency(value: number): string {
    return this.currencyFormatter.format(value);
  }

  formatLabel(value: string): string {
    return value.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  chartWidth(value: number, points: readonly { value: number }[]): number {
    const maximum = Math.max(...points.map((point) => point.value), 0);
    return maximum > 0 ? Math.max(3, (value / maximum) * 100) : 0;
  }

  private defaultFilters(): ReportFilterState {
    return {
      preset: 'this_month',
      ...this.rangeForPreset('this_month'),
      supplierId: null,
      purchaseOrderStatus: 'all',
      invoiceStatus: 'all',
    };
  }

  private rangeForPreset(preset: PurchasingReportPreset): { fromDate: string; toDate: string } {
    const today = new Date();
    const toDate = this.localDate(today);
    if (preset === 'custom') {
      const current = this.filters();
      return { fromDate: current.fromDate, toDate: current.toDate };
    }
    if (preset === 'last_7_days' || preset === 'last_30_days') {
      const from = new Date(today);
      from.setDate(today.getDate() - (preset === 'last_7_days' ? 6 : 29));
      return { fromDate: this.localDate(from), toDate };
    }
    if (preset === 'this_year') {
      return { fromDate: `${today.getFullYear()}-01-01`, toDate };
    }
    if (preset === 'last_month') {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { fromDate: this.localDate(from), toDate: this.localDate(to) };
    }
    return {
      fromDate: this.localDate(new Date(today.getFullYear(), today.getMonth(), 1)),
      toDate,
    };
  }

  private selectValue(event: Event): string {
    return event.target instanceof HTMLSelectElement ? event.target.value : '';
  }

  private inputValue(event: Event): string {
    return event.target instanceof HTMLInputElement ? event.target.value : '';
  }

  private localDate(date: Date): string {
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
