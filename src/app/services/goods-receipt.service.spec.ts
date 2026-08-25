import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { CreatePurchaseOrderItemRequest } from '../components/store-admin/purchasing/purchase-orders/models/purchase-order.model';
import { InventoryLocation } from '../models/inventory.models';
import { ProductService } from './product.service';
import { GoodsReceiptService } from './goods-receipt.service';
import { InventoryLocationService } from './inventory-location.service';
import { InventoryService } from './inventory.service';
import { LocalStorageService } from './local-storage.service';
import { PurchaseOrderService } from './purchase-order.service';
import { StoreService } from './store.service';
import { SupplierService } from './supplier.service';
import { WarehouseService } from './warehouse.service';

const RECEIPTS_STORAGE_KEY = 'digishop_goods_receipts_v1';

describe('GoodsReceiptService', () => {
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

  it('posts partial and final receipts while increasing only the received-now quantity', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 100 });
    const service = TestBed.inject(GoodsReceiptService);
    const inventory = TestBed.inject(InventoryService);
    const item = purchaseOrder.items[0];
    const before = inventory.getBalance(
      purchaseOrder.storeId,
      item.productId,
      purchaseOrder.receivingLocationId,
      null,
    ).quantity;

    const first = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [{ purchaseOrderItemId: item.id, receivedNowQuantity: 40 }],
    });
    const afterFirst = TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)!;

    expect(first.grnNumber).toMatch(/^GRN-\d{8}-0001$/);
    expect(first.items[0]).toEqual(
      expect.objectContaining({
        orderedQuantity: 100,
        previouslyReceivedQuantity: 0,
        receivedNowQuantity: 40,
        totalReceivedQuantity: 40,
        remainingQuantity: 60,
      }),
    );
    expect(afterFirst.items[0].receivedQuantity).toBe(40);
    expect(afterFirst.status).toBe('partially_received');
    expect(
      inventory.getBalance(purchaseOrder.storeId, item.productId, purchaseOrder.receivingLocationId)
        .quantity,
    ).toBe(before + 40);

    const second = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-22',
      items: [{ purchaseOrderItemId: item.id, receivedNowQuantity: 60 }],
    });
    const completed = TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)!;

    expect(second.grnNumber).toMatch(/^GRN-\d{8}-0002$/);
    expect(second.items[0].previouslyReceivedQuantity).toBe(40);
    expect(second.items[0].receivedNowQuantity).toBe(60);
    expect(completed.items[0].receivedQuantity).toBe(100);
    expect(completed.status).toBe('received');
    expect(
      inventory.getBalance(purchaseOrder.storeId, item.productId, purchaseOrder.receivingLocationId)
        .quantity,
    ).toBe(before + 100);
    expect(service.getGoodsReceiptsByPurchaseOrder(purchaseOrder.id)).toHaveLength(2);
  });

  it('verifies the complete 10 + 20 + 30 receiving flow without double stock increases', () => {
    const purchaseOrder = createPurchaseOrder({ quantity: 50 });
    const purchaseOrders = TestBed.inject(PurchaseOrderService);
    const inventory = TestBed.inject(InventoryService);
    const service = TestBed.inject(GoodsReceiptService);
    const item = purchaseOrder.items[0];

    inventory.addStock({
      storeId: purchaseOrder.storeId,
      productId: item.productId,
      variantId: null,
      destinationLocationKey: purchaseOrder.receivingLocationId,
      quantity: 10,
      unitCost: item.purchasePrice,
      supplierName: 'Opening stock',
      referenceNumber: 'GRN-E2E-OPENING-10',
      occurredAt: '2026-08-19',
      createdBy: 'Test Runner',
    });

    expect(purchaseOrder.status).toBe('draft');
    expect(
      inventory.getBalance(purchaseOrder.storeId, item.productId, purchaseOrder.receivingLocationId)
        .quantity,
    ).toBe(10);

    purchaseOrders.changePurchaseOrderStatus(purchaseOrder.id, 'ordered');
    expect(
      inventory.getBalance(
        purchaseOrder.storeId,
        item.productId,
        purchaseOrder.receivingLocationId,
      ).quantity,
    ).toBe(10);

    const first = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [{ purchaseOrderItemId: item.id, receivedNowQuantity: 20 }],
    });
    expect(
      inventory.getBalance(purchaseOrder.storeId, item.productId, purchaseOrder.receivingLocationId)
        .quantity,
    ).toBe(30);
    expect(purchaseOrders.getPurchaseOrderById(purchaseOrder.id)?.items[0].receivedQuantity).toBe(
      20,
    );
    expect(purchaseOrders.getPurchaseOrderById(purchaseOrder.id)?.status).toBe(
      'partially_received',
    );

    const second = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-22',
      items: [{ purchaseOrderItemId: item.id, receivedNowQuantity: 30 }],
    });
    expect(
      inventory.getBalance(purchaseOrder.storeId, item.productId, purchaseOrder.receivingLocationId)
        .quantity,
    ).toBe(60);
    expect(purchaseOrders.getPurchaseOrderById(purchaseOrder.id)?.items[0].receivedQuantity).toBe(
      50,
    );
    expect(purchaseOrders.getPurchaseOrderById(purchaseOrder.id)?.status).toBe('received');
    expect(
      service.getGoodsReceiptsByPurchaseOrder(purchaseOrder.id).map((receipt) => receipt.id),
    ).toEqual([second.id, first.id]);

    const receiptTransactions = inventory
      .getTransactionsByStore(purchaseOrder.storeId)
      .filter(
        (transaction) =>
          transaction.goodsReceiptId === first.id || transaction.goodsReceiptId === second.id,
      );
    expect(receiptTransactions.map((transaction) => transaction.quantity)).toEqual([30, 20]);
  });

  it('updates only submitted PO lines and completes only when every line is received', () => {
    const purchaseOrder = createOrderedPurchaseOrder({
      items: [
        simpleItem('prod-101', 'Classic Leather Jacket', 'FH-JKT-001', 100, 100),
        simpleItem('prod-102', 'Slim Fit Denim Jeans', 'FH-JNS-002', 50, 50),
      ],
    });
    const service = TestBed.inject(GoodsReceiptService);

    service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [
        { purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 20 },
        { purchaseOrderItemId: purchaseOrder.items[1].id, receivedNowQuantity: 50 },
      ],
    });
    const partial = TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)!;

    expect(partial.items.map((item) => item.receivedQuantity)).toEqual([20, 50]);
    expect(partial.status).toBe('partially_received');

    service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-22',
      items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 80 }],
    });
    const completed = TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)!;
    expect(completed.items.map((item) => item.receivedQuantity)).toEqual([100, 50]);
    expect(completed.status).toBe('received');
  });

  it.each([
    ['draft', false],
    ['received', true],
    ['cancelled', false],
  ] as const)('rejects a %s purchase order without changing stock', (status, receiveFirst) => {
    const purchaseOrder = createPurchaseOrder({ quantity: 10 });
    const purchaseOrders = TestBed.inject(PurchaseOrderService);
    if (status !== 'draft') purchaseOrders.changePurchaseOrderStatus(purchaseOrder.id, 'ordered');
    const service = TestBed.inject(GoodsReceiptService);
    const inventory = TestBed.inject(InventoryService);
    if (receiveFirst) {
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 10 }],
      });
    } else if (status === 'cancelled') {
      purchaseOrders.changePurchaseOrderStatus(purchaseOrder.id, 'cancelled');
    }
    const stockBefore = inventory.getTotalStock(purchaseOrder.storeId);
    const receiptCountBefore = service.receipts().length;

    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-22',
        items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 1 }],
      }),
    ).toThrowError(/ordered or partially received/);
    expect(inventory.getTotalStock(purchaseOrder.storeId)).toBe(stockBefore);
    expect(service.receipts()).toHaveLength(receiptCountBefore);
  });

  it('rejects over-receipt after validating every line and leaves all domains unchanged', () => {
    const purchaseOrder = createOrderedPurchaseOrder({
      items: [
        simpleItem('prod-101', 'Classic Leather Jacket', 'FH-JKT-001', 100, 100),
        simpleItem('prod-102', 'Slim Fit Denim Jeans', 'FH-JNS-002', 20, 50),
      ],
    });
    const service = TestBed.inject(GoodsReceiptService);
    const inventory = TestBed.inject(InventoryService);
    const stockBefore = inventory.getTotalStock(purchaseOrder.storeId);

    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [
          { purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 40 },
          { purchaseOrderItemId: purchaseOrder.items[1].id, receivedNowQuantity: 25 },
        ],
      }),
    ).toThrowError(/exceeds the remaining quantity/);

    expect(inventory.getTotalStock(purchaseOrder.storeId)).toBe(stockBefore);
    expect(
      TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)?.items,
    ).toEqual(purchaseOrder.items);
    expect(service.receipts()).toEqual([]);
    expect(inventory.getTransactionsByStore(purchaseOrder.storeId)).toEqual([]);
  });

  it.each([
    ['zero', 0],
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
    ['infinite', Number.POSITIVE_INFINITY],
  ])('rejects a %s received quantity', (_name, receivedNowQuantity) => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 10 });
    const service = TestBed.inject(GoodsReceiptService);

    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity }],
      }),
    ).toThrowError(/whole number greater than zero/);
    expect(service.receipts()).toEqual([]);
  });

  it('rejects empty, duplicate, foreign, and missing PO item requests', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 10 });
    const otherPurchaseOrder = createOrderedPurchaseOrder({ quantity: 5 });
    const service = TestBed.inject(GoodsReceiptService);
    const validLine = {
      purchaseOrderItemId: purchaseOrder.items[0].id,
      receivedNowQuantity: 1,
    };

    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [],
      }),
    ).toThrowError(/at least one item/);
    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [validLine, validLine],
      }),
    ).toThrowError(/more than once/);
    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [
          {
            purchaseOrderItemId: otherPurchaseOrder.items[0].id,
            receivedNowQuantity: 1,
          },
        ],
      }),
    ).toThrowError(/item could not be found/);
    expect(() =>
      service.receiveGoods({
        purchaseOrderId: 'missing-po',
        receivedDate: '2026-08-21',
        items: [validLine],
      }),
    ).toThrowError('Purchase order not found.');
    expect(service.receipts()).toEqual([]);
  });

  it('uses the exact warehouse destination and creates referenced inbound history', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 25 });
    const service = TestBed.inject(GoodsReceiptService);
    const inventory = TestBed.inject(InventoryService);
    const receipt = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 25 }],
      notes: 'All cartons inspected.',
    });
    const transaction = inventory.getTransactionsByStore(purchaseOrder.storeId)[0];

    expect(receipt.receivingLocationId).toBe(purchaseOrder.receivingLocationId);
    expect(
      inventory.getBalance(
        purchaseOrder.storeId,
        purchaseOrder.items[0].productId,
        purchaseOrder.receivingLocationId,
      ).quantity,
    ).toBe(25);
    expect(
      inventory.getBalance(purchaseOrder.storeId, purchaseOrder.items[0].productId, 'store')
        .quantity,
    ).not.toBe(25);
    expect(transaction).toEqual(
      expect.objectContaining({
        type: 'receive',
        quantity: 25,
        destinationLocationKey: purchaseOrder.receivingLocationId,
        referenceNumber: receipt.grnNumber,
        goodsReceiptId: receipt.id,
        purchaseOrderId: purchaseOrder.id,
        purchaseOrderNumber: purchaseOrder.poNumber,
        supplierName: purchaseOrder.supplierName,
      }),
    );
    expect(receipt.items[0].inventoryTransactionId).toBe(transaction.id);
  });

  it('receives a simple product into the Main Store fallback without a warehouse', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 25, destination: 'store' });
    const service = TestBed.inject(GoodsReceiptService);
    const inventory = TestBed.inject(InventoryService);
    const item = purchaseOrder.items[0];
    const before = inventory.getBalance(purchaseOrder.storeId, item.productId, 'store').quantity;

    const receipt = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [{ purchaseOrderItemId: item.id, receivedNowQuantity: 25 }],
    });

    expect(receipt.receivingLocationType).toBe('store');
    expect(receipt.items[0].variantId).toBeNull();
    expect(inventory.getBalance(purchaseOrder.storeId, item.productId, 'store').quantity).toBe(
      before + 25,
    );
    expect(inventory.getTransactionsByStore(purchaseOrder.storeId)[0].type).toBe('receive');
  });

  it('receives the exact product variant without creating parent/simple stock', () => {
    const product = TestBed.inject(ProductService).createCatalogProduct({
      storeId: 'store-001',
      name: 'Receipt Variant Shirt',
      sku: 'GRN-SHIRT',
      category: 'Apparel',
      price: 100,
      status: 'active',
      imageUrl: '',
      description: 'Variant receipt test product.',
      tags: ['test'],
      variants: [
        {
          id: 'variant-black-large',
          sku: 'GRN-SHIRT-BLK-L',
          status: 'active',
          attributes: [
            {
              attributeDefinitionId: 'color',
              attributeKey: 'Color',
              value: 'Black',
            },
            {
              attributeDefinitionId: 'size',
              attributeKey: 'Size',
              value: 'Large',
            },
          ],
        },
      ],
    });
    const purchaseOrder = createOrderedPurchaseOrder({
      items: [
        {
          productId: product.id,
          variantId: 'variant-black-large',
          productName: product.name,
          variantName: 'Black / Large',
          sku: 'GRN-SHIRT-BLK-L',
          quantity: 10,
          purchasePrice: 60,
        },
      ],
    });
    const inventory = TestBed.inject(InventoryService);

    TestBed.inject(GoodsReceiptService).receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 10 }],
    });

    expect(
      inventory.getBalance(
        purchaseOrder.storeId,
        product.id,
        purchaseOrder.receivingLocationId,
        'variant-black-large',
      ).quantity,
    ).toBe(10);
    expect(inventory.getProductBalances(purchaseOrder.storeId, product.id, null)).toHaveLength(0);
  });

  it('rejects capacity overflow before PO, inventory, transaction, or GRN mutation', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 10 });
    const inventory = TestBed.inject(InventoryService);
    const storeService = TestBed.inject(StoreService);
    storeService.updateStore(
      purchaseOrder.storeId,
      { inventoryAllocationLimit: inventory.getTotalStock(purchaseOrder.storeId) + 5 },
      false,
    );
    const service = TestBed.inject(GoodsReceiptService);

    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 10 }],
      }),
    ).toThrowError(/Inventory limit exceeded/);
    expect(
      TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)?.items[0]
        .receivedQuantity,
    ).toBe(0);
    expect(inventory.getTransactionsByStore(purchaseOrder.storeId)).toEqual([]);
    expect(service.receipts()).toEqual([]);
  });

  it('aggregates duplicate product variants across distinct PO lines into one stock movement', () => {
    const purchaseOrder = createOrderedPurchaseOrder({
      items: [
        simpleItem('prod-101', 'Classic Leather Jacket', 'FH-JKT-001', 3, 100),
        simpleItem('prod-101', 'Classic Leather Jacket', 'FH-JKT-001', 2, 120),
      ],
    });
    const service = TestBed.inject(GoodsReceiptService);
    const receipt = service.receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: purchaseOrder.items.map((item) => ({
        purchaseOrderItemId: item.id,
        receivedNowQuantity: item.quantity,
      })),
    });
    const transactions = TestBed.inject(InventoryService).getTransactionsByStore(
      purchaseOrder.storeId,
    );

    expect(receipt.items).toHaveLength(2);
    expect(new Set(receipt.items.map((item) => item.inventoryTransactionId)).size).toBe(1);
    expect(transactions).toHaveLength(1);
    expect(transactions[0].quantity).toBe(5);
    expect(transactions[0].unitCost).toBe(108);
  });

  it('rolls back inventory and PO changes when GRN persistence fails', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 10 });
    const inventory = TestBed.inject(InventoryService);
    const stockBefore = inventory.getTotalStock(purchaseOrder.storeId);
    const storage = TestBed.inject(LocalStorageService);
    const setItem = storage.setItem.bind(storage);
    vi.spyOn(storage, 'setItem').mockImplementation((key: string, value: unknown) => {
      if (key === RECEIPTS_STORAGE_KEY) throw new Error('Simulated GRN persistence failure.');
      setItem(key, value);
    });

    expect(() =>
      TestBed.inject(GoodsReceiptService).receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 5 }],
      }),
    ).toThrowError('Simulated GRN persistence failure.');

    expect(inventory.getTotalStock(purchaseOrder.storeId)).toBe(stockBefore);
    expect(inventory.getTransactionsByStore(purchaseOrder.storeId)).toEqual([]);
    expect(
      TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)?.items[0]
        .receivedQuantity,
    ).toBe(0);
    expect(TestBed.inject(GoodsReceiptService).receipts()).toEqual([]);
  });

  it('enforces selected-store isolation', () => {
    TestBed.inject(StoreService).changeSelectedStore('store-002', false);
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 5 });
    const service = TestBed.inject(GoodsReceiptService);

    expect(() =>
      service.receiveGoods({
        purchaseOrderId: purchaseOrder.id,
        receivedDate: '2026-08-21',
        items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 1 }],
      }),
    ).toThrowError(/selected store/);
    expect(service.receipts()).toEqual([]);
  });

  it('persists receipt, PO, inventory, transaction history, and safely handles corrupt GRN data', () => {
    const purchaseOrder = createOrderedPurchaseOrder({ quantity: 10 });
    const receipt = TestBed.inject(GoodsReceiptService).receiveGoods({
      purchaseOrderId: purchaseOrder.id,
      receivedDate: '2026-08-21',
      items: [{ purchaseOrderItemId: purchaseOrder.items[0].id, receivedNowQuantity: 4 }],
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });

    expect(TestBed.inject(GoodsReceiptService).getGoodsReceiptById(receipt.id)).toEqual(receipt);
    expect(
      TestBed.inject(PurchaseOrderService).getPurchaseOrderById(purchaseOrder.id)?.items[0]
        .receivedQuantity,
    ).toBe(4);
    expect(
      TestBed.inject(InventoryService).getTransactionsByStore(purchaseOrder.storeId),
    ).toHaveLength(1);

    TestBed.resetTestingModule();
    localStorage.setItem(RECEIPTS_STORAGE_KEY, '{invalid json');
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    expect(TestBed.inject(GoodsReceiptService).receipts()).toEqual([]);
  });
});

interface PurchaseOrderOptions {
  quantity?: number;
  destination?: 'store' | 'warehouse';
  items?: CreatePurchaseOrderItemRequest[];
}

function createOrderedPurchaseOrder(options: PurchaseOrderOptions = {}) {
  const purchaseOrder = createPurchaseOrder(options);
  return TestBed.inject(PurchaseOrderService).changePurchaseOrderStatus(
    purchaseOrder.id,
    'ordered',
  )!;
}

function createPurchaseOrder(options: PurchaseOrderOptions = {}) {
  const storeId = 'store-001';
  const supplier = TestBed.inject(SupplierService).createSupplier({
    storeId,
    supplierCode: `SUP-GRN-${Date.now()}-${Math.random()}`,
    name: 'GRN Test Supplier',
    phone: '03001234567',
    status: 'active',
  });
  const receivingLocation = createReceivingLocation(storeId, options.destination ?? 'warehouse');
  return TestBed.inject(PurchaseOrderService).createPurchaseOrder({
    storeId,
    supplierId: supplier.id,
    supplierName: supplier.name,
    receivingLocationId: receivingLocation.key,
    receivingLocationName: receivingLocation.name,
    receivingLocationType: receivingLocation.type,
    orderDate: '2026-08-20',
    expectedDeliveryDate: '2026-08-27',
    items: options.items ?? [
      simpleItem('prod-101', 'Classic Leather Jacket', 'FH-JKT-001', options.quantity ?? 10, 100),
    ],
    taxAmount: 0,
    discountAmount: 0,
  });
}

function createReceivingLocation(
  storeId: string,
  destination: 'store' | 'warehouse',
): InventoryLocation {
  const locations = TestBed.inject(InventoryLocationService);
  if (destination === 'store') {
    const storeLocation = locations.getLocation(storeId, 'store');
    if (!storeLocation) throw new Error('Main Store test location was not found.');
    return storeLocation;
  }
  const warehouse = TestBed.inject(WarehouseService).createWarehouse({
    storeId,
    name: `GRN Warehouse ${Date.now()} ${Math.random()}`,
    code: `GRN-${Date.now()}-${Math.random()}`,
    address: '1 Receipt Road',
    city: 'Karachi',
    state: 'Sindh',
    country: 'Pakistan',
    managerKey: 'grn-manager',
    managerName: 'GRN Manager',
    managerEmail: 'grn-manager@example.com',
    status: 'active',
  });
  const warehouseLocation = locations.getLocation(storeId, `warehouse:${warehouse.id}`);
  if (!warehouseLocation) throw new Error('Warehouse test location was not found.');
  return warehouseLocation;
}

function simpleItem(
  productId: string,
  productName: string,
  sku: string,
  quantity: number,
  purchasePrice: number,
): CreatePurchaseOrderItemRequest {
  return {
    productId,
    variantId: null,
    productName,
    sku,
    quantity,
    purchasePrice,
  };
}
