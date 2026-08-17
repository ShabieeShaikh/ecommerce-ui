import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { InventoryService } from './inventory.service';
import { ProductService } from './product.service';
import { WarehouseService } from './warehouse.service';

describe('InventoryService', () => {
  let service: InventoryService;
  let productService: ProductService;
  let warehouseService: WarehouseService;
  const storeId = 'store-003';
  const productId = 'prod-301';
  const branchOne = 'branch-hg-001';
  const branchTwo = 'branch-hg-002';

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    service = TestBed.inject(InventoryService);
    productService = TestBed.inject(ProductService);
    warehouseService = TestBed.inject(WarehouseService);
  });

  afterEach(() => localStorage.clear());

  it('runs add, allocation, transfer, adjustment, and order workflows without losing units', () => {
    expect(service.getTotalStock(storeId)).toBe(95);

    service.addStock({
      storeId,
      productId,
      variantId: null,
      destinationLocationKey: 'store',
      quantity: 100,
      unitCost: 12,
      supplierName: 'Test Supplier',
      referenceNumber: 'STK-TEST-001',
      occurredAt: '2026-08-10',
      createdBy: 'Test User',
    });
    expect(service.getTotalStock(storeId)).toBe(195);
    expect(service.getBalance(storeId, productId, 'store').quantity).toBe(100);

    service.allocateStock({
      storeId,
      productId,
      variantId: null,
      sourceLocationKey: 'store',
      allocations: [{ branchId: branchOne, quantity: 40 }],
      referenceNumber: 'ALC-TEST-001',
      occurredAt: '2026-08-10',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, productId, 'store').quantity).toBe(60);
    expect(service.getBalance(storeId, productId, `branch:${branchOne}`).quantity).toBe(70);

    service.transferStock({
      storeId,
      productId,
      variantId: null,
      sourceLocationKey: `branch:${branchOne}`,
      destinationLocationKey: `branch:${branchTwo}`,
      quantity: 10,
      referenceNumber: 'TRF-TEST-001',
      occurredAt: '2026-08-10',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, productId, `branch:${branchOne}`).quantity).toBe(60);
    expect(service.getBalance(storeId, productId, `branch:${branchTwo}`).quantity).toBe(35);

    service.adjustStock({
      storeId,
      productId,
      variantId: null,
      locationKey: `branch:${branchTwo}`,
      adjustmentType: 'increase',
      quantity: 5,
      reason: 'Cycle Count',
      note: 'Test correction',
      referenceNumber: 'ADJ-TEST-001',
      occurredAt: '2026-08-10',
      createdBy: 'Test User',
    });
    expect(service.getTotalStock(storeId)).toBe(200);

    service.setLowStockThreshold(storeId, productId, `branch:${branchTwo}`, 45);
    expect(
      service.getDashboard(storeId).alerts.some((alert) => alert.location === 'Johar Town Store'),
    ).toBe(true);

    const order = service.createOrder({
      storeId,
      customerName: 'Inventory Test',
      branchId: branchTwo,
      productId,
      variantId: null,
      quantity: 10,
      referenceNumber: 'ORD-TEST-001',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, productId, `branch:${branchTwo}`).reservedQuantity).toBe(10);
    service.confirmOrder(order.id);
    service.shipOrder(order.id, 'Test User');
    expect(service.getTotalStock(storeId)).toBe(190);
    expect(service.getBalance(storeId, productId, `branch:${branchTwo}`).reservedQuantity).toBe(0);
    service.returnOrder(order.id, 'Test User');
    expect(service.getTotalStock(storeId)).toBe(200);
    expect(service.getTransactionsByStore(storeId).length).toBe(7);
    expect(service.getTransactionsByStore('store-001')).toHaveLength(0);
    expect(
      JSON.parse(localStorage.getItem('digishop_inventory_transactions_v1') ?? '[]'),
    ).toHaveLength(7);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideHttpClient()] });
    const reloadedService = TestBed.inject(InventoryService);
    expect(reloadedService.getTotalStock(storeId)).toBe(200);
    expect(reloadedService.getOrdersByStore(storeId)[0].status).toBe('returned');
  });

  it('synchronizes warehouse balances and preserves totals during a warehouse transfer', () => {
    const warehouse = warehouseService.createWarehouse({
      storeId,
      name: 'Test Warehouse',
      code: 'WH-TEST',
      address: '100 Test Road',
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
      managerKey: 'test-manager',
      managerName: 'Test Manager',
      managerEmail: 'manager@example.com',
      status: 'active',
    });
    service.addStock({
      storeId,
      productId,
      variantId: null,
      destinationLocationKey: `warehouse:${warehouse.id}`,
      quantity: 50,
      unitCost: 20,
      supplierName: 'Test Supplier',
      referenceNumber: 'STK-WH-001',
      occurredAt: '2026-08-10',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, productId, `warehouse:${warehouse.id}`).quantity).toBe(50);
    expect(service.getTotalStock(storeId)).toBe(145);

    service.transferStock({
      storeId,
      productId,
      variantId: null,
      sourceLocationKey: `warehouse:${warehouse.id}`,
      destinationLocationKey: `branch:${branchOne}`,
      quantity: 20,
      referenceNumber: 'TRF-WH-001',
      occurredAt: '2026-08-10',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, productId, `warehouse:${warehouse.id}`).quantity).toBe(30);
    expect(service.getBalance(storeId, productId, `branch:${branchOne}`).quantity).toBe(50);
    expect(service.getTotalStock(storeId)).toBe(145);
  });

  it('rejects additions above the store inventory limit without changing stock', () => {
    const before = service.getTotalStock(storeId);
    expect(() =>
      service.addStock({
        storeId,
        productId,
        variantId: null,
        destinationLocationKey: 'store',
        quantity: 1000,
        unitCost: 0,
        supplierName: 'Test Supplier',
        referenceNumber: 'STK-LIMIT-001',
        occurredAt: '2026-08-10',
        createdBy: 'Test User',
      }),
    ).toThrowError(/Inventory limit exceeded/);
    expect(service.getTotalStock(storeId)).toBe(before);
    expect(service.getTransactionsByStore(storeId)).toHaveLength(0);
  });

  it('releases reserved stock when an order is cancelled', () => {
    const locationKey = `branch:${branchOne}`;
    const before = service.getBalance(storeId, productId, locationKey);
    const order = service.createOrder({
      storeId,
      customerName: 'Cancellation Test',
      branchId: branchOne,
      productId,
      variantId: null,
      quantity: 5,
      referenceNumber: 'ORD-CANCEL-001',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, productId, locationKey).reservedQuantity).toBe(
      before.reservedQuantity + 5,
    );
    service.cancelOrder(order.id, 'Test User');
    const after = service.getBalance(storeId, productId, locationKey);
    expect(after.quantity).toBe(before.quantity);
    expect(after.reservedQuantity).toBe(before.reservedQuantity);
    expect(service.getOrdersByStore(storeId)[0].status).toBe('cancelled');
  });

  it('derives branch totals from product allocations instead of branch metadata', () => {
    const branchTotal = service
      .getBalances(storeId)
      .filter((balance) => balance.location.type === 'branch')
      .reduce((total, balance) => total + balance.quantity, 0);

    expect(branchTotal).toBe(95);
    expect(service.getDashboard(storeId).totalUnits).toBe(95);
  });

  it('enforces the store limit for direct warehouse receipts', () => {
    const warehouse = warehouseService.createWarehouse({
      storeId,
      name: 'Capacity Warehouse',
      code: 'WH-CAP',
      address: '200 Test Road',
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
      managerKey: 'capacity-manager',
      managerName: 'Capacity Manager',
      managerEmail: 'capacity@example.com',
      status: 'active',
    });

    expect(() =>
      service.receiveWarehouseStock({
        storeId,
        warehouseId: warehouse.id,
        supplierName: 'Capacity Supplier',
        referenceNumber: 'RCV-CAP-001',
        occurredAt: '2026-08-10',
        createdBy: 'Test User',
        lines: [{ productId, variantId: null, batchNumber: '', quantity: 906, unitCost: 1 }],
      }),
    ).toThrowError(/Inventory limit exceeded/);
    expect(service.getWarehouseStockByWarehouse(warehouse.id)).toHaveLength(0);
  });

  it('preserves reservations when product catalog details are edited', () => {
    service.createOrder({
      storeId,
      customerName: 'Reservation Test',
      branchId: branchOne,
      productId,
      variantId: null,
      quantity: 5,
      referenceNumber: 'ORD-PRODUCT-EDIT',
      createdBy: 'Test User',
    });
    const product = service.getProducts(storeId).find((item) => item.id === productId)!;
    const { id, stock, rating, salesCount, createdAt, updatedAt, ...productData } = product;
    service.updateProductWithInventory(productId, productData, [], 'Test User');
    expect(service.getBalance(storeId, productId, `branch:${branchOne}`).reservedQuantity).toBe(5);
  });

  it('blocks destructive deletes that would orphan operational data', () => {
    expect(() => service.deleteBranch(branchOne)).toThrowError(/branch stock/);
    expect(() => service.deleteProduct(productId)).toThrowError(/product stock/);
    expect(() => service.deleteStore(storeId)).toThrowError(/store inventory/);
  });

  it('adds several product variants with independent quantities in one receipt', () => {
    const product = productService.createCatalogProduct({
      storeId,
      name: 'Variant Stock Test',
      sku: 'VAR-STOCK',
      categoryId: 'Mobile Phones',
      category: 'Mobile Phones',
      price: 1000,
      status: 'active',
      imageUrl: '',
      description: 'Inventory batch test',
      tags: [],
      attributes: [],
      variants: [
        {
          sku: 'VAR-BLK-128',
          status: 'active',
          attributes: [
            { attributeDefinitionId: 'color', attributeKey: 'color', value: 'Black' },
            { attributeDefinitionId: 'storage', attributeKey: 'storage', value: '128GB' },
          ],
        },
        {
          sku: 'VAR-BLU-256',
          status: 'active',
          attributes: [
            { attributeDefinitionId: 'color', attributeKey: 'color', value: 'Blue' },
            { attributeDefinitionId: 'storage', attributeKey: 'storage', value: '256GB' },
          ],
        },
      ],
    });
    const [black, blue] = product.variants!;
    const blackId = String(black.id);
    const blueId = String(blue.id);

    const transactions = service.addStockBatch({
      storeId,
      destinationLocationKey: 'store',
      supplierName: 'Variant Supplier',
      referenceNumber: 'STK-VARIANTS-001',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
      lines: [
        { productId: product.id, variantId: blackId, quantity: 20, unitCost: 100 },
        { productId: product.id, variantId: blueId, quantity: 15, unitCost: 125 },
      ],
    });

    expect(service.getBalance(storeId, product.id, 'store', blackId).quantity).toBe(20);
    expect(service.getBalance(storeId, product.id, 'store', blueId).quantity).toBe(15);
    expect(transactions).toHaveLength(2);
    expect(
      transactions.every((transaction) => transaction.referenceNumber === 'STK-VARIANTS-001'),
    ).toBe(true);
  });

  it('does not save any batch line when one selected variant is invalid', () => {
    const product = productService.createCatalogProduct({
      storeId,
      name: 'Atomic Variant Test',
      sku: 'ATOMIC-VAR',
      categoryId: 'Fashion',
      category: 'Fashion',
      price: 50,
      status: 'active',
      imageUrl: '',
      description: '',
      tags: [],
      attributes: [],
      variants: [
        {
          sku: 'ATOMIC-S',
          status: 'active',
          attributes: [{ attributeDefinitionId: 'size', attributeKey: 'size', value: 'Small' }],
        },
        {
          sku: 'ATOMIC-M',
          status: 'active',
          attributes: [{ attributeDefinitionId: 'size', attributeKey: 'size', value: 'Medium' }],
        },
      ],
    });
    const [small, medium] = product.variants!;
    const transactionsBefore = service.getTransactionsByStore(storeId).length;

    expect(() =>
      service.addStockBatch({
        storeId,
        destinationLocationKey: 'store',
        supplierName: '',
        referenceNumber: 'STK-ATOMIC-001',
        occurredAt: '2026-08-13',
        createdBy: 'Test User',
        lines: [
          { productId: product.id, variantId: String(small.id), quantity: 10, unitCost: 10 },
          { productId: product.id, variantId: String(medium.id), quantity: 0, unitCost: 10 },
        ],
      }),
    ).toThrowError(/quantity greater than zero/);
    expect(service.getProductBalances(storeId, product.id)).toHaveLength(0);
    expect(service.getTransactionsByStore(storeId)).toHaveLength(transactionsBefore);
  });

  it('runs variant-aware warehouse receiving, transfer directions, adjustments, and history', () => {
    const sourceWarehouse = warehouseService.createWarehouse({
      storeId,
      name: 'Source Warehouse',
      code: 'WH-SOURCE',
      address: '10 Source Road',
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
      managerKey: 'source-manager',
      managerName: 'Source Manager',
      managerEmail: 'source@example.com',
      status: 'active',
    });
    const destinationWarehouse = warehouseService.createWarehouse({
      storeId,
      name: 'Destination Warehouse',
      code: 'WH-DEST',
      address: '20 Destination Road',
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
      managerKey: 'destination-manager',
      managerName: 'Destination Manager',
      managerEmail: 'destination@example.com',
      status: 'active',
    });
    const product = productService.createCatalogProduct({
      storeId,
      name: 'Warehouse Variant Product',
      sku: 'WH-VARIANT',
      categoryId: 'Mobile Phones',
      category: 'Mobile Phones',
      price: 500,
      status: 'active',
      imageUrl: '',
      description: '',
      tags: [],
      attributes: [],
      variants: [
        {
          sku: 'WH-BLK-128',
          status: 'active',
          attributes: [
            { attributeDefinitionId: 'color', attributeKey: 'color', value: 'Black' },
            { attributeDefinitionId: 'storage', attributeKey: 'storage', value: '128GB' },
          ],
        },
        {
          sku: 'WH-BLU-256',
          status: 'active',
          attributes: [
            { attributeDefinitionId: 'color', attributeKey: 'color', value: 'Blue' },
            { attributeDefinitionId: 'storage', attributeKey: 'storage', value: '256GB' },
          ],
        },
      ],
    });
    const blackId = String(product.variants![0].id);
    const blueId = String(product.variants![1].id);
    const sourceKey = `warehouse:${sourceWarehouse.id}`;
    const destinationKey = `warehouse:${destinationWarehouse.id}`;
    const branchKey = `branch:${branchOne}`;
    const initialTotal = service.getTotalStock(storeId);

    service.receiveWarehouseStock({
      storeId,
      warehouseId: sourceWarehouse.id,
      supplierName: 'Warehouse Supplier',
      referenceNumber: 'RCV-WH-FLOW-001',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
      lines: [
        {
          productId: product.id,
          variantId: blackId,
          batchNumber: 'B-1',
          quantity: 30,
          unitCost: 100,
        },
        {
          productId: product.id,
          variantId: blueId,
          batchNumber: 'B-2',
          quantity: 20,
          unitCost: 120,
        },
      ],
    });
    expect(service.getTotalStock(storeId)).toBe(initialTotal + 50);
    expect(service.getBalance(storeId, product.id, sourceKey, blackId).quantity).toBe(30);

    service.transferWarehouseStock({
      storeId,
      sourceLocationKey: sourceKey,
      destinationLocationKey: branchKey,
      referenceNumber: 'TRF-WH-BRANCH-001',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
      lines: [
        { productId: product.id, variantId: blackId, quantity: 10 },
        { productId: product.id, variantId: blueId, quantity: 5 },
      ],
    });
    expect(service.getTotalStock(storeId)).toBe(initialTotal + 50);
    expect(service.getBalance(storeId, product.id, branchKey, blackId).quantity).toBe(10);

    service.transferWarehouseStock({
      storeId,
      sourceLocationKey: sourceKey,
      destinationLocationKey: destinationKey,
      referenceNumber: 'TRF-WH-WH-001',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
      lines: [{ productId: product.id, variantId: blackId, quantity: 7 }],
    });
    service.transferWarehouseStock({
      storeId,
      sourceLocationKey: branchKey,
      destinationLocationKey: destinationKey,
      referenceNumber: 'TRF-BRANCH-WH-001',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
      lines: [{ productId: product.id, variantId: blackId, quantity: 4 }],
    });
    expect(service.getTotalStock(storeId)).toBe(initialTotal + 50);
    expect(service.getBalance(storeId, product.id, destinationKey, blackId).quantity).toBe(11);
    expect(service.getBalance(storeId, product.id, branchKey, blackId).quantity).toBe(6);

    service.adjustWarehouseStock({
      storeId,
      warehouseId: destinationWarehouse.id,
      productId: product.id,
      variantId: blackId,
      adjustmentType: 'decrease',
      quantity: 2,
      reason: 'Damaged',
      note: 'Warehouse flow test',
      referenceNumber: 'ADJ-WH-FLOW-001',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
    });
    expect(service.getBalance(storeId, product.id, destinationKey, blackId).quantity).toBe(9);
    expect(service.getTotalStock(storeId)).toBe(initialTotal + 48);
    expect(
      service
        .getWarehouseTransactionsByStore(storeId)
        .filter((item) => item.referenceNumber.startsWith('TRF-')),
    ).toHaveLength(4);
    expect(
      service
        .getWarehouseTransactionsByStore(storeId)
        .some((item) => item.referenceNumber === 'ADJ-WH-FLOW-001'),
    ).toBe(true);
    expect(localStorage.getItem('digishop_warehouse_stock_v1')).toBeNull();
  });

  it('keeps a multi-line warehouse transfer atomic when one line exceeds available stock', () => {
    const warehouse = warehouseService.createWarehouse({
      storeId,
      name: 'Atomic Warehouse',
      code: 'WH-ATOMIC',
      address: '30 Atomic Road',
      city: 'Lahore',
      state: 'Punjab',
      country: 'Pakistan',
      managerKey: 'atomic-manager',
      managerName: 'Atomic Manager',
      managerEmail: 'atomic@example.com',
      status: 'active',
    });
    const sourceKey = `warehouse:${warehouse.id}`;
    service.addStock({
      storeId,
      productId,
      variantId: null,
      destinationLocationKey: sourceKey,
      quantity: 10,
      unitCost: 5,
      supplierName: 'Atomic Supplier',
      referenceNumber: 'RCV-ATOMIC-SEED',
      occurredAt: '2026-08-13',
      createdBy: 'Test User',
    });
    const beforeTotal = service.getTotalStock(storeId);
    const beforeBranch = service.getBalance(storeId, productId, `branch:${branchOne}`).quantity;

    expect(() =>
      service.transferWarehouseStock({
        storeId,
        sourceLocationKey: sourceKey,
        destinationLocationKey: `branch:${branchOne}`,
        referenceNumber: 'TRF-ATOMIC-FAIL',
        occurredAt: '2026-08-13',
        createdBy: 'Test User',
        lines: [
          { productId, variantId: null, quantity: 4 },
          { productId, variantId: null, quantity: 20 },
        ],
      }),
    ).toThrowError(/appear only once|exceeds available/);
    expect(service.getBalance(storeId, productId, sourceKey).quantity).toBe(10);
    expect(service.getBalance(storeId, productId, `branch:${branchOne}`).quantity).toBe(
      beforeBranch,
    );
    expect(service.getTotalStock(storeId)).toBe(beforeTotal);
    expect(
      service
        .getTransactionsByStore(storeId)
        .some((item) => item.referenceNumber === 'TRF-ATOMIC-FAIL'),
    ).toBe(false);
  });
});
