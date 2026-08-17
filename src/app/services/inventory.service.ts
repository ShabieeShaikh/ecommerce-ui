import { Injectable, inject, signal } from '@angular/core';
import { Product, ProductInventoryInput, ProductUpsert } from '../models/admin.models';
import {
  AddInventoryStockBatchInput,
  AddInventoryStockInput,
  AdjustInventoryStockInput,
  AllocateInventoryStockInput,
  CreateInventoryOrderInput,
  InventoryBalance,
  InventoryBalanceView,
  InventoryLocation,
  InventoryOrder,
  InventoryOrderStatus,
  InventoryTransaction,
  InventoryTransactionType,
  TransferInventoryStockInput,
} from '../models/inventory.models';
import { ProductVariant } from '../models/product-catalog.models';
import {
  AdjustStockInput,
  ReceiveStockInput,
  TransferStockInput,
  WarehouseStock,
  WarehouseTransaction,
} from '../models/warehouse.models';
import { AuthService } from './auth';
import { BranchService } from './branch.service';
import { LocalStorageService } from './local-storage.service';
import { ProductService } from './product.service';
import { StoreService } from './store.service';
import { WarehouseService } from './warehouse.service';

const INVENTORY_BALANCES_KEY = 'digishop_inventory_balances_v1';
const INVENTORY_TRANSACTIONS_KEY = 'digishop_inventory_transactions_v1';
const INVENTORY_ORDERS_KEY = 'digishop_inventory_orders_v1';
const LEGACY_PRODUCT_INVENTORY_KEY = 'digishop_product_inventory_v1';
const LEGACY_WAREHOUSE_STOCK_KEY = 'digishop_warehouse_stock_v1';
const LOCATION_COLORS = [
  '#3478dc',
  '#2fa66a',
  '#ff9418',
  '#f04438',
  '#8a64d6',
  '#41b4c4',
  '#0f9f8f',
  '#c05bd7',
];

export interface InventoryMetric {
  label: string;
  value: number;
  unit: string;
  tone: 'purple' | 'blue' | 'green' | 'orange' | 'red' | 'teal';
  icon: 'limit' | 'stock' | 'capacity' | 'warning' | 'out' | 'unallocated';
  helper: string;
  progress?: number;
}

export interface InventoryLocationShare {
  location: string;
  units: number;
  percentage: number;
  color: string;
}
export interface InventoryStatusSummary {
  label: string;
  count: number;
  percentage: number;
  tone: 'green' | 'orange' | 'red' | 'purple';
}
export interface InventoryAlert {
  productId: string;
  variantId: string | null;
  product: string;
  variant: string;
  sku: string;
  imageUrl: string;
  location: string;
  available: number;
  threshold: number;
  status: 'Low Stock' | 'Out of Stock';
}
export interface InventoryDashboardSnapshot {
  updatedAt: string;
  limit: number;
  totalUnits: number;
  availableUnits: number;
  remainingCapacity: number;
  unallocatedUnits: number;
  reservedUnits: number;
  metrics: InventoryMetric[];
  locationShares: InventoryLocationShare[];
  statuses: InventoryStatusSummary[];
  alerts: InventoryAlert[];
  movements: InventoryTransaction[];
}

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly storage = inject(LocalStorageService);
  private readonly storeService = inject(StoreService);
  private readonly productService = inject(ProductService);
  private readonly branchService = inject(BranchService);
  private readonly warehouseService = inject(WarehouseService);
  private readonly authService = inject(AuthService);

  private readonly balancesSignal = signal<InventoryBalance[]>(this.loadBalances());
  private readonly transactionsSignal = signal<InventoryTransaction[]>(this.loadTransactions());
  private readonly ordersSignal = signal<InventoryOrder[]>(this.loadOrders());

  readonly balances = this.balancesSignal.asReadonly();
  readonly transactions = this.transactionsSignal.asReadonly();
  readonly orders = this.ordersSignal.asReadonly();

  getProducts(storeId: string): Product[] {
    return this.productService
      .getProductsByStore(storeId)
      .filter((product) => product.status !== 'archived')
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getVariants(productId: string, activeOnly = true): ProductVariant[] {
    return (this.productService.getProductById(productId)?.variants ?? [])
      .filter((variant) => !activeOnly || variant.status === 'active')
      .map((variant) => ({
        ...variant,
        attributes: variant.attributes.map((attribute) => ({ ...attribute })),
      }));
  }

  variantId(variant: ProductVariant): string {
    return String(variant.id ?? '');
  }

  variantLabel(productId: string, variantId: string | null | undefined): string {
    if (!variantId) return 'Simple product';
    const variant = this.getVariants(productId, false).find(
      (item) => this.variantId(item) === String(variantId),
    );
    return variant?.attributes.map((attribute) => attribute.value).join(' / ') || 'Unknown variant';
  }

  itemSku(productId: string, variantId: string | null | undefined): string {
    const product = this.productService.getProductById(productId);
    if (!product) return '-';
    if (!variantId) return product.sku;
    return (
      this.getVariants(productId, false).find((item) => this.variantId(item) === String(variantId))
        ?.sku ?? product.sku
    );
  }

  getLocations(storeId: string, activeOnly = true): InventoryLocation[] {
    const store = this.storeService.getStoreById(storeId);
    if (!store) return [];
    return [
      {
        key: 'store',
        storeId,
        type: 'store',
        entityId: null,
        name: 'Store Level',
        code: 'STORE',
        active: true,
      },
      ...this.branchService
        .getByStore(storeId)
        .filter((branch) => !activeOnly || branch.status === 'active')
        .map((branch) => ({
          key: `branch:${branch.id}`,
          storeId,
          type: 'branch' as const,
          entityId: branch.id,
          name: branch.name,
          code: branch.code,
          active: branch.status === 'active',
        })),
      ...this.warehouseService
        .getWarehousesByStore(storeId)
        .filter((warehouse) => !activeOnly || warehouse.status === 'active')
        .map((warehouse) => ({
          key: `warehouse:${warehouse.id}`,
          storeId,
          type: 'warehouse' as const,
          entityId: warehouse.id,
          name: warehouse.name,
          code: warehouse.code,
          active: warehouse.status === 'active',
        })),
    ];
  }

  getBalances(storeId: string): InventoryBalanceView[] {
    const productIds = new Set(
      this.productService.getProductsByStore(storeId).map((product) => product.id),
    );
    const locations = new Map(
      this.getLocations(storeId, false).map((location) => [location.key, location]),
    );
    return this.balancesSignal()
      .filter((balance) => balance.storeId === storeId && productIds.has(balance.productId))
      .flatMap((balance) => {
        const location = locations.get(balance.locationId);
        return location
          ? [
              {
                ...balance,
                location,
                availableQuantity: balance.quantity - balance.reservedQuantity,
              },
            ]
          : [];
      });
  }

  getProductBalances(
    storeId: string,
    productId: string,
    variantId?: string | null,
  ): InventoryBalanceView[] {
    return this.getBalances(storeId).filter(
      (balance) =>
        balance.productId === productId &&
        (variantId === undefined || balance.variantId === this.normalizeVariantId(variantId)),
    );
  }

  getLocationBalances(storeId: string, locationKey: string): InventoryBalanceView[] {
    return this.getBalances(storeId).filter((balance) => balance.locationId === locationKey);
  }

  getBalance(
    storeId: string,
    productId: string,
    locationKey: string,
    variantId: string | null = null,
  ): InventoryBalanceView {
    const location = this.requireLocation(storeId, locationKey);
    const normalizedVariantId = this.normalizeVariantId(variantId);
    const existing = this.getBalances(storeId).find(
      (balance) =>
        balance.productId === productId &&
        balance.variantId === normalizedVariantId &&
        balance.locationId === locationKey,
    );
    return (
      existing ?? {
        id: '',
        storeId,
        productId,
        variantId: normalizedVariantId,
        locationId: locationKey,
        location,
        quantity: 0,
        reservedQuantity: 0,
        availableQuantity: 0,
        lowStockThreshold: 10,
        averageUnitCost: 0,
        createdAt: '',
        updatedAt: '',
      }
    );
  }

  getTotalStock(storeId: string): number {
    return this.getBalances(storeId).reduce((total, balance) => total + balance.quantity, 0);
  }
  getCapacityUsedOutsideProductAllocations(storeId: string, productId?: string): number {
    return this.getBalances(storeId)
      .filter((balance) => !productId || balance.productId !== productId)
      .reduce((total, balance) => total + balance.quantity, 0);
  }
  getTransactionsByStore(storeId: string): InventoryTransaction[] {
    return this.transactionsSignal()
      .filter((transaction) => transaction.storeId === storeId)
      .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  }
  getOrdersByStore(storeId: string): InventoryOrder[] {
    return this.ordersSignal()
      .filter((order) => order.storeId === storeId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  getWarehouseStocks(storeId?: string): WarehouseStock[] {
    return this.balancesSignal()
      .filter(
        (balance) =>
          balance.locationId.startsWith('warehouse:') && (!storeId || balance.storeId === storeId),
      )
      .map((balance) => ({
        id: balance.id,
        storeId: balance.storeId,
        warehouseId: balance.locationId.slice('warehouse:'.length),
        productId: balance.productId,
        variantId: balance.variantId,
        quantity: balance.quantity,
        reservedQuantity: balance.reservedQuantity,
        lowStockThreshold: balance.lowStockThreshold,
        averageUnitCost: balance.averageUnitCost,
        updatedAt: balance.updatedAt,
      }));
  }

  getWarehouseStockByWarehouse(warehouseId: string): WarehouseStock[] {
    return this.getWarehouseStocks().filter((stock) => stock.warehouseId === warehouseId);
  }

  getWarehouseStock(
    warehouseId: string,
    productId: string,
    variantId: string | null = null,
  ): WarehouseStock | undefined {
    return this.getWarehouseStocks().find(
      (stock) =>
        stock.warehouseId === warehouseId &&
        stock.productId === productId &&
        stock.variantId === this.normalizeVariantId(variantId),
    );
  }

  getWarehouseTransactionsByStore(storeId: string): WarehouseTransaction[] {
    return this.getTransactionsByStore(storeId).flatMap((transaction) => {
      const warehouseKey = [transaction.sourceLocationKey, transaction.destinationLocationKey].find(
        (key) => key?.startsWith('warehouse:'),
      );
      if (!warehouseKey || !['receive', 'transfer', 'adjustment'].includes(transaction.type))
        return [];
      const warehouseId = warehouseKey.slice('warehouse:'.length);
      return [
        {
          id: transaction.id,
          storeId,
          warehouseId,
          type:
            transaction.type === 'receive'
              ? ('receive' as const)
              : transaction.type === 'transfer'
                ? ('transfer' as const)
                : ('adjustment' as const),
          referenceNumber: transaction.referenceNumber,
          occurredAt: transaction.occurredAt,
          supplierName: transaction.type === 'receive' ? transaction.note : undefined,
          branchId: transaction.destinationLocationKey?.startsWith('branch:')
            ? transaction.destinationLocationKey.slice('branch:'.length)
            : undefined,
          sourceLocationKey: transaction.sourceLocationKey,
          destinationLocationKey: transaction.destinationLocationKey,
          adjustmentType:
            transaction.type === 'adjustment'
              ? transaction.quantity > 0
                ? ('increase' as const)
                : ('decrease' as const)
              : undefined,
          reason: transaction.reason,
          note: transaction.note,
          lines: [
            {
              productId: transaction.productId,
              variantId: transaction.variantId,
              batchNumber: transaction.batchNumber ?? '',
              quantity: transaction.quantity,
              unitCost: transaction.unitCost ?? 0,
              previousQuantity:
                transaction.sourceBeforeQuantity ?? transaction.destinationBeforeQuantity ?? 0,
              newQuantity:
                transaction.sourceAfterQuantity ?? transaction.destinationAfterQuantity ?? 0,
            },
          ],
          totalCost: Math.abs(transaction.quantity) * (transaction.unitCost ?? 0),
          createdBy: transaction.createdBy,
          createdAt: transaction.createdAt,
        },
      ];
    });
  }

  getWarehouseSuppliersByStore(storeId: string): string[] {
    return [
      ...new Set(
        this.getWarehouseTransactionsByStore(storeId)
          .filter((item) => item.type === 'receive')
          .map((item) => item.supplierName?.trim())
          .filter((name): name is string => !!name),
      ),
    ].sort();
  }

  getDashboard(storeId: string): InventoryDashboardSnapshot {
    const balances = this.getBalances(storeId);
    const totalUnits = balances.reduce((total, balance) => total + balance.quantity, 0);
    const reservedUnits = balances.reduce((total, balance) => total + balance.reservedQuantity, 0);
    const availableUnits = totalUnits - reservedUnits;
    const limit = this.storeService.getStoreById(storeId)?.inventoryAllocationLimit ?? 0;
    const remainingCapacity = Math.max(0, limit - totalUnits);
    const unallocatedUnits = balances
      .filter((balance) => balance.location.type === 'store')
      .reduce((total, balance) => total + balance.quantity, 0);
    const lowBalances = balances.filter(
      (balance) =>
        balance.availableQuantity > 0 && balance.availableQuantity <= balance.lowStockThreshold,
    );
    const outBalances = balances.filter((balance) => balance.availableQuantity <= 0);
    const usage = limit ? Math.min(100, (totalUnits / limit) * 100) : 0;
    const locationTotals = new Map<string, { name: string; units: number }>();
    balances.forEach((balance) => {
      const item = locationTotals.get(balance.locationId) ?? {
        name: balance.location.name,
        units: 0,
      };
      item.units += balance.quantity;
      locationTotals.set(balance.locationId, item);
    });
    const locationShares = [...locationTotals.values()]
      .filter((item) => item.units > 0)
      .sort((a, b) => b.units - a.units)
      .map((item, index) => ({
        location: item.name,
        units: item.units,
        percentage: totalUnits ? Number(((item.units / totalUnits) * 100).toFixed(1)) : 0,
        color: LOCATION_COLORS[index % LOCATION_COLORS.length],
      }));
    const products = new Map(this.getProducts(storeId).map((product) => [product.id, product]));
    const alerts = [...outBalances, ...lowBalances]
      .flatMap((balance) => {
        const product = products.get(balance.productId);
        return product
          ? [
              {
                productId: product.id,
                variantId: balance.variantId,
                product: product.name,
                variant: this.variantLabel(product.id, balance.variantId),
                sku: this.itemSku(product.id, balance.variantId),
                imageUrl: product.imageUrl,
                location: balance.location.name,
                available: balance.availableQuantity,
                threshold: balance.lowStockThreshold,
                status:
                  balance.availableQuantity <= 0
                    ? ('Out of Stock' as const)
                    : ('Low Stock' as const),
              },
            ]
          : [];
      })
      .slice(0, 8);
    const statusRows: Array<{
      label: string;
      count: number;
      tone: InventoryStatusSummary['tone'];
    }> = [
      {
        label: 'In Stock',
        count: balances.filter((balance) => balance.availableQuantity > balance.lowStockThreshold)
          .length,
        tone: 'green',
      },
      { label: 'Low Stock', count: lowBalances.length, tone: 'orange' },
      { label: 'Out of Stock', count: outBalances.length, tone: 'red' },
      {
        label: 'Reserved',
        count: balances.filter((balance) => balance.reservedQuantity > 0).length,
        tone: 'purple',
      },
    ];
    const tracked = Math.max(1, balances.length);
    return {
      updatedAt:
        this.getTransactionsByStore(storeId)[0]?.createdAt ??
        balances
          .map((balance) => balance.updatedAt)
          .sort()
          .at(-1) ??
        new Date().toISOString(),
      limit,
      totalUnits,
      availableUnits,
      remainingCapacity,
      unallocatedUnits,
      reservedUnits,
      metrics: [
        {
          label: 'Inventory Limit',
          value: limit,
          unit: 'Units',
          tone: 'purple',
          icon: 'limit',
          helper: 'Store-wide capacity',
        },
        {
          label: 'Total Stock',
          value: totalUnits,
          unit: 'Units',
          tone: 'blue',
          icon: 'stock',
          helper: `${usage.toFixed(1)}% of limit`,
          progress: usage,
        },
        {
          label: 'Available Stock',
          value: availableUnits,
          unit: 'Units',
          tone: 'green',
          icon: 'capacity',
          helper: `${reservedUnits.toLocaleString()} reserved`,
        },
        {
          label: 'Low Stock Items',
          value: new Set(
            lowBalances.map((balance) => `${balance.productId}:${balance.variantId ?? ''}`),
          ).size,
          unit: 'Items',
          tone: 'orange',
          icon: 'warning',
          helper: `${lowBalances.length} location alerts`,
        },
        {
          label: 'Out of Stock Items',
          value: new Set(
            outBalances.map((balance) => `${balance.productId}:${balance.variantId ?? ''}`),
          ).size,
          unit: 'Items',
          tone: 'red',
          icon: 'out',
          helper: `${outBalances.length} location alerts`,
        },
        {
          label: 'Unallocated Stock',
          value: unallocatedUnits,
          unit: 'Units',
          tone: 'teal',
          icon: 'unallocated',
          helper: `${remainingCapacity.toLocaleString()} capacity remaining`,
        },
      ],
      locationShares,
      statuses: statusRows.map((status) => ({
        ...status,
        percentage: Number(((status.count / tracked) * 100).toFixed(1)),
      })),
      alerts,
      movements: this.getTransactionsByStore(storeId).slice(0, 8),
    };
  }

  addStock(input: AddInventoryStockInput): InventoryTransaction {
    return this.addStockBatch({
      storeId: input.storeId,
      destinationLocationKey: input.destinationLocationKey,
      supplierName: input.supplierName,
      referenceNumber: input.referenceNumber,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy,
      lines: [
        {
          productId: input.productId,
          variantId: input.variantId,
          quantity: input.quantity,
          unitCost: input.unitCost,
        },
      ],
    })[0];
  }

  addStockBatch(input: AddInventoryStockBatchInput): InventoryTransaction[] {
    const destination = this.requireLocation(input.storeId, input.destinationLocationKey);
    this.assertReference(input.storeId, input.referenceNumber);
    if (destination.type === 'warehouse' && !input.supplierName.trim()) {
      throw new Error('Supplier is required for a warehouse receipt.');
    }
    if (!input.lines.length) throw new Error('Select at least one product variant.');

    const itemKeys = new Set<string>();
    const lines = input.lines.map((line) => {
      const variantId = this.requireItem(input.storeId, line.productId, line.variantId);
      const quantity = this.positiveInteger(
        line.quantity,
        'Enter a quantity greater than zero for every selected variant.',
      );
      const unitCost = Number(line.unitCost) || 0;
      if (unitCost < 0) throw new Error('Unit cost cannot be negative.');
      const itemKey = `${line.productId}:${variantId ?? 'simple'}`;
      if (itemKeys.has(itemKey))
        throw new Error('Each product variant can appear only once in a stock receipt.');
      itemKeys.add(itemKey);
      return { ...line, variantId, quantity, unitCost };
    });

    const totalQuantity = lines.reduce((total, line) => total + line.quantity, 0);
    this.assertCapacity(input.storeId, totalQuantity);

    const timestamp = new Date().toISOString();
    const referenceNumber = input.referenceNumber.trim().toUpperCase();
    let nextBalances = this.balancesSignal().map((balance) => ({ ...balance }));
    const transactions: InventoryTransaction[] = [];

    lines.forEach((line) => {
      const existingIndex = nextBalances.findIndex(
        (balance) =>
          balance.storeId === input.storeId &&
          balance.productId === line.productId &&
          balance.variantId === line.variantId &&
          balance.locationId === destination.key,
      );
      const existing = existingIndex >= 0 ? nextBalances[existingIndex] : undefined;
      const previousQuantity = existing?.quantity ?? 0;
      const nextQuantity = previousQuantity + line.quantity;
      const averageUnitCost =
        line.unitCost > 0
          ? (previousQuantity * (existing?.averageUnitCost ?? 0) + line.quantity * line.unitCost) /
            nextQuantity
          : (existing?.averageUnitCost ?? 0);
      const updatedBalance: InventoryBalance = existing
        ? { ...existing, quantity: nextQuantity, averageUnitCost, updatedAt: timestamp }
        : {
            id: this.createId('inventory-balance'),
            storeId: input.storeId,
            productId: line.productId,
            variantId: line.variantId,
            locationId: destination.key,
            quantity: nextQuantity,
            reservedQuantity: 0,
            lowStockThreshold: 10,
            averageUnitCost,
            createdAt: timestamp,
            updatedAt: timestamp,
          };

      if (existingIndex >= 0) nextBalances[existingIndex] = updatedBalance;
      else nextBalances = [updatedBalance, ...nextBalances];

      transactions.push({
        id: this.createId('inventory-transaction'),
        storeId: input.storeId,
        productId: line.productId,
        variantId: line.variantId,
        type: destination.type === 'warehouse' ? 'receive' : 'add',
        quantity: line.quantity,
        unitCost: line.unitCost,
        batchNumber: line.batchNumber?.trim() ?? '',
        sourceLocationKey: null,
        destinationLocationKey: destination.key,
        sourceBeforeQuantity: null,
        sourceAfterQuantity: null,
        destinationBeforeQuantity: previousQuantity,
        destinationAfterQuantity: nextQuantity,
        referenceNumber,
        reason: destination.type === 'warehouse' ? 'Warehouse receipt' : 'Stock added',
        note: input.supplierName.trim(),
        occurredAt: input.occurredAt,
        createdBy: input.createdBy,
        createdAt: timestamp,
      });
    });

    this.commitStockReceipt(nextBalances, [...transactions, ...this.transactionsSignal()]);
    return transactions;
  }

  allocateStock(input: AllocateInventoryStockInput): InventoryTransaction[] {
    const variantId = this.requireItem(input.storeId, input.productId, input.variantId);
    const source = this.requireLocation(input.storeId, input.sourceLocationKey);
    if (source.type === 'branch')
      throw new Error('Use Stock Transfer when moving stock from a branch.');
    this.assertReference(input.storeId, input.referenceNumber);
    const allocations = input.allocations
      .map((item) => ({ ...item, quantity: Math.max(0, Math.trunc(Number(item.quantity) || 0)) }))
      .filter((item) => item.quantity > 0);
    if (!allocations.length) throw new Error('Allocate stock to at least one branch.');
    const branchIds = new Set<string>();
    allocations.forEach((item) => {
      if (branchIds.has(item.branchId)) throw new Error('Each branch can appear only once.');
      branchIds.add(item.branchId);
      this.requireLocation(input.storeId, `branch:${item.branchId}`);
    });
    const total = allocations.reduce((sum, item) => sum + item.quantity, 0);
    const sourceBefore = this.getBalance(input.storeId, input.productId, source.key, variantId);
    if (total > sourceBefore.availableQuantity)
      throw new Error('The allocation exceeds available source stock.');
    this.changeBalance(input.storeId, input.productId, variantId, source.key, -total);
    let remainingSource = sourceBefore.quantity;
    return allocations.map((item) => {
      const destinationKey = `branch:${item.branchId}`;
      const destinationBefore = this.getBalance(
        input.storeId,
        input.productId,
        destinationKey,
        variantId,
      );
      const beforeSource = remainingSource;
      remainingSource -= item.quantity;
      this.changeBalance(input.storeId, input.productId, variantId, destinationKey, item.quantity);
      return this.recordTransaction({
        ...input,
        variantId,
        quantity: item.quantity,
        type: 'allocate',
        sourceLocationKey: source.key,
        destinationLocationKey: destinationKey,
        sourceBeforeQuantity: beforeSource,
        sourceAfterQuantity: remainingSource,
        destinationBeforeQuantity: destinationBefore.quantity,
        destinationAfterQuantity: destinationBefore.quantity + item.quantity,
        reason: 'Branch allocation',
        note: '',
      });
    });
  }

  transferStock(input: TransferInventoryStockInput): InventoryTransaction {
    const quantity = this.positiveInteger(
      input.quantity,
      'Enter a transfer quantity greater than zero.',
    );
    const variantId = this.requireItem(input.storeId, input.productId, input.variantId);
    const source = this.requireLocation(input.storeId, input.sourceLocationKey);
    const destination = this.requireLocation(input.storeId, input.destinationLocationKey);
    if (source.key === destination.key)
      throw new Error('Source and destination must be different.');
    this.assertReference(input.storeId, input.referenceNumber);
    const sourceBefore = this.getBalance(input.storeId, input.productId, source.key, variantId);
    const destinationBefore = this.getBalance(
      input.storeId,
      input.productId,
      destination.key,
      variantId,
    );
    if (quantity > sourceBefore.availableQuantity)
      throw new Error('The transfer exceeds available source stock.');
    this.changeBalance(input.storeId, input.productId, variantId, source.key, -quantity);
    this.changeBalance(input.storeId, input.productId, variantId, destination.key, quantity);
    return this.recordTransaction({
      ...input,
      variantId,
      quantity,
      type: 'transfer',
      sourceLocationKey: source.key,
      destinationLocationKey: destination.key,
      sourceBeforeQuantity: sourceBefore.quantity,
      sourceAfterQuantity: sourceBefore.quantity - quantity,
      destinationBeforeQuantity: destinationBefore.quantity,
      destinationAfterQuantity: destinationBefore.quantity + quantity,
      reason: 'Stock transfer',
      note: '',
    });
  }

  adjustStock(input: AdjustInventoryStockInput): InventoryTransaction {
    const quantity = this.positiveInteger(
      input.quantity,
      'Enter an adjustment quantity greater than zero.',
    );
    const variantId = this.requireItem(input.storeId, input.productId, input.variantId);
    const location = this.requireLocation(input.storeId, input.locationKey);
    this.assertReference(input.storeId, input.referenceNumber);
    if (!input.reason.trim()) throw new Error('Select an adjustment reason.');
    const before = this.getBalance(input.storeId, input.productId, location.key, variantId);
    const delta = input.adjustmentType === 'increase' ? quantity : -quantity;
    const after = before.quantity + delta;
    if (after < before.reservedQuantity)
      throw new Error('Adjusted stock cannot be below reserved stock.');
    if (delta > 0) this.assertCapacity(input.storeId, delta);
    this.changeBalance(input.storeId, input.productId, variantId, location.key, delta);
    return this.recordTransaction({
      ...input,
      variantId,
      quantity: delta,
      type: 'adjustment',
      sourceLocationKey: delta < 0 ? location.key : null,
      destinationLocationKey: delta > 0 ? location.key : null,
      sourceBeforeQuantity: delta < 0 ? before.quantity : null,
      sourceAfterQuantity: delta < 0 ? after : null,
      destinationBeforeQuantity: delta > 0 ? before.quantity : null,
      destinationAfterQuantity: delta > 0 ? after : null,
    });
  }

  setLowStockThreshold(
    storeId: string,
    productId: string,
    locationKey: string,
    threshold: number,
    variantId: string | null = null,
  ): void {
    const normalizedVariantId = this.requireItem(storeId, productId, variantId);
    this.requireLocation(storeId, locationKey);
    const value = Math.max(0, Math.trunc(Number(threshold) || 0));
    const existing = this.findRawBalance(storeId, productId, normalizedVariantId, locationKey);
    if (!existing)
      this.changeBalance(storeId, productId, normalizedVariantId, locationKey, 0, 0, value);
    else
      this.commitBalances(
        this.balancesSignal().map((balance) =>
          balance.id === existing.id
            ? { ...balance, lowStockThreshold: value, updatedAt: new Date().toISOString() }
            : balance,
        ),
      );
  }

  updateInventoryLimit(storeId: string, limit: number): void {
    const value = this.positiveInteger(limit, 'Inventory limit must be greater than zero.');
    const total = this.getTotalStock(storeId);
    if (value < total)
      throw new Error(
        `Inventory limit cannot be below the current stock of ${total.toLocaleString()} units.`,
      );
    this.storeService.updateStore(storeId, { inventoryAllocationLimit: value });
  }

  receiveWarehouseStock(input: ReceiveStockInput): WarehouseTransaction {
    const transactions = this.addStockBatch({
      storeId: input.storeId,
      destinationLocationKey: `warehouse:${input.warehouseId}`,
      supplierName: input.supplierName,
      referenceNumber: input.referenceNumber,
      occurredAt: input.occurredAt,
      createdBy: input.createdBy,
      lines: input.lines.map((line) => ({
        productId: line.productId,
        variantId: line.variantId,
        quantity: line.quantity,
        unitCost: line.unitCost,
        batchNumber: line.batchNumber,
      })),
    });
    const lines = transactions.map((transaction, index) => ({
      ...input.lines[index],
      variantId: transaction.variantId,
      previousQuantity: transaction.destinationBeforeQuantity ?? 0,
      newQuantity: transaction.destinationAfterQuantity ?? 0,
    }));
    return this.toWarehouseTransaction(input, 'receive', lines);
  }

  transferWarehouseStock(input: TransferStockInput): WarehouseTransaction {
    const transactions = this.transferStockBatch(input);
    const lines = transactions.map((transaction, index) => ({
      ...input.lines[index],
      variantId: transaction.variantId,
      batchNumber: '',
      unitCost: 0,
      previousQuantity: transaction.sourceBeforeQuantity ?? 0,
      newQuantity: transaction.sourceAfterQuantity ?? 0,
    }));
    return this.toWarehouseTransaction(input, 'transfer', lines);
  }

  transferStockBatch(input: TransferStockInput): InventoryTransaction[] {
    const source = this.requireLocation(input.storeId, input.sourceLocationKey);
    const destination = this.requireLocation(input.storeId, input.destinationLocationKey);
    if (source.key === destination.key)
      throw new Error('Source and destination must be different.');
    if (source.type !== 'warehouse' && destination.type !== 'warehouse') {
      throw new Error('A warehouse operation must include at least one warehouse location.');
    }
    this.assertReference(input.storeId, input.referenceNumber);
    if (!input.lines.length) throw new Error('Add at least one stock transfer line.');

    const itemKeys = new Set<string>();
    const lines = input.lines.map((line) => {
      const variantId = this.requireItem(input.storeId, line.productId, line.variantId);
      const quantity = this.positiveInteger(
        line.quantity,
        'Every transfer quantity must be greater than zero.',
      );
      const itemKey = `${line.productId}:${variantId ?? 'simple'}`;
      if (itemKeys.has(itemKey))
        throw new Error('Each product variant can appear only once in a transfer.');
      itemKeys.add(itemKey);
      return { ...line, variantId, quantity };
    });

    const timestamp = new Date().toISOString();
    const referenceNumber = input.referenceNumber.trim().toUpperCase();
    let nextBalances = this.balancesSignal().map((balance) => ({ ...balance }));
    const transactions: InventoryTransaction[] = [];

    lines.forEach((line) => {
      const sourceIndex = nextBalances.findIndex(
        (balance) =>
          balance.storeId === input.storeId &&
          balance.productId === line.productId &&
          balance.variantId === line.variantId &&
          balance.locationId === source.key,
      );
      const sourceBalance = sourceIndex >= 0 ? nextBalances[sourceIndex] : undefined;
      const sourceAvailable =
        (sourceBalance?.quantity ?? 0) - (sourceBalance?.reservedQuantity ?? 0);
      if (line.quantity > sourceAvailable) {
        throw new Error(
          `${this.itemSku(line.productId, line.variantId)} exceeds available source stock.`,
        );
      }
      const destinationIndex = nextBalances.findIndex(
        (balance) =>
          balance.storeId === input.storeId &&
          balance.productId === line.productId &&
          balance.variantId === line.variantId &&
          balance.locationId === destination.key,
      );
      const destinationBalance = destinationIndex >= 0 ? nextBalances[destinationIndex] : undefined;
      const sourceAfter = (sourceBalance?.quantity ?? 0) - line.quantity;
      const destinationBefore = destinationBalance?.quantity ?? 0;
      const destinationAfter = destinationBefore + line.quantity;
      const sourceCost = sourceBalance?.averageUnitCost ?? 0;
      const destinationCost =
        (destinationBefore * (destinationBalance?.averageUnitCost ?? 0) +
          line.quantity * sourceCost) /
        destinationAfter;
      nextBalances[sourceIndex] = {
        ...sourceBalance!,
        quantity: sourceAfter,
        updatedAt: timestamp,
      };
      const updatedDestination: InventoryBalance = destinationBalance
        ? {
            ...destinationBalance,
            quantity: destinationAfter,
            averageUnitCost: destinationCost,
            updatedAt: timestamp,
          }
        : {
            id: this.createId('inventory-balance'),
            storeId: input.storeId,
            productId: line.productId,
            variantId: line.variantId,
            locationId: destination.key,
            quantity: destinationAfter,
            reservedQuantity: 0,
            lowStockThreshold: 10,
            averageUnitCost: destinationCost,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
      if (destinationIndex >= 0) nextBalances[destinationIndex] = updatedDestination;
      else nextBalances = [updatedDestination, ...nextBalances];
      transactions.push({
        id: this.createId('inventory-transaction'),
        storeId: input.storeId,
        productId: line.productId,
        variantId: line.variantId,
        type: 'transfer',
        quantity: line.quantity,
        sourceLocationKey: source.key,
        destinationLocationKey: destination.key,
        sourceBeforeQuantity: sourceBalance?.quantity ?? 0,
        sourceAfterQuantity: sourceAfter,
        destinationBeforeQuantity: destinationBefore,
        destinationAfterQuantity: destinationAfter,
        referenceNumber,
        reason: 'Stock transfer',
        note: '',
        occurredAt: input.occurredAt,
        createdBy: input.createdBy,
        createdAt: timestamp,
      });
    });
    this.commitStockReceipt(nextBalances, [...transactions, ...this.transactionsSignal()]);
    return transactions;
  }

  adjustWarehouseStock(input: AdjustStockInput): WarehouseTransaction {
    const variantId = this.requireItem(input.storeId, input.productId, input.variantId);
    const before = this.getBalance(
      input.storeId,
      input.productId,
      `warehouse:${input.warehouseId}`,
      variantId,
    );
    this.adjustStock({
      ...input,
      variantId,
      locationKey: `warehouse:${input.warehouseId}`,
      adjustmentType: input.adjustmentType,
    });
    const after = this.getBalance(
      input.storeId,
      input.productId,
      `warehouse:${input.warehouseId}`,
      variantId,
    );
    return this.toWarehouseTransaction(input, 'adjustment', [
      {
        productId: input.productId,
        variantId,
        batchNumber: '',
        quantity: after.quantity - before.quantity,
        unitCost: 0,
        previousQuantity: before.quantity,
        newQuantity: after.quantity,
      },
    ]);
  }

  createProduct(
    data: ProductUpsert,
    inventory: ProductInventoryInput[],
    createdBy: string,
  ): Product {
    const product = this.productService.createCatalogProduct(data);
    inventory
      .filter((item) => item.quantity > 0)
      .forEach((item, index) =>
        this.addStock({
          storeId: data.storeId,
          productId: product.id,
          variantId: null,
          destinationLocationKey: item.branchId ? `branch:${item.branchId}` : 'store',
          quantity: item.quantity,
          unitCost: 0,
          supplierName: 'Opening stock',
          referenceNumber: `OPEN-${product.id}-${index + 1}`,
          occurredAt: new Date().toISOString(),
          createdBy,
        }),
      );
    return product;
  }

  updateProductWithInventory(
    id: string,
    data: ProductUpsert,
    _inventory: ProductInventoryInput[],
    _createdBy: string,
  ): Product {
    const updated = this.productService.updateCatalogProduct(id, data);
    if (!updated) throw new Error('Product not found.');
    return updated;
  }

  deleteBranch(branchId: string): void {
    const locationId = `branch:${branchId}`;
    if (
      this.balancesSignal().some(
        (balance) =>
          balance.locationId === locationId &&
          (balance.quantity > 0 || balance.reservedQuantity > 0),
      )
    )
      throw new Error('Move all branch stock before deleting this branch.');
    if (
      this.transactionsSignal().some(
        (transaction) =>
          transaction.sourceLocationKey === locationId ||
          transaction.destinationLocationKey === locationId,
      )
    )
      throw new Error(
        'Branches with inventory history should be marked inactive instead of deleted.',
      );
    this.branchService.delete(branchId);
  }

  deleteWarehouse(warehouseId: string): void {
    const warehouse = this.warehouseService.getWarehouse(warehouseId);
    if (!warehouse) throw new Error('The selected warehouse could not be found.');
    const locationId = `warehouse:${warehouseId}`;
    if (
      this.balancesSignal().some(
        (balance) =>
          balance.locationId === locationId &&
          (balance.quantity > 0 || balance.reservedQuantity > 0),
      )
    ) {
      throw new Error('Move or adjust all warehouse stock to zero before deleting this warehouse.');
    }
    if (
      this.transactionsSignal().some(
        (transaction) =>
          transaction.sourceLocationKey === locationId ||
          transaction.destinationLocationKey === locationId,
      )
    ) {
      throw new Error(
        'Warehouses with inventory history should be marked inactive instead of deleted.',
      );
    }
    this.commitBalances(
      this.balancesSignal().filter((balance) => balance.locationId !== locationId),
    );
    this.warehouseService.deleteWarehouse(warehouseId);
  }

  deleteProduct(productId: string): void {
    if (
      this.balancesSignal().some(
        (balance) =>
          balance.productId === productId && (balance.quantity > 0 || balance.reservedQuantity > 0),
      )
    )
      throw new Error('Move or adjust all product stock to zero before deleting this product.');
    if (this.transactionsSignal().some((transaction) => transaction.productId === productId))
      throw new Error('Products with inventory history should be archived instead of deleted.');
    this.commitBalances(this.balancesSignal().filter((balance) => balance.productId !== productId));
    this.productService.deleteProduct(productId);
  }

  deleteStore(storeId: string): void {
    if (
      this.getBalances(storeId).some(
        (balance) => balance.quantity > 0 || balance.reservedQuantity > 0,
      )
    )
      throw new Error('Move or adjust all store inventory to zero before deleting this store.');
    if (
      this.branchService.getByStore(storeId).length ||
      this.productService.getProductsByStore(storeId).length ||
      this.warehouseService.getWarehousesByStore(storeId).length
    )
      throw new Error(
        "Remove or archive this store's branches, products, and warehouses before deleting it.",
      );
    this.storeService.deleteStore(storeId);
  }

  createOrder(input: CreateInventoryOrderInput): InventoryOrder {
    const quantity = this.positiveInteger(
      input.quantity,
      'Order quantity must be greater than zero.',
    );
    const variantId = this.requireItem(input.storeId, input.productId, input.variantId);
    const locationId = `branch:${input.branchId}`;
    this.requireLocation(input.storeId, locationId);
    if (!input.customerName.trim() || !input.referenceNumber.trim())
      throw new Error('Customer name and order reference are required.');
    const before = this.getBalance(input.storeId, input.productId, locationId, variantId);
    if (quantity > before.availableQuantity)
      throw new Error('Order quantity exceeds available branch stock.');
    this.changeReserved(input.storeId, input.productId, variantId, locationId, quantity);
    const timestamp = new Date().toISOString();
    const order: InventoryOrder = {
      ...input,
      variantId,
      id: this.createId('inventory-order'),
      referenceNumber: input.referenceNumber.trim().toUpperCase(),
      customerName: input.customerName.trim(),
      quantity,
      status: 'reserved',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.commitOrders([order, ...this.ordersSignal()]);
    this.recordTransaction({
      ...input,
      variantId,
      type: 'reserve',
      quantity,
      sourceLocationKey: locationId,
      destinationLocationKey: null,
      sourceBeforeQuantity: before.quantity,
      sourceAfterQuantity: before.quantity,
      destinationBeforeQuantity: null,
      destinationAfterQuantity: null,
      reason: 'Order reservation',
      note: input.customerName,
      occurredAt: timestamp,
    });
    return order;
  }

  confirmOrder(orderId: string): InventoryOrder {
    return this.changeOrderStatus(orderId, ['reserved'], 'confirmed');
  }
  shipOrder(orderId: string, createdBy: string): InventoryOrder {
    const order = this.requireOrder(orderId);
    const locationId = `branch:${order.branchId}`;
    const before = this.getBalance(order.storeId, order.productId, locationId, order.variantId);
    this.changeReserved(
      order.storeId,
      order.productId,
      order.variantId,
      locationId,
      -order.quantity,
    );
    this.changeBalance(
      order.storeId,
      order.productId,
      order.variantId,
      locationId,
      -order.quantity,
    );
    const updated = this.changeOrderStatus(orderId, ['reserved', 'confirmed'], 'shipped');
    this.recordTransaction({
      ...order,
      type: 'sale',
      sourceLocationKey: locationId,
      destinationLocationKey: null,
      sourceBeforeQuantity: before.quantity,
      sourceAfterQuantity: before.quantity - order.quantity,
      destinationBeforeQuantity: null,
      destinationAfterQuantity: null,
      reason: 'Order shipped',
      note: order.customerName,
      occurredAt: new Date().toISOString(),
      createdBy,
    });
    return updated;
  }
  cancelOrder(orderId: string, createdBy: string): InventoryOrder {
    const order = this.requireOrder(orderId);
    this.changeReserved(
      order.storeId,
      order.productId,
      order.variantId,
      `branch:${order.branchId}`,
      -order.quantity,
    );
    const updated = this.changeOrderStatus(orderId, ['reserved', 'confirmed'], 'cancelled');
    this.recordTransaction({
      ...order,
      type: 'release',
      sourceLocationKey: `branch:${order.branchId}`,
      destinationLocationKey: null,
      sourceBeforeQuantity: order.quantity,
      sourceAfterQuantity: 0,
      destinationBeforeQuantity: null,
      destinationAfterQuantity: null,
      reason: 'Reservation released',
      note: order.customerName,
      occurredAt: new Date().toISOString(),
      createdBy,
    });
    return updated;
  }
  returnOrder(orderId: string, createdBy: string): InventoryOrder {
    const order = this.requireOrder(orderId);
    if (order.status !== 'shipped') throw new Error('Only shipped orders can be returned.');
    const locationId = `branch:${order.branchId}`;
    const before = this.getBalance(order.storeId, order.productId, locationId, order.variantId);
    this.assertCapacity(order.storeId, order.quantity);
    this.changeBalance(order.storeId, order.productId, order.variantId, locationId, order.quantity);
    const updated = this.changeOrderStatus(orderId, ['shipped'], 'returned');
    this.recordTransaction({
      ...order,
      type: 'return',
      sourceLocationKey: null,
      destinationLocationKey: locationId,
      sourceBeforeQuantity: null,
      sourceAfterQuantity: null,
      destinationBeforeQuantity: before.quantity,
      destinationAfterQuantity: before.quantity + order.quantity,
      reason: 'Order return',
      note: order.customerName,
      occurredAt: new Date().toISOString(),
      createdBy,
    });
    return updated;
  }

  createReference(prefix: 'STK' | 'ALC' | 'TRF' | 'ADJ' | 'ORD'): string {
    return `${prefix}-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${(this.transactionsSignal().length + 1).toString().padStart(4, '0')}`;
  }
  locationName(storeId: string, locationKey: string | null): string {
    return locationKey
      ? (this.getLocations(storeId, false).find((location) => location.key === locationKey)?.name ??
          'Unknown location')
      : '-';
  }
  currentUserName(): string {
    return this.authService.getCurrentUser()?.name ?? 'Store Admin';
  }

  private changeBalance(
    storeId: string,
    productId: string,
    variantId: string | null,
    locationId: string,
    delta: number,
    unitCost = 0,
    threshold = 10,
  ): InventoryBalance {
    const existing = this.findRawBalance(storeId, productId, variantId, locationId);
    const nextQuantity = (existing?.quantity ?? 0) + Math.trunc(delta);
    if (nextQuantity < 0) throw new Error('The inventory quantity cannot be negative.');
    if (nextQuantity < (existing?.reservedQuantity ?? 0))
      throw new Error('Inventory cannot be reduced below reserved quantity.');
    const timestamp = new Date().toISOString();
    const averageUnitCost =
      delta > 0 && unitCost > 0
        ? ((existing?.quantity ?? 0) * (existing?.averageUnitCost ?? 0) + delta * unitCost) /
          Math.max(1, nextQuantity)
        : (existing?.averageUnitCost ?? 0);
    const updated: InventoryBalance = existing
      ? { ...existing, quantity: nextQuantity, averageUnitCost, updatedAt: timestamp }
      : {
          id: this.createId('inventory-balance'),
          storeId,
          productId,
          variantId,
          locationId,
          quantity: nextQuantity,
          reservedQuantity: 0,
          lowStockThreshold: threshold,
          averageUnitCost,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
    this.commitBalances(
      existing
        ? this.balancesSignal().map((balance) => (balance.id === existing.id ? updated : balance))
        : [updated, ...this.balancesSignal()],
    );
    return updated;
  }

  private changeReserved(
    storeId: string,
    productId: string,
    variantId: string | null,
    locationId: string,
    delta: number,
  ): void {
    const existing = this.findRawBalance(storeId, productId, variantId, locationId);
    if (!existing) throw new Error('No stock exists for this item at the selected location.');
    const reservedQuantity = existing.reservedQuantity + Math.trunc(delta);
    if (reservedQuantity < 0 || reservedQuantity > existing.quantity)
      throw new Error('Reserved quantity exceeds location stock.');
    this.commitBalances(
      this.balancesSignal().map((balance) =>
        balance.id === existing.id
          ? { ...balance, reservedQuantity, updatedAt: new Date().toISOString() }
          : balance,
      ),
    );
  }

  private recordTransaction(
    input: Omit<InventoryTransaction, 'id' | 'createdAt'>,
  ): InventoryTransaction {
    const transaction: InventoryTransaction = {
      ...input,
      id: this.createId('inventory-transaction'),
      createdAt: new Date().toISOString(),
    };
    const transactions = [transaction, ...this.transactionsSignal()];
    this.storage.setItem(INVENTORY_TRANSACTIONS_KEY, transactions);
    this.transactionsSignal.set(transactions);
    return transaction;
  }

  private requireItem(
    storeId: string,
    productId: string,
    variantId?: string | null,
  ): string | null {
    const product = this.productService.getProductById(productId);
    if (!product || product.storeId !== storeId)
      throw new Error('The selected product does not belong to this store.');
    const variants = product.variants ?? [];
    const normalized = this.normalizeVariantId(variantId);
    if (variants.length && !normalized) throw new Error('Select a product variant.');
    if (!variants.length && normalized) throw new Error('This product does not have variants.');
    if (normalized && !variants.some((variant) => this.variantId(variant) === normalized))
      throw new Error('The selected product variant could not be found.');
    return normalized;
  }

  private normalizeVariantId(variantId?: string | number | null): string | null {
    return variantId === undefined || variantId === null || variantId === ''
      ? null
      : String(variantId);
  }
  private findRawBalance(
    storeId: string,
    productId: string,
    variantId: string | null,
    locationId: string,
  ): InventoryBalance | undefined {
    return this.balancesSignal().find(
      (balance) =>
        balance.storeId === storeId &&
        balance.productId === productId &&
        balance.variantId === variantId &&
        balance.locationId === locationId,
    );
  }
  private requireLocation(storeId: string, locationKey: string): InventoryLocation {
    const location = this.getLocations(storeId, false).find((item) => item.key === locationKey);
    if (!location) throw new Error('The selected inventory location could not be found.');
    if (!location.active) throw new Error('The selected inventory location is inactive.');
    return location;
  }
  private assertReference(storeId: string, referenceNumber: string): void {
    const reference = referenceNumber.trim().toLowerCase();
    if (!reference) throw new Error('Reference number is required.');
    if (
      this.transactionsSignal().some(
        (transaction) =>
          transaction.storeId === storeId &&
          transaction.referenceNumber.toLowerCase() === reference,
      )
    )
      throw new Error('This inventory reference already exists.');
  }
  private assertCapacity(storeId: string, increase: number): void {
    const store = this.storeService.getStoreById(storeId);
    if (!store) throw new Error('The selected store could not be found.');
    const total = this.getTotalStock(storeId);
    if (total + increase > store.inventoryAllocationLimit)
      throw new Error(
        `Inventory limit exceeded. Current stock is ${total.toLocaleString()}, incoming stock is ${increase.toLocaleString()}, and the limit is ${store.inventoryAllocationLimit.toLocaleString()}.`,
      );
  }
  private positiveInteger(value: number, message: string): number {
    const result = Math.trunc(Number(value) || 0);
    if (result <= 0) throw new Error(message);
    return result;
  }
  private commitStockReceipt(
    balances: InventoryBalance[],
    transactions: InventoryTransaction[],
  ): void {
    const previousBalances = this.balancesSignal();
    const previousTransactions = this.transactionsSignal();
    try {
      this.storage.setItem(INVENTORY_BALANCES_KEY, balances);
      this.storage.setItem(INVENTORY_TRANSACTIONS_KEY, transactions);
      this.balancesSignal.set(balances);
      this.transactionsSignal.set(transactions);
    } catch (error) {
      this.storage.setItem(INVENTORY_BALANCES_KEY, previousBalances);
      this.storage.setItem(INVENTORY_TRANSACTIONS_KEY, previousTransactions);
      throw error;
    }
  }
  private commitBalances(balances: InventoryBalance[]): void {
    this.storage.setItem(INVENTORY_BALANCES_KEY, balances);
    this.balancesSignal.set(balances);
  }
  private commitOrders(orders: InventoryOrder[]): void {
    this.storage.setItem(INVENTORY_ORDERS_KEY, orders);
    this.ordersSignal.set(orders);
  }
  private requireOrder(orderId: string): InventoryOrder {
    const order = this.ordersSignal().find((item) => item.id === orderId);
    if (!order) throw new Error('Inventory order not found.');
    return order;
  }
  private changeOrderStatus(
    orderId: string,
    allowed: InventoryOrderStatus[],
    status: InventoryOrderStatus,
  ): InventoryOrder {
    const order = this.requireOrder(orderId);
    if (!allowed.includes(order.status))
      throw new Error(`Order cannot move from ${order.status} to ${status}.`);
    const updated = { ...order, status, updatedAt: new Date().toISOString() };
    this.commitOrders(this.ordersSignal().map((item) => (item.id === orderId ? updated : item)));
    return updated;
  }

  private loadBalances(): InventoryBalance[] {
    const stored = this.storage.getItem<InventoryBalance[]>(INVENTORY_BALANCES_KEY);
    if (stored)
      return stored.map((balance) => ({
        ...balance,
        variantId: this.normalizeVariantId(balance.variantId),
        averageUnitCost: balance.averageUnitCost ?? 0,
      }));
    const timestamp = new Date().toISOString();
    const productBalances: InventoryBalance[] = this.productService
      .inventory()
      .map((allocation) => ({
        id: `migrated-${allocation.id}`,
        storeId: allocation.storeId,
        productId: allocation.productId,
        variantId: null,
        locationId: allocation.branchId ? `branch:${allocation.branchId}` : 'store',
        quantity: allocation.quantity,
        reservedQuantity: allocation.reservedQuantity ?? 0,
        lowStockThreshold: allocation.lowStockThreshold,
        averageUnitCost: 0,
        createdAt: allocation.createdAt ?? timestamp,
        updatedAt: allocation.updatedAt ?? timestamp,
      }));
    const legacyWarehouse =
      this.storage.getItem<WarehouseStock[]>(LEGACY_WAREHOUSE_STOCK_KEY) ?? [];
    const warehouseBalances: InventoryBalance[] = legacyWarehouse.map((stock) => ({
      id: `migrated-${stock.id}`,
      storeId: stock.storeId,
      productId: stock.productId,
      variantId: this.normalizeVariantId(stock.variantId),
      locationId: `warehouse:${stock.warehouseId}`,
      quantity: stock.quantity,
      reservedQuantity: stock.reservedQuantity ?? 0,
      lowStockThreshold: stock.lowStockThreshold,
      averageUnitCost: stock.averageUnitCost ?? 0,
      createdAt: stock.updatedAt ?? timestamp,
      updatedAt: stock.updatedAt ?? timestamp,
    }));
    const balances = [...productBalances, ...warehouseBalances];
    this.storage.setItem(INVENTORY_BALANCES_KEY, balances);
    this.storage.removeItem(LEGACY_PRODUCT_INVENTORY_KEY);
    this.storage.removeItem(LEGACY_WAREHOUSE_STOCK_KEY);
    return balances;
  }

  private loadTransactions(): InventoryTransaction[] {
    const stored =
      this.storage.getItem<
        Array<
          Partial<InventoryTransaction> &
            Pick<InventoryTransaction, 'storeId' | 'productId' | 'quantity' | 'referenceNumber'>
        >
      >(INVENTORY_TRANSACTIONS_KEY) ?? [];
    return stored.map((transaction) => ({
      id: transaction.id ?? this.createId('inventory-transaction'),
      storeId: transaction.storeId,
      productId: transaction.productId,
      variantId: this.normalizeVariantId(transaction.variantId),
      type: (transaction.type as string) === 'deduct' ? 'sale' : (transaction.type ?? 'adjustment'),
      quantity: transaction.quantity,
      unitCost: transaction.unitCost,
      batchNumber: transaction.batchNumber,
      sourceLocationKey: transaction.sourceLocationKey ?? null,
      destinationLocationKey: transaction.destinationLocationKey ?? null,
      sourceBeforeQuantity: transaction.sourceBeforeQuantity ?? null,
      sourceAfterQuantity: transaction.sourceAfterQuantity ?? null,
      destinationBeforeQuantity: transaction.destinationBeforeQuantity ?? null,
      destinationAfterQuantity: transaction.destinationAfterQuantity ?? null,
      referenceNumber: transaction.referenceNumber,
      reason: transaction.reason ?? '',
      note: transaction.note ?? '',
      occurredAt: transaction.occurredAt ?? transaction.createdAt ?? new Date().toISOString(),
      createdBy: transaction.createdBy ?? 'Store Admin',
      createdAt: transaction.createdAt ?? new Date().toISOString(),
    }));
  }

  private loadOrders(): InventoryOrder[] {
    return (
      this.storage.getItem<
        Array<Omit<InventoryOrder, 'variantId'> & { variantId?: string | null }>
      >(INVENTORY_ORDERS_KEY) ?? []
    ).map((order) => ({ ...order, variantId: this.normalizeVariantId(order.variantId) }));
  }

  private toWarehouseTransaction(
    input: ReceiveStockInput | TransferStockInput | AdjustStockInput,
    type: WarehouseTransaction['type'],
    lines: WarehouseTransaction['lines'],
  ): WarehouseTransaction {
    const warehouseKey =
      'warehouseId' in input
        ? `warehouse:${input.warehouseId}`
        : ([input.sourceLocationKey, input.destinationLocationKey].find((key) =>
            key.startsWith('warehouse:'),
          ) ?? '');
    return {
      id: this.createId('warehouse-view'),
      storeId: input.storeId,
      warehouseId: warehouseKey.replace('warehouse:', ''),
      type,
      referenceNumber: input.referenceNumber,
      occurredAt: input.occurredAt,
      supplierName: 'supplierName' in input ? input.supplierName : undefined,
      branchId:
        'destinationLocationKey' in input && input.destinationLocationKey.startsWith('branch:')
          ? input.destinationLocationKey.replace('branch:', '')
          : undefined,
      sourceLocationKey: 'sourceLocationKey' in input ? input.sourceLocationKey : null,
      destinationLocationKey:
        'destinationLocationKey' in input
          ? input.destinationLocationKey
          : `warehouse:${input.warehouseId}`,
      adjustmentType: 'adjustmentType' in input ? input.adjustmentType : undefined,
      reason: 'reason' in input ? input.reason : undefined,
      note: 'note' in input ? input.note : undefined,
      lines,
      totalCost: lines.reduce((total, line) => total + Math.abs(line.quantity) * line.unitCost, 0),
      createdBy: input.createdBy,
      createdAt: new Date().toISOString(),
    };
  }
  private createId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }
}
