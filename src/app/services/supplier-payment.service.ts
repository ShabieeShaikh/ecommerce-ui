import { Injectable, inject, signal } from '@angular/core';

import {
  CreateSupplierPaymentRequest,
  SupplierPayment,
  SupplierPaymentMethod,
} from '../components/store-admin/purchasing/supplier-payments/models/supplier-payment.model';
import { LocalStorageService } from './local-storage.service';
import { StoreService } from './store.service';
import { SupplierInvoiceService } from './supplier-invoice.service';

const SUPPLIER_PAYMENTS_STORAGE_KEY = 'digishop_supplier_payments_v1';

@Injectable({ providedIn: 'root' })
export class SupplierPaymentService {
  private readonly storage = inject(LocalStorageService);
  private readonly invoiceService = inject(SupplierInvoiceService);
  private readonly storeService = inject(StoreService);
  private readonly paymentsState = signal<SupplierPayment[]>(this.loadPayments());

  readonly payments = this.paymentsState.asReadonly();

  getSupplierPaymentsByStore(storeId: string): SupplierPayment[] {
    return this.newestFirst(this.paymentsState().filter((payment) => payment.storeId === storeId));
  }

  getSupplierPaymentById(id: string): SupplierPayment | undefined {
    return this.paymentsState().find((payment) => payment.id === id);
  }

  getSupplierPaymentsBySupplier(supplierId: number): SupplierPayment[] {
    return this.newestFirst(
      this.paymentsState().filter((payment) => payment.supplierId === supplierId),
    );
  }

  getSupplierPaymentsByInvoice(invoiceId: string): SupplierPayment[] {
    return this.newestFirst(
      this.paymentsState().filter((payment) => payment.supplierInvoiceId === invoiceId),
    );
  }

  recordPayment(request: CreateSupplierPaymentRequest): SupplierPayment {
    const invoice = this.requirePayableInvoice(request.supplierInvoiceId);
    const paymentDate = this.requireDate(request.paymentDate);
    const amount = this.requireAmount(request.amount, invoice.balanceAmount);
    const paymentMethod = this.requirePaymentMethod(request.paymentMethod);
    const timestamp = new Date().toISOString();
    const payment: SupplierPayment = {
      id: this.createId('supplier-payment'),
      paymentNumber: this.createPaymentNumber(timestamp),
      storeId: invoice.storeId,
      supplierId: invoice.supplierId,
      supplierName: invoice.supplierName,
      supplierInvoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      paymentDate,
      amount,
      paymentMethod,
      referenceNumber: this.optionalText(request.referenceNumber),
      notes: this.optionalText(request.notes),
      createdAt: timestamp,
    };

    const previousPayments = this.paymentsState();
    this.commit([payment, ...previousPayments]);
    try {
      this.invoiceService.applySupplierPayment(invoice.id, amount);
    } catch (error) {
      this.rollbackPayments(previousPayments);
      throw error;
    }
    return payment;
  }

  private requirePayableInvoice(id: string) {
    const invoice = this.invoiceService.getSupplierInvoiceById(id.trim());
    if (!invoice) throw new Error('Supplier invoice not found.');
    if (invoice.storeId !== this.storeService.selectedStoreId()) {
      throw new Error('Supplier invoice does not belong to the selected store.');
    }
    if (invoice.status !== 'approved' && invoice.status !== 'partially_paid') {
      throw new Error('Payments can only be recorded for approved or partially paid invoices.');
    }
    if (invoice.matchStatus !== 'matched') {
      throw new Error('Supplier invoice must have a matched three-way check before payment.');
    }
    if (this.moneyInCents(invoice.balanceAmount) <= 0) {
      throw new Error('Supplier invoice has no outstanding balance.');
    }
    return invoice;
  }

  private requireAmount(value: number, balance: number): number {
    if (!Number.isFinite(value) || value <= 0 || this.moneyInCents(value) <= 0) {
      throw new Error('Payment amount must be greater than zero.');
    }
    const amount = this.roundMoney(value);
    if (this.moneyInCents(amount) > this.moneyInCents(balance)) {
      throw new Error('Payment amount cannot exceed the outstanding invoice balance.');
    }
    return amount;
  }

  private requireDate(value: string): string {
    const paymentDate = value.trim();
    if (!paymentDate || Number.isNaN(Date.parse(paymentDate))) {
      throw new Error('Payment date is invalid.');
    }
    return paymentDate;
  }

  private requirePaymentMethod(value: SupplierPaymentMethod): SupplierPaymentMethod {
    if (!['cash', 'bank_transfer', 'cheque', 'other'].includes(value)) {
      throw new Error('Payment method is invalid.');
    }
    return value;
  }

  private createPaymentNumber(timestamp: string): string {
    const date = timestamp.slice(0, 10).replace(/-/g, '');
    const expression = new RegExp(`^PAY-${date}-(\\d+)$`);
    const existingNumbers = new Set(this.paymentsState().map((payment) => payment.paymentNumber));
    let sequence = this.paymentsState().reduce((highest, payment) => {
      const match = expression.exec(payment.paymentNumber);
      const value = match ? Number(match[1]) : 0;
      return Number.isFinite(value) ? Math.max(highest, value) : highest;
    }, 0);
    let paymentNumber: string;
    do {
      sequence += 1;
      paymentNumber = `PAY-${date}-${sequence.toString().padStart(4, '0')}`;
    } while (existingNumbers.has(paymentNumber));
    return paymentNumber;
  }

  private newestFirst(payments: SupplierPayment[]): SupplierPayment[] {
    return [...payments].sort(
      (left, right) =>
        right.paymentDate.localeCompare(left.paymentDate) ||
        right.createdAt.localeCompare(left.createdAt),
    );
  }

  private loadPayments(): SupplierPayment[] {
    try {
      const stored = this.storage.getItem<unknown>(SUPPLIER_PAYMENTS_STORAGE_KEY);
      return Array.isArray(stored) && stored.every((payment) => this.isSupplierPayment(payment))
        ? stored.map((payment) => ({ ...payment, amount: this.roundMoney(payment.amount) }))
        : [];
    } catch {
      return [];
    }
  }

  private commit(payments: SupplierPayment[]): void {
    const previous = this.paymentsState();
    this.paymentsState.set(payments);
    try {
      this.storage.setItem(SUPPLIER_PAYMENTS_STORAGE_KEY, payments);
    } catch (error) {
      this.paymentsState.set(previous);
      throw error;
    }
  }

  private rollbackPayments(payments: SupplierPayment[]): void {
    this.paymentsState.set(payments);
    try {
      this.storage.setItem(SUPPLIER_PAYMENTS_STORAGE_KEY, payments);
    } catch {
      throw new Error('Payment failed and payment-history rollback could not be persisted.');
    }
  }

  private isSupplierPayment(value: unknown): value is SupplierPayment {
    if (!this.isRecord(value)) return false;
    return (
      typeof value['id'] === 'string' &&
      typeof value['paymentNumber'] === 'string' &&
      typeof value['storeId'] === 'string' &&
      typeof value['supplierId'] === 'number' && Number.isFinite(value['supplierId']) &&
      typeof value['supplierName'] === 'string' &&
      typeof value['supplierInvoiceId'] === 'string' &&
      typeof value['invoiceNumber'] === 'string' &&
      this.isDate(value['paymentDate']) &&
      this.isPositiveMoney(value['amount']) &&
      this.isPaymentMethod(value['paymentMethod']) &&
      (value['referenceNumber'] === undefined || typeof value['referenceNumber'] === 'string') &&
      (value['notes'] === undefined || typeof value['notes'] === 'string') &&
      this.isDate(value['createdAt'])
    );
  }

  private isPaymentMethod(value: unknown): value is SupplierPaymentMethod {
    return value === 'cash' || value === 'bank_transfer' || value === 'cheque' || value === 'other';
  }
  private isDate(value: unknown): boolean { return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value)); }
  private isPositiveMoney(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
  private isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
  private optionalText(value: string | undefined): string | undefined { return value?.trim() || undefined; }
  private moneyInCents(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
  private roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}-${crypto.randomUUID()}`;
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }
}
