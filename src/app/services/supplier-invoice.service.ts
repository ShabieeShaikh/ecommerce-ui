import { Injectable, inject, signal } from '@angular/core';

import {
  CreateSupplierInvoiceItemRequest,
  CreateSupplierInvoiceRequest,
  SupplierInvoice,
  SupplierInvoiceItem,
  SupplierInvoiceMatchStatus,
  SupplierInvoiceStatus,
  UpdateSupplierInvoiceRequest,
} from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import {
  PurchaseOrder,
  PurchaseOrderItem,
} from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { LocalStorageService } from './local-storage.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StoreService } from './store.service';

const SUPPLIER_INVOICES_STORAGE_KEY = 'digishop_supplier_invoices_v1';

interface SupplierInvoiceTotals {
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
}

@Injectable({ providedIn: 'root' })
export class SupplierInvoiceService {
  private readonly storage = inject(LocalStorageService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly storeService = inject(StoreService);

  private readonly invoicesState = signal<SupplierInvoice[]>(this.loadSupplierInvoices());

  readonly invoices = this.invoicesState.asReadonly();

  getSupplierInvoicesByStore(storeId: string): SupplierInvoice[] {
    return this.newestFirst(this.invoicesState().filter((invoice) => invoice.storeId === storeId));
  }

  getSupplierInvoiceById(id: string): SupplierInvoice | undefined {
    return this.invoicesState().find((invoice) => invoice.id === id);
  }

  getSupplierInvoicesBySupplier(supplierId: number): SupplierInvoice[] {
    return this.newestFirst(
      this.invoicesState().filter((invoice) => invoice.supplierId === supplierId),
    );
  }

  getSupplierInvoicesByPurchaseOrder(purchaseOrderId: string): SupplierInvoice[] {
    return this.newestFirst(
      this.invoicesState().filter((invoice) => invoice.purchaseOrderId === purchaseOrderId),
    );
  }

  createSupplierInvoice(request: CreateSupplierInvoiceRequest): SupplierInvoice {
    const purchaseOrder = this.requireEligiblePurchaseOrder(request.purchaseOrderId);
    const invoiceNumber = this.requireUniqueInvoiceNumber(
      purchaseOrder.storeId,
      purchaseOrder.supplierId,
      request.invoiceNumber,
    );
    const invoiceDate = this.requireDate(request.invoiceDate, 'Invoice date is required.');
    const dueDate = this.validateDueDate(invoiceDate, request.dueDate);
    const items = this.buildItems(purchaseOrder, request.items);
    const totals = this.calculateTotals(items, request.taxAmount, request.discountAmount);
    const timestamp = new Date().toISOString();
    const invoice: SupplierInvoice = {
      id: this.createId('supplier-invoice'),
      storeId: purchaseOrder.storeId,
      invoiceNumber,
      supplierId: purchaseOrder.supplierId,
      supplierName: purchaseOrder.supplierName,
      purchaseOrderId: purchaseOrder.id,
      poNumber: purchaseOrder.poNumber,
      invoiceDate,
      dueDate,
      items,
      ...totals,
      paidAmount: 0,
      balanceAmount: totals.totalAmount,
      status: 'draft',
      matchStatus: 'not_checked',
      notes: this.optionalText(request.notes),
      createdAt: timestamp,
    };

    this.commit([invoice, ...this.invoicesState()]);
    return invoice;
  }

  updateSupplierInvoice(
    id: string,
    request: UpdateSupplierInvoiceRequest,
  ): SupplierInvoice | undefined {
    const existing = this.getSupplierInvoiceById(id);
    if (!existing) return undefined;
    if (existing.status !== 'draft') {
      throw new Error('Only draft supplier invoices can be edited.');
    }

    const purchaseOrder = this.requireEligiblePurchaseOrder(existing.purchaseOrderId);
    if (
      purchaseOrder.storeId !== existing.storeId ||
      purchaseOrder.supplierId !== existing.supplierId
    ) {
      throw new Error('The linked purchase order no longer matches this supplier invoice.');
    }
    const invoiceNumber = this.requireUniqueInvoiceNumber(
      existing.storeId,
      existing.supplierId,
      request.invoiceNumber,
      existing.id,
    );
    const invoiceDate = this.requireDate(request.invoiceDate, 'Invoice date is required.');
    const dueDate = this.validateDueDate(invoiceDate, request.dueDate);
    const items = this.buildItems(purchaseOrder, request.items);
    const totals = this.calculateTotals(items, request.taxAmount, request.discountAmount);
    const updated: SupplierInvoice = {
      ...existing,
      invoiceNumber,
      invoiceDate,
      dueDate,
      items,
      ...totals,
      balanceAmount: this.roundMoney(Math.max(0, totals.totalAmount - existing.paidAmount)),
      notes: this.optionalText(request.notes),
      updatedAt: new Date().toISOString(),
    };

    this.commit(
      this.invoicesState().map((invoice) => (invoice.id === existing.id ? updated : invoice)),
    );
    return updated;
  }

  submitForReview(id: string): SupplierInvoice | undefined {
    const existing = this.getSupplierInvoiceById(id);
    if (!existing) return undefined;
    if (existing.status !== 'draft') {
      throw new Error('Only a draft supplier invoice can be submitted for review.');
    }
    this.assertSelectedStore(existing.storeId);

    const updated: SupplierInvoice = {
      ...existing,
      status: 'pending_review',
      matchStatus: 'not_checked',
      matchCheckedAt: undefined,
      updatedAt: new Date().toISOString(),
    };
    this.commit(
      this.invoicesState().map((invoice) => (invoice.id === existing.id ? updated : invoice)),
    );
    return updated;
  }

  saveMatchOutcome(
    id: string,
    matchStatus: Exclude<SupplierInvoiceMatchStatus, 'not_checked'>,
    checkedAt: string,
  ): SupplierInvoice {
    const existing = this.getSupplierInvoiceById(id);
    if (!existing) throw new Error('Supplier invoice not found.');
    this.assertSelectedStore(existing.storeId);
    if (existing.status !== 'pending_review') {
      throw new Error('Only supplier invoices pending review can be matched.');
    }
    const updated: SupplierInvoice = {
      ...existing,
      matchStatus,
      matchCheckedAt: checkedAt,
      updatedAt: checkedAt,
    };
    this.commit(this.invoicesState().map((invoice) => invoice.id === id ? updated : invoice));
    return updated;
  }

  approveSupplierInvoice(id: string): SupplierInvoice {
    const existing = this.getSupplierInvoiceById(id);
    if (!existing) throw new Error('Supplier invoice not found.');
    this.assertSelectedStore(existing.storeId);
    if (existing.status !== 'pending_review') {
      throw new Error('Only supplier invoices pending review can be approved.');
    }
    if (existing.matchStatus !== 'matched') {
      throw new Error('Supplier invoice must pass three-way matching before approval.');
    }
    const updated: SupplierInvoice = {
      ...existing,
      status: 'approved',
      updatedAt: new Date().toISOString(),
    };
    this.commit(this.invoicesState().map((invoice) => invoice.id === id ? updated : invoice));
    return updated;
  }

  applySupplierPayment(id: string, requestedAmount: number): SupplierInvoice {
    const existing = this.getSupplierInvoiceById(id);
    if (!existing) throw new Error('Supplier invoice not found.');
    const selectedStoreId = this.storeService.selectedStoreId();
    if (selectedStoreId && selectedStoreId !== existing.storeId) {
      throw new Error('Supplier invoice does not belong to the selected store.');
    }
    if (existing.status !== 'approved' && existing.status !== 'partially_paid') {
      throw new Error('Payments can only be recorded for approved or partially paid invoices.');
    }
    if (existing.matchStatus !== 'matched') {
      throw new Error('Supplier invoice must have a matched three-way check before payment.');
    }
    const amount = this.positiveMoney(requestedAmount, 'Payment amount must be greater than zero.');
    if (this.moneyInCents(existing.balanceAmount) <= 0) {
      throw new Error('Supplier invoice has no outstanding balance.');
    }
    if (this.moneyInCents(amount) > this.moneyInCents(existing.balanceAmount)) {
      throw new Error('Payment amount cannot exceed the outstanding invoice balance.');
    }
    const paidAmount = this.roundMoney(existing.paidAmount + amount);
    const balanceAmount = this.roundMoney(Math.max(0, existing.totalAmount - paidAmount));
    const updated: SupplierInvoice = {
      ...existing,
      paidAmount,
      balanceAmount,
      status: this.moneyInCents(balanceAmount) === 0 ? 'paid' : 'partially_paid',
      updatedAt: new Date().toISOString(),
    };
    this.commit(this.invoicesState().map((invoice) => invoice.id === id ? updated : invoice));
    return updated;
  }

  private requireEligiblePurchaseOrder(id: string): PurchaseOrder {
    const normalizedId = id.trim();
    const purchaseOrder = normalizedId
      ? this.purchaseOrderService.getPurchaseOrderById(normalizedId)
      : undefined;
    if (!purchaseOrder) throw new Error('Purchase order not found.');
    this.assertSelectedStore(purchaseOrder.storeId);
    if (purchaseOrder.status === 'draft' || purchaseOrder.status === 'cancelled') {
      throw new Error(
        'Supplier invoices can only be created for ordered or received purchase orders.',
      );
    }
    return purchaseOrder;
  }

  private assertSelectedStore(storeId: string): void {
    const selectedStoreId = this.storeService.selectedStoreId();
    if (selectedStoreId && selectedStoreId !== storeId) {
      throw new Error('The purchase order does not belong to the selected store.');
    }
  }

  private requireUniqueInvoiceNumber(
    storeId: string,
    supplierId: number,
    value: string,
    excludeInvoiceId?: string,
  ): string {
    const invoiceNumber = value.trim();
    if (!invoiceNumber) throw new Error('Supplier invoice number is required.');
    const normalized = this.normalizeInvoiceNumber(invoiceNumber);
    const duplicate = this.invoicesState().some(
      (invoice) =>
        invoice.id !== excludeInvoiceId &&
        invoice.storeId === storeId &&
        invoice.supplierId === supplierId &&
        this.normalizeInvoiceNumber(invoice.invoiceNumber) === normalized,
    );
    if (duplicate) {
      throw new Error('This supplier invoice number already exists for the selected supplier.');
    }
    return invoiceNumber;
  }

  private buildItems(
    purchaseOrder: PurchaseOrder,
    requests: CreateSupplierInvoiceItemRequest[],
  ): SupplierInvoiceItem[] {
    if (!requests.length) throw new Error('A supplier invoice must contain at least one item.');

    const itemIds = new Set<string>();
    return requests.map((request) => {
      if (itemIds.has(request.purchaseOrderItemId)) {
        throw new Error('A purchase order item cannot be invoiced more than once per invoice.');
      }
      itemIds.add(request.purchaseOrderItemId);
      const purchaseOrderItem = purchaseOrder.items.find(
        (item) => item.id === request.purchaseOrderItemId,
      );
      if (!purchaseOrderItem) {
        throw new Error('The selected purchase order item could not be found.');
      }
      return this.buildItem(purchaseOrderItem, request);
    });
  }

  private buildItem(
    purchaseOrderItem: PurchaseOrderItem,
    request: CreateSupplierInvoiceItemRequest,
  ): SupplierInvoiceItem {
    const invoicedQuantity = this.positiveNumber(
      request.invoicedQuantity,
      'Invoiced quantity must be greater than zero.',
    );
    const unitPrice = this.nonNegativeMoney(request.unitPrice, 'Unit price cannot be negative.');
    return {
      id: this.createId('supplier-invoice-item'),
      purchaseOrderItemId: purchaseOrderItem.id,
      productId: purchaseOrderItem.productId,
      variantId: purchaseOrderItem.variantId,
      productName: purchaseOrderItem.productName,
      variantName: purchaseOrderItem.variantName,
      sku: purchaseOrderItem.sku,
      invoicedQuantity,
      unitPrice,
      lineTotal: this.roundMoney(invoicedQuantity * unitPrice),
    };
  }

  private calculateTotals(
    items: SupplierInvoiceItem[],
    requestedTaxAmount: number,
    requestedDiscountAmount: number,
  ): SupplierInvoiceTotals {
    const subtotal = this.roundMoney(items.reduce((total, item) => total + item.lineTotal, 0));
    const taxAmount = this.nonNegativeMoney(requestedTaxAmount, 'Tax amount cannot be negative.');
    const discountAmount = this.nonNegativeMoney(
      requestedDiscountAmount,
      'Discount amount cannot be negative.',
    );
    return {
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount: this.roundMoney(Math.max(0, subtotal + taxAmount - discountAmount)),
    };
  }

  private validateDueDate(invoiceDate: string, value: string | undefined): string | undefined {
    const dueDate = this.optionalText(value);
    if (!dueDate) return undefined;
    const normalized = this.requireDate(dueDate, 'Due date is invalid.');
    if (Date.parse(normalized) < Date.parse(invoiceDate)) {
      throw new Error('Due date cannot be earlier than the invoice date.');
    }
    return normalized;
  }

  private requireDate(value: string, message: string): string {
    const normalized = value.trim();
    if (!normalized || Number.isNaN(Date.parse(normalized))) throw new Error(message);
    return normalized;
  }

  private positiveNumber(value: number, message: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new Error(message);
    return value;
  }

  private nonNegativeMoney(value: number, message: string): number {
    if (!Number.isFinite(value) || value < 0) throw new Error(message);
    return this.roundMoney(value);
  }

  private positiveMoney(value: number, message: string): number {
    if (!Number.isFinite(value) || value <= 0) throw new Error(message);
    const amount = this.roundMoney(value);
    if (this.moneyInCents(amount) <= 0) throw new Error(message);
    return amount;
  }

  private moneyInCents(value: number): number {
    return Math.round((value + Number.EPSILON) * 100);
  }

  private roundMoney(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private normalizeInvoiceNumber(value: string): string {
    return value.trim().toLowerCase();
  }

  private optionalText(value: string | undefined): string | undefined {
    return value?.trim() || undefined;
  }

  private newestFirst(invoices: SupplierInvoice[]): SupplierInvoice[] {
    return [...invoices].sort(
      (left, right) =>
        right.invoiceDate.localeCompare(left.invoiceDate) ||
        right.createdAt.localeCompare(left.createdAt),
    );
  }

  private loadSupplierInvoices(): SupplierInvoice[] {
    try {
      const stored = this.storage.getItem<unknown>(SUPPLIER_INVOICES_STORAGE_KEY);
      if (!Array.isArray(stored) || !stored.every((invoice) => this.isSupplierInvoice(invoice))) {
        return [];
      }
      return stored.map((invoice) => this.normalizeStoredInvoice(invoice));
    } catch {
      return [];
    }
  }

  private normalizeStoredInvoice(invoice: SupplierInvoice): SupplierInvoice {
    const items = invoice.items.map((item) => ({
      ...item,
      lineTotal: this.roundMoney(item.invoicedQuantity * item.unitPrice),
    }));
    const totals = this.calculateTotals(items, invoice.taxAmount, invoice.discountAmount);
    return {
      ...invoice,
      items,
      ...totals,
      balanceAmount: this.roundMoney(Math.max(0, totals.totalAmount - invoice.paidAmount)),
    };
  }

  private commit(invoices: SupplierInvoice[]): void {
    const previous = this.invoicesState();
    this.invoicesState.set(invoices);
    try {
      this.storage.setItem(SUPPLIER_INVOICES_STORAGE_KEY, invoices);
    } catch (error) {
      this.invoicesState.set(previous);
      throw error;
    }
  }

  private isSupplierInvoice(value: unknown): value is SupplierInvoice {
    if (!this.isRecord(value)) return false;
    const items = value['items'];
    return (
      typeof value['id'] === 'string' &&
      typeof value['storeId'] === 'string' &&
      typeof value['invoiceNumber'] === 'string' &&
      typeof value['supplierId'] === 'number' &&
      Number.isFinite(value['supplierId']) &&
      typeof value['supplierName'] === 'string' &&
      typeof value['purchaseOrderId'] === 'string' &&
      typeof value['poNumber'] === 'string' &&
      this.isDate(value['invoiceDate']) &&
      (value['dueDate'] === undefined || this.isDate(value['dueDate'])) &&
      Array.isArray(items) &&
      items.length > 0 &&
      items.every((item) => this.isSupplierInvoiceItem(item)) &&
      this.isNonNegativeFiniteNumber(value['subtotal']) &&
      this.isNonNegativeFiniteNumber(value['taxAmount']) &&
      this.isNonNegativeFiniteNumber(value['discountAmount']) &&
      this.isNonNegativeFiniteNumber(value['totalAmount']) &&
      this.isNonNegativeFiniteNumber(value['paidAmount']) &&
      this.isNonNegativeFiniteNumber(value['balanceAmount']) &&
      this.isInvoiceStatus(value['status']) &&
      this.isMatchStatus(value['matchStatus']) &&
      (value['matchCheckedAt'] === undefined || this.isDate(value['matchCheckedAt'])) &&
      (value['notes'] === undefined || typeof value['notes'] === 'string') &&
      typeof value['createdAt'] === 'string' &&
      (value['updatedAt'] === undefined || typeof value['updatedAt'] === 'string')
    );
  }

  private isSupplierInvoiceItem(value: unknown): value is SupplierInvoiceItem {
    if (!this.isRecord(value)) return false;
    return (
      typeof value['id'] === 'string' &&
      typeof value['purchaseOrderItemId'] === 'string' &&
      typeof value['productId'] === 'string' &&
      this.isVariantId(value['variantId']) &&
      typeof value['productName'] === 'string' &&
      (value['variantName'] === undefined || typeof value['variantName'] === 'string') &&
      typeof value['sku'] === 'string' &&
      this.isPositiveFiniteNumber(value['invoicedQuantity']) &&
      this.isNonNegativeFiniteNumber(value['unitPrice']) &&
      this.isNonNegativeFiniteNumber(value['lineTotal'])
    );
  }

  private isInvoiceStatus(value: unknown): value is SupplierInvoiceStatus {
    return ['draft', 'pending_review', 'approved', 'partially_paid', 'paid', 'cancelled'].includes(
      value as SupplierInvoiceStatus,
    );
  }

  private isMatchStatus(value: unknown): value is SupplierInvoiceMatchStatus {
    return value === 'not_checked' || value === 'matched' || value === 'mismatch';
  }

  private isVariantId(value: unknown): boolean {
    return (
      value === null ||
      (typeof value === 'string' && value.length > 0) ||
      (typeof value === 'number' && Number.isFinite(value))
    );
  }

  private isDate(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0 && !Number.isNaN(Date.parse(value));
  }

  private isPositiveFiniteNumber(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  private isNonNegativeFiniteNumber(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private createId(prefix: string): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }
}
