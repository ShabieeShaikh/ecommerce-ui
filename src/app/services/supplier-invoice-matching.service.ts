import { Injectable, inject } from '@angular/core';

import {
  SupplierInvoiceItemMatchResult,
  SupplierInvoiceMatchIssue,
  SupplierInvoiceMatchResult,
} from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice-match.model';
import { SupplierInvoice } from '../components/store-admin/purchasing/supplier-invoices/models/supplier-invoice.model';
import { GoodsReceiptService } from './goods-receipt.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StoreService } from './store.service';
import { SupplierInvoiceService } from './supplier-invoice.service';

const COMMITTED_INVOICE_STATUSES: ReadonlySet<SupplierInvoice['status']> = new Set([
  'pending_review', 'approved', 'partially_paid', 'paid',
]);

@Injectable({ providedIn: 'root' })
export class SupplierInvoiceMatchingService {
  private readonly invoiceService = inject(SupplierInvoiceService);
  private readonly purchaseOrderService = inject(PurchaseOrderService);
  private readonly goodsReceiptService = inject(GoodsReceiptService);
  private readonly storeService = inject(StoreService);

  performThreeWayMatch(invoiceId: string): SupplierInvoiceMatchResult {
    const invoice = this.requireVisibleInvoice(invoiceId);
    if (invoice.status !== 'pending_review') {
      throw new Error('Only supplier invoices pending review can be matched.');
    }
    const result = this.calculateMatchResult(invoice);
    this.invoiceService.saveMatchOutcome(
      invoice.id,
      result.matched ? 'matched' : 'mismatch',
      result.checkedAt,
    );
    return result;
  }

  getMatchResult(invoiceId: string): SupplierInvoiceMatchResult {
    const invoice = this.requireVisibleInvoice(invoiceId);
    return this.calculateMatchResult(invoice, invoice.matchCheckedAt);
  }

  private calculateMatchResult(
    invoice: SupplierInvoice,
    checkedAt = new Date().toISOString(),
  ): SupplierInvoiceMatchResult {
    const issues: SupplierInvoiceMatchIssue[] = [];
    const purchaseOrder = this.purchaseOrderService.getPurchaseOrderById(invoice.purchaseOrderId);
    if (!purchaseOrder) {
      issues.push({ type: 'missing_purchase_order', message: 'The linked Purchase Order could not be found.' });
      return this.result(invoice, [], issues, checkedAt);
    }
    if (
      purchaseOrder.storeId !== invoice.storeId ||
      purchaseOrder.supplierId !== invoice.supplierId
    ) {
      issues.push({
        type: 'invalid_relationship',
        message: 'Supplier Invoice, Purchase Order, Store, and Supplier relationships are inconsistent.',
      });
    }

    const poItems = new Map(purchaseOrder.items.map((item) => [item.id, item]));
    const previouslyInvoiced = this.previousInvoiceQuantities(invoice);
    const receipts = this.goodsReceiptService.getGoodsReceiptsByPurchaseOrder(purchaseOrder.id);
    const grnReceived = new Map<string, number>();
    for (const receipt of receipts) {
      for (const item of receipt.items) {
        grnReceived.set(
          item.purchaseOrderItemId,
          (grnReceived.get(item.purchaseOrderItemId) ?? 0) + item.receivedNowQuantity,
        );
      }
    }

    const itemResults: SupplierInvoiceItemMatchResult[] = [];
    for (const invoiceItem of invoice.items) {
      const poItem = poItems.get(invoiceItem.purchaseOrderItemId);
      if (!poItem) {
        issues.push({
          type: 'missing_po_item', purchaseOrderItemId: invoiceItem.purchaseOrderItemId,
          productName: invoiceItem.productName,
          message: `${invoiceItem.productName}: invoice line does not belong to the linked Purchase Order.`,
        });
        continue;
      }
      if (
        !Number.isFinite(invoiceItem.invoicedQuantity) || invoiceItem.invoicedQuantity <= 0 ||
        !Number.isFinite(invoiceItem.unitPrice) || invoiceItem.unitPrice < 0
      ) {
        issues.push({
          type: 'invalid_invoice_item', purchaseOrderItemId: invoiceItem.purchaseOrderItemId,
          productName: invoiceItem.productName,
          message: `${invoiceItem.productName}: invoice quantity or unit price is invalid.`,
        });
        continue;
      }

      const priorQuantity = previouslyInvoiced.get(poItem.id) ?? 0;
      const remainingOrdered = Math.max(0, poItem.quantity - priorQuantity);
      const remainingReceived = Math.max(0, poItem.receivedQuantity - priorQuantity);
      const availableToInvoice = Math.min(remainingOrdered, remainingReceived);
      const quantityDifference = this.roundQuantity(invoiceItem.invoicedQuantity - availableToInvoice);
      const quantityMatched = invoiceItem.invoicedQuantity <= availableToInvoice;
      const priceDifference = this.roundMoney(invoiceItem.unitPrice - poItem.purchasePrice);
      const priceMatched = this.moneyInCents(invoiceItem.unitPrice) === this.moneyInCents(poItem.purchasePrice);

      if (invoiceItem.invoicedQuantity > remainingReceived) {
        const excess = this.roundQuantity(invoiceItem.invoicedQuantity - remainingReceived);
        issues.push({
          type: 'invoice_quantity_exceeds_received', purchaseOrderItemId: poItem.id,
          productName: invoiceItem.productName,
          message: `${invoiceItem.productName}: ${excess} unit${excess === 1 ? '' : 's'} invoiced beyond the remaining received quantity.`,
        });
      }
      if (invoiceItem.invoicedQuantity > remainingOrdered) {
        const excess = this.roundQuantity(invoiceItem.invoicedQuantity - remainingOrdered);
        issues.push({
          type: 'invoice_quantity_exceeds_ordered', purchaseOrderItemId: poItem.id,
          productName: invoiceItem.productName,
          message: `${invoiceItem.productName}: ${excess} unit${excess === 1 ? '' : 's'} invoiced beyond the remaining ordered quantity.`,
        });
      }
      if (!priceMatched) {
        const direction = priceDifference > 0 ? 'higher' : 'lower';
        issues.push({
          type: 'price_mismatch', purchaseOrderItemId: poItem.id,
          productName: invoiceItem.productName,
          message: `${invoiceItem.productName}: invoice unit price is ${this.formatMoney(Math.abs(priceDifference))} ${direction} than the Purchase Order price.`,
        });
      }
      if (receipts.length > 0) {
        const historyQuantity = this.roundQuantity(grnReceived.get(poItem.id) ?? 0);
        if (historyQuantity !== this.roundQuantity(poItem.receivedQuantity)) {
          issues.push({
            type: 'received_quantity_integrity', purchaseOrderItemId: poItem.id,
            productName: invoiceItem.productName,
            message: `${invoiceItem.productName}: Purchase Order received quantity (${poItem.receivedQuantity}) does not agree with GRN history (${historyQuantity}).`,
          });
        }
      }

      itemResults.push({
        purchaseOrderItemId: poItem.id, productId: invoiceItem.productId,
        variantId: invoiceItem.variantId, productName: invoiceItem.productName,
        variantName: invoiceItem.variantName, sku: invoiceItem.sku,
        orderedQuantity: poItem.quantity, receivedQuantity: poItem.receivedQuantity,
        previouslyInvoicedQuantity: priorQuantity, availableToInvoice,
        invoicedQuantity: invoiceItem.invoicedQuantity,
        purchaseOrderUnitPrice: poItem.purchasePrice, invoiceUnitPrice: invoiceItem.unitPrice,
        quantityMatched, priceMatched, quantityDifference, priceDifference,
        matched: quantityMatched && priceMatched,
      });
    }
    return this.result(invoice, itemResults, issues, checkedAt);
  }

  private previousInvoiceQuantities(current: SupplierInvoice): Map<string, number> {
    const quantities = new Map<string, number>();
    for (const invoice of this.invoiceService.getSupplierInvoicesByPurchaseOrder(current.purchaseOrderId)) {
      if (invoice.id === current.id || !COMMITTED_INVOICE_STATUSES.has(invoice.status)) continue;
      for (const item of invoice.items) {
        quantities.set(item.purchaseOrderItemId, (quantities.get(item.purchaseOrderItemId) ?? 0) + item.invoicedQuantity);
      }
    }
    return quantities;
  }

  private result(
    invoice: SupplierInvoice,
    itemResults: SupplierInvoiceItemMatchResult[],
    issues: SupplierInvoiceMatchIssue[],
    checkedAt: string,
  ): SupplierInvoiceMatchResult {
    const quantityMatched = itemResults.length === invoice.items.length && itemResults.every((item) => item.quantityMatched);
    const priceMatched = itemResults.length === invoice.items.length && itemResults.every((item) => item.priceMatched);
    return {
      invoiceId: invoice.id, purchaseOrderId: invoice.purchaseOrderId,
      matched: quantityMatched && priceMatched && issues.length === 0,
      quantityMatched, priceMatched, itemResults, issues, checkedAt,
    };
  }

  private requireVisibleInvoice(id: string): SupplierInvoice {
    const invoice = this.invoiceService.getSupplierInvoiceById(id.trim());
    if (!invoice) throw new Error('Supplier invoice not found.');
    if (invoice.storeId !== this.storeService.selectedStoreId()) {
      throw new Error('Supplier invoice does not belong to the selected store.');
    }
    return invoice;
  }
  private moneyInCents(value: number): number { return Math.round((value + Number.EPSILON) * 100); }
  private roundMoney(value: number): number { return Math.round((value + Number.EPSILON) * 100) / 100; }
  private roundQuantity(value: number): number { return Math.round((value + Number.EPSILON) * 10000) / 10000; }
  private formatMoney(value: number): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value); }
}
