import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  InventoryAdjustmentType,
  InventoryOrder,
  InventoryTransaction,
  InventoryTransactionType,
} from '../../../models/inventory.models';
import { InventoryService } from '../../../services/inventory.service';
import { StoreService } from '../../../services/store.service';

type InventorySection =
  'overview' | 'add' | 'allocate' | 'transfer' | 'adjustment' | 'reports' | 'warehouse' | 'orders';
type ReportType = 'summary' | 'product' | 'location' | 'movement' | 'low' | 'out' | 'allocation';
interface AddStockLineDraft {
  variantId: string | null;
  selected: boolean;
  quantity: number;
  unitCost: number;
}

const INVENTORY_ROUTES: Record<InventorySection, string> = {
  overview: '/store-admin/inventory',
  add: '/store-admin/inventory/add',
  allocate: '/store-admin/inventory/allocate',
  transfer: '/store-admin/inventory/transfer',
  adjustment: '/store-admin/inventory/adjustments',
  reports: '/store-admin/inventory/reports',
  warehouse: '/store-admin/inventory/warehouse-integration',
  orders: '/store-admin/inventory/order-integration',
};

const SECTION_META: Record<InventorySection, { title: string; description: string }> = {
  overview: {
    title: 'Inventory Overview',
    description: 'Real-time stock, capacity, alerts, and movements across every location.',
  },
  add: {
    title: 'Add Stock',
    description: 'Receive new stock into the store unallocated pool or an active warehouse.',
  },
  allocate: {
    title: 'Allocate Stock',
    description: 'Distribute store-level unallocated stock across active branches.',
  },
  transfer: {
    title: 'Stock Transfer',
    description: 'Move available stock between stores, branches, and warehouses.',
  },
  adjustment: {
    title: 'Stock Adjustment',
    description: 'Correct stock and maintain location-specific low-stock thresholds.',
  },
  reports: {
    title: 'Inventory Reports',
    description: 'Filter, review, and export inventory balances and transaction history.',
  },
  warehouse: {
    title: 'Warehouse Integration',
    description: 'Monitor warehouse stock flowing into branch and store inventory.',
  },
  orders: {
    title: 'Order Integration',
    description:
      'Reserve, deduct, release, and return branch inventory through the order lifecycle.',
  },
};

@Component({
  selector: 'app-inventory-management',
  templateUrl: './inventory-management.html',
  styleUrl: './inventory-management.css',
})
export class InventoryManagement {
  readonly inventoryService = inject(InventoryService);
  private readonly storeService = inject(StoreService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly activeSection = signal<InventorySection>(
    (this.route.snapshot.data['inventorySection'] as InventorySection | undefined) ?? 'overview',
  );
  readonly sectionMeta = computed(() => SECTION_META[this.activeSection()]);
  readonly selectedStore = this.storeService.selectedStore;
  readonly products = computed(() => this.inventoryService.getProducts(this.selectedStore().id));
  readonly locations = computed(() => this.inventoryService.getLocations(this.selectedStore().id));
  readonly branches = computed(() =>
    this.locations().filter((location) => location.type === 'branch'),
  );
  readonly warehouses = computed(() =>
    this.locations().filter((location) => location.type === 'warehouse'),
  );
  readonly balances = computed(() => this.inventoryService.getBalances(this.selectedStore().id));
  readonly dashboard = computed(() => this.inventoryService.getDashboard(this.selectedStore().id));
  readonly transactions = computed(() =>
    this.inventoryService.getTransactionsByStore(this.selectedStore().id),
  );
  readonly orders = computed(() => this.inventoryService.getOrdersByStore(this.selectedStore().id));

  readonly actionError = signal('');
  readonly actionSuccess = signal('');
  readonly limitEditing = signal(false);
  readonly limitDraft = signal(0);

  readonly addDraft = signal({
    productId: '',
    destinationLocationKey: 'store',
    supplierName: '',
    referenceNumber: '',
    occurredAt: this.today(),
  });
  readonly addLines = signal<AddStockLineDraft[]>([]);
  readonly allocationProductId = signal('');
  readonly allocationVariantId = signal<string | null>(null);
  readonly allocationSourceKey = signal('store');
  readonly allocationReference = signal('');
  readonly allocationDate = signal(this.today());
  readonly allocationQuantities = signal<Record<string, number>>({});
  readonly transferDraft = signal({
    productId: '',
    variantId: null as string | null,
    sourceLocationKey: 'store',
    destinationLocationKey: '',
    quantity: 0,
    referenceNumber: '',
    occurredAt: this.today(),
  });
  readonly adjustmentDraft = signal({
    productId: '',
    variantId: null as string | null,
    locationKey: 'store',
    adjustmentType: 'decrease' as InventoryAdjustmentType,
    quantity: 0,
    reason: '',
    note: '',
    referenceNumber: '',
    occurredAt: this.today(),
  });
  readonly thresholdDraft = signal({
    productId: '',
    variantId: null as string | null,
    locationKey: 'store',
    threshold: 10,
  });

  readonly reportType = signal<ReportType>('summary');
  readonly reportLocationKey = signal('all');
  readonly reportFrom = signal(this.monthStart());
  readonly reportTo = signal(this.today());

  readonly orderDraft = signal({
    customerName: '',
    branchId: '',
    productId: '',
    variantId: null as string | null,
    quantity: 1,
    referenceNumber: '',
  });

  readonly addDestinations = computed(() => this.locations());
  readonly allocationSources = computed(() =>
    this.locations().filter((location) => location.type !== 'branch'),
  );
  readonly selectedAddDestination = computed(() =>
    this.locations().find((location) => location.key === this.addDraft().destinationLocationKey),
  );
  readonly selectedAddLines = computed(() => this.addLines().filter((line) => line.selected));
  readonly addTotalQuantity = computed(() =>
    this.selectedAddLines().reduce((total, line) => total + (Number(line.quantity) || 0), 0),
  );
  readonly addTotalCost = computed(() =>
    this.selectedAddLines().reduce(
      (total, line) => total + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
      0,
    ),
  );
  readonly addCapacityExceeded = computed(
    () => this.addTotalQuantity() > this.dashboard().remainingCapacity,
  );
  readonly allocationAvailable = computed(
    () =>
      this.inventoryService.getBalance(
        this.selectedStore().id,
        this.allocationProductId(),
        this.allocationSourceKey(),
        this.allocationVariantId(),
      ).availableQuantity,
  );
  readonly allocationRows = computed(() =>
    this.branches().map((branch) => {
      const balance = this.inventoryService.getBalance(
        this.selectedStore().id,
        this.allocationProductId(),
        branch.key,
        this.allocationVariantId(),
      );
      const quantity = this.allocationQuantities()[branch.entityId!] ?? 0;
      return { branch, balance, quantity, after: balance.quantity + quantity };
    }),
  );
  readonly allocationTotal = computed(() =>
    Object.values(this.allocationQuantities()).reduce(
      (total, quantity) => total + (Number(quantity) || 0),
      0,
    ),
  );
  readonly transferSourceBalance = computed(() =>
    this.inventoryService.getBalance(
      this.selectedStore().id,
      this.transferDraft().productId,
      this.transferDraft().sourceLocationKey,
      this.transferDraft().variantId,
    ),
  );
  readonly transferDestinations = computed(() =>
    this.locations().filter((location) => location.key !== this.transferDraft().sourceLocationKey),
  );
  readonly adjustmentBalance = computed(() =>
    this.inventoryService.getBalance(
      this.selectedStore().id,
      this.adjustmentDraft().productId,
      this.adjustmentDraft().locationKey,
      this.adjustmentDraft().variantId,
    ),
  );
  readonly adjustmentAfter = computed(() => {
    const balance = this.adjustmentBalance().quantity;
    const draft = this.adjustmentDraft();
    const quantity = Number(draft.quantity) || 0;
    return draft.adjustmentType === 'increase'
      ? balance + quantity
      : draft.adjustmentType === 'decrease'
        ? balance - quantity
        : quantity;
  });
  readonly orderAvailable = computed(() =>
    this.orderDraft().branchId && this.orderDraft().productId
      ? this.inventoryService.getBalance(
          this.selectedStore().id,
          this.orderDraft().productId,
          `branch:${this.orderDraft().branchId}`,
          this.orderDraft().variantId,
        ).availableQuantity
      : 0,
  );

  readonly filteredTransactions = computed(() => {
    const type = this.reportType();
    const location = this.reportLocationKey();
    return this.transactions().filter((transaction) => {
      const date = transaction.occurredAt.slice(0, 10);
      const dateMatch =
        (!this.reportFrom() || date >= this.reportFrom()) &&
        (!this.reportTo() || date <= this.reportTo());
      const locationMatch =
        location === 'all' ||
        transaction.sourceLocationKey === location ||
        transaction.destinationLocationKey === location;
      const typeMatch =
        type === 'movement' ||
        type === 'summary' ||
        type === 'product' ||
        type === 'location' ||
        (type === 'allocation' && transaction.type === 'allocate');
      return dateMatch && locationMatch && typeMatch;
    });
  });
  readonly reportBalances = computed(() =>
    this.balances().filter((balance) => {
      const locationMatch =
        this.reportLocationKey() === 'all' || balance.location.key === this.reportLocationKey();
      const type = this.reportType();
      const statusMatch =
        type === 'low'
          ? balance.availableQuantity > 0 && balance.availableQuantity <= balance.lowStockThreshold
          : type === 'out'
            ? balance.availableQuantity <= 0
            : true;
      return locationMatch && statusMatch;
    }),
  );
  readonly warehouseBalances = computed(() =>
    this.balances().filter((balance) => balance.location.type === 'warehouse'),
  );
  readonly warehouseTotal = computed(() =>
    this.warehouseBalances().reduce((total, balance) => total + balance.quantity, 0),
  );
  readonly branchTotal = computed(() =>
    this.balances()
      .filter((balance) => balance.location.type === 'branch')
      .reduce((total, balance) => total + balance.quantity, 0),
  );
  readonly donutBackground = computed(() => {
    const shares = this.dashboard().locationShares;
    if (!shares.length) return 'conic-gradient(#eaecf0 0 100%)';
    let cursor = 0;
    const segments = shares.map((share) => {
      const start = cursor;
      cursor += share.percentage;
      return `${share.color} ${start}% ${cursor}%`;
    });
    return `conic-gradient(${segments.join(',')})`;
  });

  readonly reportTypes: Array<{ id: ReportType; label: string }> = [
    { id: 'summary', label: 'Stock Summary' },
    { id: 'product', label: 'Stock by Product' },
    { id: 'location', label: 'Stock by Location' },
    { id: 'movement', label: 'Stock Movement' },
    { id: 'low', label: 'Low Stock Report' },
    { id: 'out', label: 'Out of Stock Report' },
    { id: 'allocation', label: 'Allocation Report' },
  ];

  constructor() {
    effect(() => {
      const storeId = this.selectedStore().id;
      untracked(() => this.resetContext(storeId));
    });
  }

  navigate(section: InventorySection): void {
    void this.router.navigateByUrl(INVENTORY_ROUTES[section]);
  }

  openWarehouseManagement(): void {
    void this.router.navigateByUrl('/store-admin/warehouses');
  }

  startLimitEdit(): void {
    this.limitDraft.set(this.selectedStore().inventoryAllocationLimit);
    this.limitEditing.set(true);
  }

  saveLimit(): void {
    this.execute('Inventory limit updated.', () =>
      this.inventoryService.updateInventoryLimit(this.selectedStore().id, this.limitDraft()),
    );
    if (!this.actionError()) this.limitEditing.set(false);
  }

  setLimit(event: Event): void {
    this.limitDraft.set(this.numberValue(event));
  }

  setAddField(field: keyof ReturnType<typeof this.addDraft>, event: Event): void {
    const value = this.textValue(event);
    this.addDraft.update((draft) => ({ ...draft, [field]: value }));
    if (field === 'productId') this.resetAddLines(value);
    this.clearFeedback();
  }

  toggleAddLine(index: number, event: Event): void {
    const selected = (event.target as HTMLInputElement).checked;
    this.addLines.update((lines) =>
      lines.map((line, lineIndex) => (lineIndex === index ? { ...line, selected } : line)),
    );
    this.clearFeedback();
  }

  setAddLineField(index: number, field: 'quantity' | 'unitCost', event: Event): void {
    const value = Math.max(0, this.numberValue(event));
    this.addLines.update((lines) =>
      lines.map((line, lineIndex) => (lineIndex === index ? { ...line, [field]: value } : line)),
    );
    this.clearFeedback();
  }

  selectAllAddLines(): void {
    this.addLines.update((lines) => lines.map((line) => ({ ...line, selected: true })));
    this.clearFeedback();
  }

  clearAddLines(): void {
    this.addLines.update((lines) =>
      lines.map((line) => ({ ...line, selected: false, quantity: 0 })),
    );
    this.clearFeedback();
  }

  submitAddStock(): void {
    const draft = this.addDraft();
    const selectedLines = this.selectedAddLines();
    const successMessage =
      selectedLines.length === 1
        ? 'Stock added successfully.'
        : `${selectedLines.length} variant stock lines added successfully.`;
    this.execute(successMessage, () =>
      this.inventoryService.addStockBatch({
        ...draft,
        storeId: this.selectedStore().id,
        createdBy: this.inventoryService.currentUserName(),
        lines: selectedLines.map((line) => ({
          productId: draft.productId,
          variantId: line.variantId,
          quantity: line.quantity,
          unitCost: line.unitCost,
        })),
      }),
    );
    if (!this.actionError()) this.resetAddDraft();
  }

  setAllocationProduct(event: Event): void {
    this.allocationProductId.set(this.textValue(event));
    this.allocationVariantId.set(null);
    this.allocationQuantities.set({});
    this.clearFeedback();
  }

  setAllocationVariant(event: Event): void {
    this.allocationVariantId.set(this.nullableValue(event));
    this.allocationQuantities.set({});
    this.clearFeedback();
  }
  setAllocationSource(event: Event): void {
    this.allocationSourceKey.set(this.textValue(event));
    this.allocationQuantities.set({});
    this.clearFeedback();
  }

  setAllocationQuantity(branchId: string, event: Event): void {
    this.allocationQuantities.update((values) => ({
      ...values,
      [branchId]: Math.max(0, this.numberValue(event)),
    }));
    this.clearFeedback();
  }

  setAllocationReference(event: Event): void {
    this.allocationReference.set(this.textValue(event));
  }
  setAllocationDate(event: Event): void {
    this.allocationDate.set(this.textValue(event));
  }

  submitAllocation(): void {
    this.execute('Stock allocated successfully.', () =>
      this.inventoryService.allocateStock({
        storeId: this.selectedStore().id,
        productId: this.allocationProductId(),
        variantId: this.allocationVariantId(),
        sourceLocationKey: this.allocationSourceKey(),
        allocations: Object.entries(this.allocationQuantities()).map(([branchId, quantity]) => ({
          branchId,
          quantity,
        })),
        referenceNumber: this.allocationReference(),
        occurredAt: this.allocationDate(),
        createdBy: this.inventoryService.currentUserName(),
      }),
    );
    if (!this.actionError()) {
      this.allocationQuantities.set({});
      this.allocationReference.set(this.inventoryService.createReference('ALC'));
    }
  }

  setTransferField(field: keyof ReturnType<typeof this.transferDraft>, event: Event): void {
    const value = field === 'quantity' ? this.numberValue(event) : this.textValue(event);
    this.transferDraft.update((draft) => {
      const updated = {
        ...draft,
        [field]: value,
        ...(field === 'productId' ? { variantId: null } : {}),
      } as typeof draft;
      if (field === 'sourceLocationKey' && updated.destinationLocationKey === value) {
        updated.destinationLocationKey =
          this.locations().find((location) => location.key !== value)?.key ?? '';
      }
      return updated;
    });
    this.clearFeedback();
  }

  submitTransfer(): void {
    const draft = this.transferDraft();
    this.execute('Stock transferred successfully.', () =>
      this.inventoryService.transferStock({
        ...draft,
        storeId: this.selectedStore().id,
        createdBy: this.inventoryService.currentUserName(),
      }),
    );
    if (!this.actionError()) this.resetTransferDraft();
  }

  setAdjustmentField(field: keyof ReturnType<typeof this.adjustmentDraft>, event: Event): void {
    const value = field === 'quantity' ? this.numberValue(event) : this.textValue(event);
    this.adjustmentDraft.update(
      (draft) =>
        ({
          ...draft,
          [field]: value,
          ...(field === 'productId' ? { variantId: null } : {}),
        }) as typeof draft,
    );
    this.clearFeedback();
  }

  submitAdjustment(): void {
    const draft = this.adjustmentDraft();
    this.execute('Stock adjustment saved.', () =>
      this.inventoryService.adjustStock({
        ...draft,
        storeId: this.selectedStore().id,
        createdBy: this.inventoryService.currentUserName(),
      }),
    );
    if (!this.actionError()) this.resetAdjustmentDraft();
  }

  setThresholdField(field: keyof ReturnType<typeof this.thresholdDraft>, event: Event): void {
    const value = field === 'threshold' ? this.numberValue(event) : this.textValue(event);
    this.thresholdDraft.update(
      (draft) =>
        ({
          ...draft,
          [field]: value,
          ...(field === 'productId' ? { variantId: null } : {}),
        }) as typeof draft,
    );
    if (field !== 'threshold') {
      const draft = this.thresholdDraft();
      const balance = draft.productId
        ? this.inventoryService.getBalance(
            this.selectedStore().id,
            draft.productId,
            draft.locationKey,
            draft.variantId,
          )
        : null;
      this.thresholdDraft.update((current) => ({
        ...current,
        threshold: balance?.lowStockThreshold ?? 10,
      }));
    }
    this.clearFeedback();
  }

  saveThreshold(): void {
    const draft = this.thresholdDraft();
    this.execute('Low-stock threshold updated.', () =>
      this.inventoryService.setLowStockThreshold(
        this.selectedStore().id,
        draft.productId,
        draft.locationKey,
        draft.threshold,
        draft.variantId,
      ),
    );
  }

  setReportType(type: ReportType): void {
    this.reportType.set(type);
  }
  setReportLocation(event: Event): void {
    this.reportLocationKey.set(this.textValue(event));
  }
  setReportFrom(event: Event): void {
    this.reportFrom.set(this.textValue(event));
  }
  setReportTo(event: Event): void {
    this.reportTo.set(this.textValue(event));
  }

  exportReport(): void {
    const rows = this.reportUsesTransactions()
      ? [
          ['Date', 'Reference', 'Type', 'Product', 'Source', 'Destination', 'Quantity', 'User'],
          ...this.filteredTransactions().map((transaction) => [
            transaction.occurredAt,
            transaction.referenceNumber,
            transaction.type,
            this.productName(transaction.productId),
            this.locationName(transaction.sourceLocationKey),
            this.locationName(transaction.destinationLocationKey),
            transaction.quantity,
            transaction.createdBy,
          ]),
        ]
      : [
          [
            'Product',
            'SKU',
            'Location',
            'Type',
            'Quantity',
            'Reserved',
            'Available',
            'Threshold',
            'Status',
          ],
          ...this.reportBalances().map((balance) => [
            this.productName(balance.productId),
            this.productSku(balance.productId),
            balance.location.name,
            balance.location.type,
            balance.quantity,
            balance.reservedQuantity,
            balance.availableQuantity,
            balance.lowStockThreshold,
            this.balanceStatus(balance),
          ]),
        ];
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    anchor.download = `inventory-${this.selectedStore().id}-${this.reportType()}-${this.today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(anchor.href);
    this.storeService.showToast('Inventory report exported.', 'success');
  }

  setOrderField(field: keyof ReturnType<typeof this.orderDraft>, event: Event): void {
    const value = field === 'quantity' ? this.numberValue(event) : this.textValue(event);
    this.orderDraft.update(
      (draft) =>
        ({
          ...draft,
          [field]: value,
          ...(field === 'productId' ? { variantId: null } : {}),
        }) as typeof draft,
    );
    this.clearFeedback();
  }

  createOrder(): void {
    const draft = this.orderDraft();
    this.execute('Order created and stock reserved.', () =>
      this.inventoryService.createOrder({
        ...draft,
        storeId: this.selectedStore().id,
        createdBy: this.inventoryService.currentUserName(),
      }),
    );
    if (!this.actionError()) this.resetOrderDraft();
  }

  confirmOrder(order: InventoryOrder): void {
    this.execute(`Order ${order.referenceNumber} confirmed.`, () =>
      this.inventoryService.confirmOrder(order.id),
    );
  }

  shipOrder(order: InventoryOrder): void {
    this.execute(`Order ${order.referenceNumber} shipped and stock deducted.`, () =>
      this.inventoryService.shipOrder(order.id, this.inventoryService.currentUserName()),
    );
  }

  cancelOrder(order: InventoryOrder): void {
    this.execute(`Order ${order.referenceNumber} cancelled and reservation released.`, () =>
      this.inventoryService.cancelOrder(order.id, this.inventoryService.currentUserName()),
    );
  }

  returnOrder(order: InventoryOrder): void {
    this.execute(`Order ${order.referenceNumber} returned to branch stock.`, () =>
      this.inventoryService.returnOrder(order.id, this.inventoryService.currentUserName()),
    );
  }

  productName(productId: string): string {
    return this.products().find((product) => product.id === productId)?.name ?? 'Unknown product';
  }
  productSku(productId: string): string {
    return this.products().find((product) => product.id === productId)?.sku ?? '-';
  }
  variantsFor(productId: string) {
    return productId ? this.inventoryService.getVariants(productId) : [];
  }
  hasVariants(productId: string): boolean {
    return this.variantsFor(productId).length > 0;
  }
  variantLabel(productId: string, variantId: string | null): string {
    return variantId ? this.inventoryService.variantLabel(productId, variantId) : '-';
  }
  itemSku(productId: string, variantId: string | null): string {
    return this.inventoryService.itemSku(productId, variantId);
  }
  locationName(key: string | null): string {
    return this.inventoryService.locationName(this.selectedStore().id, key);
  }
  reportUsesTransactions(): boolean {
    return ['movement', 'allocation'].includes(this.reportType());
  }
  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  }
  transactionLabel(type: InventoryTransactionType): string {
    return {
      add: 'Added Stock',
      receive: 'Received',
      allocate: 'Allocation',
      transfer: 'Transfer',
      adjustment: 'Adjustment',
      reserve: 'Reserved',
      release: 'Released',
      sale: 'Sale',
      return: 'Returned',
      purchase_return: 'Purchase Return',
    }[type];
  }
  transactionRoute(transaction: InventoryTransaction): string {
    const source = this.locationName(transaction.sourceLocationKey);
    const destination = this.locationName(transaction.destinationLocationKey);
    return transaction.sourceLocationKey && transaction.destinationLocationKey
      ? `${source} -> ${destination}`
      : transaction.destinationLocationKey
        ? destination
        : source;
  }
  balanceStatus(balance: { availableQuantity: number; lowStockThreshold: number }): string {
    return balance.availableQuantity <= 0
      ? 'Out of Stock'
      : balance.availableQuantity <= balance.lowStockThreshold
        ? 'Low Stock'
        : 'In Stock';
  }
  orderStatusClass(status: InventoryOrder['status']): string {
    return `order-${status}`;
  }

  private resetContext(_storeId: string): void {
    this.clearFeedback();
    this.limitEditing.set(false);
    this.limitDraft.set(this.selectedStore().inventoryAllocationLimit);
    this.resetAddDraft();
    const firstProductId = this.products()[0]?.id ?? '';
    this.allocationProductId.set(firstProductId);
    this.allocationVariantId.set(null);
    this.allocationSourceKey.set(this.allocationSources()[0]?.key ?? 'store');
    this.allocationQuantities.set({});
    this.allocationReference.set(this.inventoryService.createReference('ALC'));
    this.allocationDate.set(this.today());
    this.resetTransferDraft();
    this.resetAdjustmentDraft();
    this.thresholdDraft.set({
      productId: firstProductId,
      variantId: null,
      locationKey: this.locations()[0]?.key ?? 'store',
      threshold: 10,
    });
    this.reportLocationKey.set('all');
    this.reportFrom.set(this.monthStart());
    this.reportTo.set(this.today());
    this.resetOrderDraft();
  }

  private resetAddDraft(): void {
    const productId = this.products()[0]?.id ?? '';
    this.addDraft.set({
      productId,
      destinationLocationKey: this.addDestinations()[0]?.key ?? 'store',
      supplierName: '',
      referenceNumber: this.inventoryService.createReference('STK'),
      occurredAt: this.today(),
    });
    this.resetAddLines(productId);
  }

  private resetAddLines(productId: string): void {
    const variants = this.variantsFor(productId);
    this.addLines.set(
      variants.length
        ? variants.map((variant) => ({
            variantId: this.inventoryService.variantId(variant),
            selected: false,
            quantity: 0,
            unitCost: 0,
          }))
        : productId
          ? [{ variantId: null, selected: true, quantity: 0, unitCost: 0 }]
          : [],
    );
  }

  private resetTransferDraft(): void {
    const locations = this.locations();
    this.transferDraft.set({
      productId: this.products()[0]?.id ?? '',
      variantId: null,
      sourceLocationKey: locations[0]?.key ?? 'store',
      destinationLocationKey: locations[1]?.key ?? '',
      quantity: 0,
      referenceNumber: this.inventoryService.createReference('TRF'),
      occurredAt: this.today(),
    });
  }

  private resetAdjustmentDraft(): void {
    this.adjustmentDraft.set({
      productId: this.products()[0]?.id ?? '',
      variantId: null,
      locationKey: this.locations()[0]?.key ?? 'store',
      adjustmentType: 'decrease',
      quantity: 0,
      reason: '',
      note: '',
      referenceNumber: this.inventoryService.createReference('ADJ'),
      occurredAt: this.today(),
    });
  }

  private resetOrderDraft(): void {
    this.orderDraft.set({
      customerName: '',
      branchId: this.branches()[0]?.entityId ?? '',
      productId: this.products()[0]?.id ?? '',
      variantId: null,
      quantity: 1,
      referenceNumber: this.inventoryService.createReference('ORD'),
    });
  }

  private execute(successMessage: string, operation: () => unknown): void {
    this.clearFeedback();
    try {
      operation();
      this.actionSuccess.set(successMessage);
      this.storeService.showToast(successMessage, 'success');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The inventory operation could not be completed.';
      this.actionError.set(message);
      this.storeService.showToast(message, 'warning');
    }
  }

  private clearFeedback(): void {
    this.actionError.set('');
    this.actionSuccess.set('');
  }

  private textValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).value;
  }

  private numberValue(event: Event): number {
    return Number(this.textValue(event)) || 0;
  }

  private nullableValue(event: Event): string | null {
    return this.textValue(event) || null;
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }
  private monthStart(): string {
    return `${this.today().slice(0, 8)}01`;
  }
}
