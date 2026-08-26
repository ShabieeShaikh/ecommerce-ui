import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { GoodsReceipt } from '../components/store-admin/purchasing/goods-receipts/models/goods-receipt.model';
import { CreatePurchaseOrderItemRequest } from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { PurchaseReturnReason } from '../components/store-admin/purchasing/purchase-returns/models/purchase-return.model';
import { InventoryLocation } from '../models/inventory.models';
import { GoodsReceiptService } from './goods-receipt.service';
import { BranchService } from './branch.service';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryService } from './inventory.service';
import { LocalStorageService } from './local-storage.service';
import { ProductService } from './product.service';
import { PurchaseOrderService } from './purchase-order.service';
import { PurchaseReturnService } from './purchase-return.service';
import { StoreService } from './store.service';
import { SupplierService } from './supplier.service';
import { WarehouseService } from './warehouse.service';

const RETURNS_KEY = 'digishop_purchase_returns_v1';
const INVENTORY_TRANSACTIONS_KEY = 'digishop_inventory_transactions_v1';

describe('PurchaseReturnService', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('posts an auditable supplier return and decreases stock exactly once', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const receipt = createReceipt({ quantity: 100 });
    const inventory = TestBed.inject(InventoryService);
    const service = TestBed.inject(PurchaseReturnService);
    const item = receipt.items[0];
    const before = balance(receipt, item.productId, item.variantId);

    const posted = service.createPurchaseReturn(request(receipt, 5, 'damaged'));

    expect(posted.returnNumber).toBe('PR-20260825-0001');
    expect(posted).toEqual(expect.objectContaining({
      storeId: receipt.storeId, supplierId: receipt.supplierId, supplierName: receipt.supplierName,
      purchaseOrderId: receipt.purchaseOrderId, poNumber: receipt.poNumber,
      goodsReceiptId: receipt.id, grnNumber: receipt.grnNumber,
      returnLocationId: receipt.receivingLocationId, reason: 'damaged',
    }));
    expect(posted.items[0]).toEqual(expect.objectContaining({
      goodsReceiptItemId: item.id, receivedQuantity: 100, previouslyReturnedQuantity: 0,
      returnNowQuantity: 5, totalReturnedQuantity: 5, remainingReturnableQuantity: 95,
    }));
    expect(balance(receipt, item.productId, item.variantId)).toBe(before - 5);
    const transactions = inventory.getTransactionsByStore(receipt.storeId).filter((entry) => entry.type === 'purchase_return');
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toEqual(expect.objectContaining({
      quantity: -5, sourceLocationKey: receipt.receivingLocationId, destinationLocationKey: null,
      referenceNumber: posted.returnNumber, purchaseReturnId: posted.id,
      purchaseReturnNumber: posted.returnNumber, goodsReceiptId: receipt.id,
      goodsReceiptNumber: receipt.grnNumber, purchaseOrderId: receipt.purchaseOrderId,
      supplierId: receipt.supplierId,
    }));
    expect(posted.items[0].inventoryTransactionId).toBe(transactions[0].id);
  });

  it('supports multiple partial returns and a final return of the remaining quantity', () => {
    const receipt = createReceipt({ quantity: 100 });
    const service = TestBed.inject(PurchaseReturnService);
    const first = service.createPurchaseReturn(request(receipt, 10));
    const second = service.createPurchaseReturn(request(receipt, 20, 'defective'));
    const final = service.createPurchaseReturn(request(receipt, 70, 'quality_issue'));

    expect(first.items[0].previouslyReturnedQuantity).toBe(0);
    expect(second.items[0]).toEqual(expect.objectContaining({ previouslyReturnedQuantity: 10, totalReturnedQuantity: 30, remainingReturnableQuantity: 70 }));
    expect(final.items[0]).toEqual(expect.objectContaining({ previouslyReturnedQuantity: 30, totalReturnedQuantity: 100, remainingReturnableQuantity: 0 }));
    expect(service.getPreviouslyReturnedQuantity(receipt.items[0].id)).toBe(100);
    expect(service.getRemainingReturnableQuantity(receipt.id, receipt.items[0].id)).toBe(0);
    expect(service.getPurchaseReturnsByGoodsReceipt(receipt.id).map((item) => item.id)).toEqual([final.id, second.id, first.id]);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(0);
  });

  it('rejects historical over-return before inventory or history mutation', () => {
    const receipt = createReceipt({ quantity: 100 });
    const service = TestBed.inject(PurchaseReturnService);
    service.createPurchaseReturn(request(receipt, 80));
    const stockBefore = balance(receipt, receipt.items[0].productId, null);
    const transactionCount = returnTransactions(receipt).length;

    expect(() => service.createPurchaseReturn(request(receipt, 25))).toThrowError(/remaining returnable quantity of 20/);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(stockBefore);
    expect(returnTransactions(receipt)).toHaveLength(transactionCount);
    expect(service.returns()).toHaveLength(1);
  });

  it('rejects insufficient current stock at the original receiving location', () => {
    const receipt = createReceipt({ quantity: 100 });
    const inventory = TestBed.inject(InventoryService);
    inventory.transferStock({
      storeId: receipt.storeId, productId: receipt.items[0].productId, variantId: null,
      sourceLocationKey: receipt.receivingLocationId, destinationLocationKey: 'store', quantity: 80,
      referenceNumber: 'TRF-RETURN-TEST', occurredAt: '2026-08-22', createdBy: 'Tester',
    });
    const beforeTransactions = inventory.transactions().length;
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(20);

    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 30))).toThrowError(/available stock of 20/);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(20);
    expect(inventory.transactions()).toHaveLength(beforeTransactions);
  });

  it('respects reserved stock when the GRN destination is a branch', () => {
    const receipt = createReceipt({ quantity: 20, destination: 'branch' });
    const branchId = receipt.receivingLocationId.replace('branch:', '');
    TestBed.inject(InventoryService).createOrder({
      storeId: receipt.storeId, productId: receipt.items[0].productId, variantId: null,
      branchId, quantity: 15, referenceNumber: 'ORD-RESERVED-RETURN', customerName: 'Reserved Customer',
      createdBy: 'Tester',
    });
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 10))).toThrowError(/available stock of 5/);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(20);
  });

  it('returns only the exact variant and leaves parent/simple stock unchanged', () => {
    const product = TestBed.inject(ProductService).createCatalogProduct({
      storeId: 'store-001', name: 'Return Variant Shirt', sku: 'RET-SHIRT', category: 'Apparel',
      price: 100, status: 'active', imageUrl: '', description: 'Variant return test.', tags: ['test'],
      variants: [{ id: 'variant-black-large', sku: 'RET-SHIRT-BLK-L', status: 'active', attributes: [{ attributeDefinitionId: 'color', attributeKey: 'Color', value: 'Black' }] }],
    });
    const receipt = createReceipt({ items: [{ productId: product.id, variantId: 'variant-black-large', productName: product.name, variantName: 'Black / Large', sku: 'RET-SHIRT-BLK-L', quantity: 10, purchasePrice: 60 }] });
    TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 5));
    expect(balance(receipt, product.id, 'variant-black-large')).toBe(5);
    expect(TestBed.inject(InventoryService).getProductBalances(receipt.storeId, product.id, null)).toHaveLength(0);
  });

  it('returns simple-product stock from the Main Store without requiring a warehouse', () => {
    const receipt = createReceipt({ quantity: 10, destination: 'store' });
    const before = balance(receipt, receipt.items[0].productId, null);
    const posted = TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 6));
    expect(posted.returnLocationType).toBe('store');
    expect(posted.returnLocationId).toBe('store');
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(before - 6);
    expect(returnTransactions(receipt)[0].sourceLocationKey).toBe('store');
  });

  it('aggregates distinct GRN lines with the same inventory identity into one stock-out', () => {
    const receipt = createReceipt({ items: [simpleItem(3), simpleItem(2)] });
    const posted = TestBed.inject(PurchaseReturnService).createPurchaseReturn({
      goodsReceiptId: receipt.id, returnDate: '2026-08-22', reason: 'excess',
      items: receipt.items.map((item) => ({ goodsReceiptItemId: item.id, returnNowQuantity: item.receivedNowQuantity })),
    });
    expect(posted.items).toHaveLength(2);
    expect(new Set(posted.items.map((item) => item.inventoryTransactionId)).size).toBe(1);
    expect(returnTransactions(receipt)).toHaveLength(1);
    expect(returnTransactions(receipt)[0].quantity).toBe(-5);
  });

  it('validates all request lines before applying any stock mutation', () => {
    const receipt = createReceipt({ items: [simpleItem(10), { ...simpleItem(5), productId: 'prod-102', productName: 'Slim Fit Denim Jeans', sku: 'FH-JNS-002' }] });
    const before = TestBed.inject(InventoryService).getTotalStock(receipt.storeId);
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn({
      goodsReceiptId: receipt.id, returnDate: '2026-08-22', reason: 'damaged', items: [
        { goodsReceiptItemId: receipt.items[0].id, returnNowQuantity: 2 },
        { goodsReceiptItemId: receipt.items[1].id, returnNowQuantity: 6 },
      ],
    })).toThrowError(/remaining returnable quantity/);
    expect(TestBed.inject(InventoryService).getTotalStock(receipt.storeId)).toBe(before);
    expect(returnTransactions(receipt)).toEqual([]);
  });

  it('rejects empty, duplicate, and foreign Goods Receipt item requests', () => {
    const receipt = createReceipt({ quantity: 10 });
    const other = createReceipt({ quantity: 5 });
    const service = TestBed.inject(PurchaseReturnService);
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), items: [] })).toThrowError(/at least one item/);
    const line = { goodsReceiptItemId: receipt.items[0].id, returnNowQuantity: 1 };
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), items: [line, line] })).toThrowError(/more than once/);
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), items: [{ goodsReceiptItemId: other.items[0].id, returnNowQuantity: 1 }] })).toThrowError(/does not belong/);
    expect(service.returns()).toEqual([]);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects invalid return quantity %s', (quantity) => {
    const receipt = createReceipt({ quantity: 10 });
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, quantity))).toThrowError(/whole number greater than zero/);
    expect(returnTransactions(receipt)).toEqual([]);
  });

  it('rejects missing GRNs, invalid dates, dates before receipt, and invalid reasons', () => {
    const receipt = createReceipt({ quantity: 10 });
    const service = TestBed.inject(PurchaseReturnService);
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), goodsReceiptId: 'missing' })).toThrowError(/not found/);
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), returnDate: 'not-a-date' })).toThrowError(/date is invalid/);
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), returnDate: '2026-08-19' })).toThrowError(/earlier/);
    expect(() => service.createPurchaseReturn({ ...request(receipt, 1), reason: 'invalid' as PurchaseReturnReason })).toThrowError(/reason is invalid/);
  });

  it('rejects an orphaned or inconsistent Goods Receipt to Purchase Order relationship', () => {
    const receipt = createReceipt({ quantity: 10 });
    const purchaseOrders = TestBed.inject(PurchaseOrderService);
    vi.spyOn(purchaseOrders, 'getPurchaseOrderById').mockReturnValue(undefined);
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 1))).toThrowError(/Purchase Order.*not found/);
    expect(returnTransactions(receipt)).toEqual([]);
  });

  it('keeps GRN, PO, invoice, and payment history immutable', () => {
    const receipt = createReceipt({ quantity: 10 });
    localStorage.setItem('digishop_supplier_invoices_v1', JSON.stringify([{ id: 'financial-snapshot' }]));
    localStorage.setItem('digishop_supplier_payments_v1', JSON.stringify([{ id: 'payment-snapshot' }]));
    const grnBefore = JSON.stringify(TestBed.inject(GoodsReceiptService).getGoodsReceiptById(receipt.id));
    const poBefore = JSON.stringify(TestBed.inject(PurchaseOrderService).getPurchaseOrderById(receipt.purchaseOrderId));
    const invoiceBefore = localStorage.getItem('digishop_supplier_invoices_v1');
    const paymentBefore = localStorage.getItem('digishop_supplier_payments_v1');
    TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 4));
    expect(JSON.stringify(TestBed.inject(GoodsReceiptService).getGoodsReceiptById(receipt.id))).toBe(grnBefore);
    expect(JSON.stringify(TestBed.inject(PurchaseOrderService).getPurchaseOrderById(receipt.purchaseOrderId))).toBe(poBefore);
    expect(localStorage.getItem('digishop_supplier_invoices_v1')).toBe(invoiceBefore);
    expect(localStorage.getItem('digishop_supplier_payments_v1')).toBe(paymentBefore);
  });

  it('enforces selected-store isolation', () => {
    const receipt = createReceipt({ quantity: 10 });
    TestBed.inject(StoreService).changeSelectedStore('store-002', false);
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 1))).toThrowError(/selected store/);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(10);
  });

  it('rolls inventory and transaction history back if return persistence fails', () => {
    const receipt = createReceipt({ quantity: 10 });
    const before = balance(receipt, receipt.items[0].productId, null);
    const beforeTransactions = TestBed.inject(InventoryService).transactions().length;
    const storage = TestBed.inject(LocalStorageService);
    const original = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === RETURNS_KEY) throw new Error('Return persistence failed.');
      original(key, value);
    });
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 5))).toThrowError(/persistence failed/);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(before);
    expect(TestBed.inject(InventoryService).transactions()).toHaveLength(beforeTransactions);
    expect(TestBed.inject(PurchaseReturnService).returns()).toEqual([]);
  });

  it('does not save a return or publish stock changes when inventory transaction persistence fails', () => {
    const receipt = createReceipt({ quantity: 10 });
    const before = balance(receipt, receipt.items[0].productId, null);
    const beforeTransactions = TestBed.inject(InventoryService).transactions().length;
    const storage = TestBed.inject(LocalStorageService);
    const original = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((key, value) => {
      if (key === INVENTORY_TRANSACTIONS_KEY) throw new Error('Inventory update failed.');
      original(key, value);
    });
    expect(() => TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 5))).toThrowError(/Inventory update failed/);
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(before);
    expect(TestBed.inject(InventoryService).transactions()).toHaveLength(beforeTransactions);
    expect(TestBed.inject(PurchaseReturnService).returns()).toEqual([]);
    expect(localStorage.getItem(RETURNS_KEY)).toBeNull();
  });

  it('persists return, stock, transaction, numbering, and query histories across service reloads', () => {
    const receipt = createReceipt({ quantity: 10 });
    const first = TestBed.inject(PurchaseReturnService).createPurchaseReturn(request(receipt, 2));
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const service = TestBed.inject(PurchaseReturnService);
    expect(service.getPurchaseReturnById(first.id)).toEqual(first);
    expect(service.getPurchaseReturnsByStore(receipt.storeId)).toHaveLength(1);
    expect(service.getPurchaseReturnsBySupplier(receipt.supplierId)).toHaveLength(1);
    expect(service.getPurchaseReturnsByPurchaseOrder(receipt.purchaseOrderId)).toHaveLength(1);
    expect(service.getPurchaseReturnsByGoodsReceipt(receipt.id)).toHaveLength(1);
    const second = service.createPurchaseReturn(request(receipt, 1));
    expect(second.returnNumber.slice(-4)).toBe('0002');
    expect(balance(receipt, receipt.items[0].productId, null)).toBe(7);
    expect(returnTransactions(receipt)).toHaveLength(2);
  });

  it('loads corrupted or structurally invalid persisted return data safely', () => {
    localStorage.setItem(RETURNS_KEY, '{invalid json');
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    expect(TestBed.inject(PurchaseReturnService).returns()).toEqual([]);
    TestBed.resetTestingModule();
    localStorage.setItem(RETURNS_KEY, JSON.stringify([{ id: 'incomplete' }]));
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    expect(TestBed.inject(PurchaseReturnService).returns()).toEqual([]);
  });
});

interface ReceiptOptions {
  quantity?: number;
  destination?: 'store' | 'warehouse' | 'branch';
  items?: CreatePurchaseOrderItemRequest[];
}

function createReceipt(options: ReceiptOptions = {}): GoodsReceipt {
  const storeId = 'store-001';
  const supplier = TestBed.inject(SupplierService).createSupplier({
    storeId, supplierCode: `SUP-RET-${Date.now()}-${Math.random()}`, name: 'Return Test Supplier',
    phone: '03001234567', status: 'active',
  });
  const location = receivingLocation(storeId, options.destination ?? 'warehouse');
  const purchaseOrderService = TestBed.inject(PurchaseOrderService);
  const purchaseOrder = purchaseOrderService.createPurchaseOrder({
    storeId, supplierId: supplier.id, supplierName: supplier.name,
    receivingLocationId: location.key, receivingLocationName: location.name,
    receivingLocationType: location.type, orderDate: '2026-08-20', expectedDeliveryDate: '2026-08-27',
    items: options.items ?? [simpleItem(options.quantity ?? 10)], taxAmount: 0, discountAmount: 0,
  });
  purchaseOrderService.changePurchaseOrderStatus(purchaseOrder.id, 'ordered');
  return TestBed.inject(GoodsReceiptService).receiveGoods({
    purchaseOrderId: purchaseOrder.id, receivedDate: '2026-08-21',
    items: purchaseOrder.items.map((item) => ({ purchaseOrderItemId: item.id, receivedNowQuantity: item.quantity })),
  });
}

function receivingLocation(storeId: string, destination: ReceiptOptions['destination']): InventoryLocation {
  const locations = TestBed.inject(InventoryLocationService);
  if (destination === 'store') {
    const location = locations.getLocation(storeId, 'store');
    if (!location) throw new Error('Main Store test location not found.');
    return location;
  }
  if (destination === 'branch') {
    const branch = TestBed.inject(BranchService).create({
      storeId, addressScope: 'international', name: 'Return Test Branch', code: `RET-BR-${Date.now()}`,
      description: 'Branch used for reserved return stock tests.', country: 'Pakistan', state: 'Sindh',
      city: 'Karachi', address: '1 Branch Road', postalCode: '74000', managerName: 'Branch Manager',
      managerEmail: 'branch-return@example.com', managerPhone: '+92 300 1234567', status: 'active',
      operatingHours: [],
    });
    const location = locations.getLocation(storeId, `branch:${branch.id}`);
    if (!location) throw new Error('Branch test location not found.');
    return location;
  }
  const warehouse = TestBed.inject(WarehouseService).createWarehouse({
    storeId, name: `Return Warehouse ${Date.now()} ${Math.random()}`, code: `RET-${Date.now()}-${Math.random()}`,
    address: '1 Return Road', city: 'Karachi', state: 'Sindh', country: 'Pakistan',
    managerKey: 'return-manager', managerName: 'Return Manager', managerEmail: 'return@example.com', status: 'active',
  });
  const location = locations.getLocation(storeId, `warehouse:${warehouse.id}`);
  if (!location) throw new Error('Warehouse test location not found.');
  return location;
}

function simpleItem(quantity: number): CreatePurchaseOrderItemRequest {
  return { productId: 'prod-101', variantId: null, productName: 'Classic Leather Jacket', sku: 'FH-JKT-001', quantity, purchasePrice: 100 };
}

function request(receipt: GoodsReceipt, quantity: number, reason: PurchaseReturnReason = 'damaged') {
  return { goodsReceiptId: receipt.id, returnDate: '2026-08-22', reason, items: [{ goodsReceiptItemId: receipt.items[0].id, returnNowQuantity: quantity }] };
}

function balance(receipt: GoodsReceipt, productId: string, variantId: string | number | null): number {
  return TestBed.inject(InventoryService).getBalance(receipt.storeId, productId, receipt.receivingLocationId, variantId === null ? null : String(variantId)).quantity;
}

function returnTransactions(receipt: GoodsReceipt) {
  return TestBed.inject(InventoryService).getTransactionsByStore(receipt.storeId).filter((item) => item.type === 'purchase_return');
}
