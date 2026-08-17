import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Product } from '../../../models/admin.models';
import {
  StockAdjustmentType,
  Warehouse,
  WarehouseStatus,
  WarehouseStock,
  WarehouseTransaction,
} from '../../../models/warehouse.models';
import { AuthService } from '../../../services/auth';
import { BranchService } from '../../../services/branch.service';
import { ProductService } from '../../../services/product.service';
import { InventoryService } from '../../../services/inventory.service';
import { StoreService } from '../../../services/store.service';
import { WarehouseService } from '../../../services/warehouse.service';

type WarehouseTab =
  | 'overview'
  | 'warehouses'
  | 'receive'
  | 'stock'
  | 'transfer'
  | 'adjustment'
  | 'movements'
  | 'reports';
type ReportType = 'stock' | 'movement' | 'inward' | 'transfer' | 'adjustment' | 'low';
type StockTone = 'in' | 'low' | 'out';

const WAREHOUSE_ROUTES: Record<WarehouseTab, string> = {
  overview: '/store-admin/warehouses/overview',
  warehouses: '/store-admin/warehouses',
  receive: '/store-admin/warehouses/receive',
  stock: '/store-admin/warehouses/stock',
  transfer: '/store-admin/warehouses/transfer',
  adjustment: '/store-admin/warehouses/adjustments',
  movements: '/store-admin/warehouses/movements',
  reports: '/store-admin/warehouses/reports',
};

const WAREHOUSE_SECTION_META: Record<WarehouseTab, { title: string; description: string }> = {
  overview: {
    title: 'Warehouse Overview',
    description: 'Monitor warehouse locations, stock health, and recent operations.',
  },
  warehouses: {
    title: 'Warehouses',
    description: 'Create and manage warehouses for the selected store.',
  },
  receive: {
    title: 'Receive Stock',
    description: 'Record incoming stock from suppliers into a warehouse.',
  },
  stock: {
    title: 'Stock Overview',
    description: 'Review product availability and reserved stock by warehouse.',
  },
  transfer: {
    title: 'Stock Transfer',
    description: 'Move stock between warehouses and branches without changing store totals.',
  },
  adjustment: {
    title: 'Stock Adjustments',
    description: 'Correct warehouse quantities for loss, damage, or stock counts.',
  },
  movements: {
    title: 'Stock Movement',
    description: 'Review warehouse receipts, transfers, and adjustments.',
  },
  reports: {
    title: 'Warehouse Reports',
    description: 'Review and export warehouse stock and movement records.',
  },
};

interface WarehouseManagerOption {
  key: string;
  name: string;
  email: string;
  source: string;
}

interface WarehouseDraft {
  name: string;
  code: string;
  address: string;
  city: string;
  state: string;
  country: string;
  managerKey: string;
  status: WarehouseStatus;
}

interface ReceiveLineDraft {
  productId: string;
  variantId: string | null;
  batchNumber: string;
  quantity: number;
  unitCost: number;
}

interface TransferLineDraft {
  productId: string;
  variantId: string | null;
  quantity: number;
}

@Component({
  selector: 'app-warehouse-management',
  templateUrl: './warehouse-management.html',
  styleUrl: './warehouse-management.css',
})
export class WarehouseManagement {
  private readonly warehouseService = inject(WarehouseService);
  private readonly storeService = inject(StoreService);
  private readonly branchService = inject(BranchService);
  private readonly productService = inject(ProductService);
  private readonly inventoryService = inject(InventoryService);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly reportTypes: Array<{ id: ReportType; label: string }> = [
    { id: 'stock', label: 'Stock Summary' },
    { id: 'movement', label: 'Stock Movement' },
    { id: 'inward', label: 'Inward Report' },
    { id: 'transfer', label: 'Transfer Report' },
    { id: 'adjustment', label: 'Adjustment Report' },
    { id: 'low', label: 'Low Stock Report' },
  ];
  readonly adjustmentTypes: Array<{ value: StockAdjustmentType; label: string }> = [
    { value: 'increase', label: 'Increase Stock' },
    { value: 'decrease', label: 'Decrease Stock' },
  ];

  readonly selectedStore = this.storeService.selectedStore;
  readonly activeTab = signal<WarehouseTab>(
    (this.route.snapshot.data['warehouseSection'] as WarehouseTab | undefined) ?? 'warehouses',
  );
  readonly sectionMeta = computed(() => WAREHOUSE_SECTION_META[this.activeTab()]);
  readonly searchQuery = signal('');
  readonly warehouseEditorOpen = signal(false);
  readonly editingWarehouseId = signal<string | null>(null);
  readonly warehouseDraft = signal<WarehouseDraft>(this.emptyWarehouseDraft());
  readonly warehouseErrors = signal<Partial<Record<keyof WarehouseDraft | 'form', string>>>({});

  readonly receiveDraft = signal({
    warehouseId: '',
    supplierName: '',
    referenceNumber: '',
    occurredAt: this.today(),
  });
  readonly receiveLines = signal<ReceiveLineDraft[]>([this.emptyReceiveLine()]);
  readonly receiveError = signal('');

  readonly stockWarehouseId = signal('');

  readonly transferDraft = signal({
    sourceLocationKey: '',
    destinationLocationKey: '',
    referenceNumber: '',
    occurredAt: this.today(),
  });
  readonly transferLines = signal<TransferLineDraft[]>([this.emptyTransferLine()]);
  readonly transferError = signal('');

  readonly adjustmentDraft = signal({
    warehouseId: '',
    productId: '',
    variantId: null as string | null,
    adjustmentType: 'decrease' as StockAdjustmentType,
    quantity: 0,
    reason: '',
    note: '',
    referenceNumber: '',
    occurredAt: this.today(),
  });
  readonly adjustmentError = signal('');

  readonly reportType = signal<ReportType>('stock');
  readonly reportWarehouseId = signal('all');
  readonly reportFrom = signal(this.monthStart());
  readonly reportTo = signal(this.today());

  readonly warehouses = computed(() =>
    this.warehouseService
      .getWarehousesByStore(this.selectedStore().id)
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly activeWarehouses = computed(() =>
    this.warehouses().filter((warehouse) => warehouse.status === 'active'),
  );
  readonly filteredWarehouses = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return this.warehouses();
    return this.warehouses().filter((warehouse) =>
      [
        warehouse.name,
        warehouse.code,
        warehouse.city,
        warehouse.country,
        warehouse.managerName,
      ].some((value) => value.toLowerCase().includes(query)),
    );
  });
  readonly products = computed(() =>
    this.productService
      .getProductsByStore(this.selectedStore().id)
      .filter((product) => product.status !== 'archived')
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly branches = computed(() =>
    this.branchService
      .getByStore(this.selectedStore().id)
      .filter((branch) => branch.status === 'active')
      .sort((left, right) => left.name.localeCompare(right.name)),
  );
  readonly managers = computed<WarehouseManagerOption[]>(() => {
    const store = this.selectedStore();
    const owner: WarehouseManagerOption = {
      key: `owner:${store.id}`,
      name: store.owner,
      email: store.email,
      source: 'Store owner',
    };
    const branchManagers = this.branchService.getManagersByStore(store.id).map((manager) => ({
      key: manager.key,
      name: manager.name,
      email: manager.email,
      source: `${manager.branches.length} branch${manager.branches.length === 1 ? '' : 'es'}`,
    }));
    return [owner, ...branchManagers.filter((manager) => manager.key !== owner.key)];
  });
  readonly storeTransactions = computed(() =>
    this.inventoryService.getWarehouseTransactionsByStore(this.selectedStore().id),
  );
  readonly transferLocations = computed(() =>
    this.inventoryService
      .getLocations(this.selectedStore().id)
      .filter(
        (location) =>
          location.active && (location.type === 'warehouse' || location.type === 'branch'),
      ),
  );
  readonly transferDestinations = computed(() => {
    const source = this.transferLocations().find(
      (location) => location.key === this.transferDraft().sourceLocationKey,
    );
    return this.transferLocations().filter(
      (location) =>
        location.key !== source?.key &&
        (source?.type !== 'branch' || location.type === 'warehouse'),
    );
  });
  readonly suppliers = computed(() =>
    this.inventoryService.getWarehouseSuppliersByStore(this.selectedStore().id),
  );

  readonly selectedStockWarehouse = computed(() => this.resolveWarehouse(this.stockWarehouseId()));
  readonly stockRows = computed(() => {
    const warehouse = this.selectedStockWarehouse();
    if (!warehouse) return [];
    return this.inventoryService
      .getWarehouseStockByWarehouse(warehouse.id)
      .map((stock) => ({ stock, product: this.productService.getProductById(stock.productId) }))
      .filter((row): row is { stock: WarehouseStock; product: Product } => !!row.product)
      .sort((left, right) => left.product.name.localeCompare(right.product.name));
  });
  readonly stockSummary = computed(() => {
    const rows = this.stockRows();
    return {
      products: rows.length,
      total: rows.reduce((total, row) => total + row.stock.quantity, 0),
      reserved: rows.reduce((total, row) => total + row.stock.reservedQuantity, 0),
      available: rows.reduce((total, row) => total + this.availableStock(row.stock), 0),
    };
  });
  readonly overviewStocks = computed(() =>
    this.inventoryService.getWarehouseStocks(this.selectedStore().id),
  );
  readonly overviewSummary = computed(() => {
    const stocks = this.overviewStocks();
    const movements = this.storeTransactions();
    return {
      totalWarehouses: this.warehouses().length,
      activeWarehouses: this.activeWarehouses().length,
      totalStock: stocks.reduce((total, stock) => total + stock.quantity, 0),
      incoming: movements
        .filter((item) => item.type === 'receive')
        .reduce((total, item) => total + this.transactionQuantity(item), 0),
      outgoing: movements
        .filter(
          (item) => item.type === 'transfer' && item.sourceLocationKey?.startsWith('warehouse:'),
        )
        .reduce((total, item) => total + this.transactionQuantity(item), 0),
      lowStock: stocks.filter((stock) => this.stockTone(stock) !== 'in').length,
    };
  });
  readonly stockStatusCounts = computed(() => {
    const counts = { in: 0, low: 0, out: 0 };
    for (const row of this.stockRows()) counts[this.stockTone(row.stock)] += 1;
    return counts;
  });
  readonly stockDonutBackground = computed(() => {
    const counts = this.stockStatusCounts();
    const total = counts.in + counts.low + counts.out;
    if (!total) return 'conic-gradient(#eaecf0 0 100%)';
    const inEnd = (counts.in / total) * 100;
    const lowEnd = inEnd + (counts.low / total) * 100;
    return `conic-gradient(#2fa66a 0 ${inEnd}%, #ff9418 ${inEnd}% ${lowEnd}%, #f04438 ${lowEnd}% 100%)`;
  });

  readonly receiveSummary = computed(() => ({
    items: this.receiveLines().filter((line) => line.productId).length,
    quantity: this.receiveLines().reduce((total, line) => total + (Number(line.quantity) || 0), 0),
    total: this.receiveLines().reduce(
      (total, line) => total + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
      0,
    ),
  }));
  readonly transferSummary = computed(() => ({
    items: this.transferLines().filter((line) => line.productId && line.quantity > 0).length,
    quantity: this.transferLines().reduce((total, line) => total + (Number(line.quantity) || 0), 0),
  }));
  readonly adjustmentCurrentStock = computed(() => {
    const draft = this.adjustmentDraft();
    return (
      this.inventoryService.getWarehouseStock(draft.warehouseId, draft.productId, draft.variantId)
        ?.quantity ?? 0
    );
  });
  readonly adjustmentNewStock = computed(() => {
    const current = this.adjustmentCurrentStock();
    const draft = this.adjustmentDraft();
    const quantity = Number(draft.quantity) || 0;
    return draft.adjustmentType === 'increase' ? current + quantity : current - quantity;
  });

  readonly reportStocks = computed(() => {
    const warehouseIds = new Set(
      this.warehouses()
        .filter(
          (warehouse) =>
            this.reportWarehouseId() === 'all' || warehouse.id === this.reportWarehouseId(),
        )
        .map((warehouse) => warehouse.id),
    );
    return this.inventoryService
      .getWarehouseStocks()
      .filter(
        (stock) => stock.storeId === this.selectedStore().id && warehouseIds.has(stock.warehouseId),
      )
      .map((stock) => ({
        stock,
        product: this.productService.getProductById(stock.productId),
        warehouse: this.warehouseService.getWarehouse(stock.warehouseId),
      }))
      .filter(
        (row): row is { stock: WarehouseStock; product: Product; warehouse: Warehouse } =>
          !!row.product && !!row.warehouse,
      );
  });
  readonly reportTransactions = computed(() => {
    const from = this.reportFrom();
    const to = this.reportTo();
    const type = this.reportType();
    return this.storeTransactions().filter((transaction) => {
      const date = transaction.occurredAt.slice(0, 10);
      const selectedWarehouseKey = `warehouse:${this.reportWarehouseId()}`;
      const warehouseMatch =
        this.reportWarehouseId() === 'all' ||
        transaction.warehouseId === this.reportWarehouseId() ||
        transaction.sourceLocationKey === selectedWarehouseKey ||
        transaction.destinationLocationKey === selectedWarehouseKey;
      const typeMatch =
        type === 'movement' ||
        type === 'stock' ||
        type === 'low' ||
        (type === 'inward' && transaction.type === 'receive') ||
        (type === 'transfer' && transaction.type === 'transfer') ||
        (type === 'adjustment' && transaction.type === 'adjustment');
      return warehouseMatch && typeMatch && (!from || date >= from) && (!to || date <= to);
    });
  });
  readonly reportLowStocks = computed(() =>
    this.reportStocks().filter((row) => this.stockTone(row.stock) !== 'in'),
  );
  readonly reportTrend = computed(() => {
    const transactions = [...this.reportTransactions()]
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .slice(-8);
    const values = transactions.map((transaction) =>
      transaction.lines.reduce((sum, line) => sum + Math.abs(line.quantity), 0),
    );
    const max = Math.max(...values, 1);
    return transactions.map((transaction, index) => ({
      label: new Intl.DateTimeFormat('en-US', { month: 'short', day: '2-digit' }).format(
        new Date(transaction.occurredAt),
      ),
      value: values[index],
      height: Math.max(8, (values[index] / max) * 100),
    }));
  });

  constructor() {
    effect(() => {
      const storeId = this.selectedStore().id;
      const section = this.activeTab();
      untracked(() => {
        this.resetStoreContext(storeId);
        this.prepareSection(section);
        if (
          section === 'warehouses' &&
          this.route.snapshot.queryParamMap.get('create') === 'true'
        ) {
          this.openCreateWarehouse();
          void this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { create: null },
            queryParamsHandling: 'merge',
            replaceUrl: true,
          });
        }
      });
    });
  }

  selectTab(tab: WarehouseTab): void {
    void this.router.navigateByUrl(WAREHOUSE_ROUTES[tab]);
  }

  openWarehouseCreationPage(): void {
    void this.router.navigate(['/store-admin/warehouses'], { queryParams: { create: 'true' } });
  }

  onSearch(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreateWarehouse(): void {
    this.editingWarehouseId.set(null);
    const draft = this.emptyWarehouseDraft();
    draft.country = this.selectedStore().country;
    draft.state = this.selectedStore().state ?? '';
    draft.city = this.selectedStore().city;
    draft.managerKey = this.managers()[0]?.key ?? '';
    this.warehouseDraft.set(draft);
    this.warehouseErrors.set({});
    this.warehouseEditorOpen.set(true);
  }

  openEditWarehouse(warehouse: Warehouse): void {
    this.editingWarehouseId.set(warehouse.id);
    this.warehouseDraft.set({
      name: warehouse.name,
      code: warehouse.code,
      address: warehouse.address,
      city: warehouse.city,
      state: warehouse.state,
      country: warehouse.country,
      managerKey: warehouse.managerKey,
      status: warehouse.status,
    });
    this.warehouseErrors.set({});
    this.warehouseEditorOpen.set(true);
  }

  closeWarehouseEditor(): void {
    this.warehouseEditorOpen.set(false);
    this.warehouseErrors.set({});
  }

  setWarehouseField(field: keyof WarehouseDraft, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.warehouseDraft.update((draft) => ({ ...draft, [field]: value }));
    this.warehouseErrors.update((errors) => ({ ...errors, [field]: undefined, form: undefined }));
  }

  saveWarehouse(): void {
    const draft = this.warehouseDraft();
    const errors: Partial<Record<keyof WarehouseDraft | 'form', string>> = {};
    if (draft.name.trim().length < 2) errors.name = 'Enter a warehouse name.';
    if (!/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/.test(draft.code.trim()))
      errors.code = 'Use 2-20 letters, numbers, or hyphens.';
    if (draft.address.trim().length < 5) errors.address = 'Enter a complete warehouse address.';
    if (!draft.city.trim()) errors.city = 'Enter a city.';
    if (!draft.country.trim()) errors.country = 'Enter a country.';
    if (!draft.managerKey) errors.managerKey = 'Select a warehouse manager.';
    const editingId = this.editingWarehouseId();
    if (
      draft.code &&
      !this.warehouseService.isCodeAvailable(
        this.selectedStore().id,
        draft.code,
        editingId ?? undefined,
      )
    ) {
      errors.code = 'This warehouse code is already used in this store.';
    }
    if (Object.keys(errors).length) {
      this.warehouseErrors.set(errors);
      return;
    }
    const manager = this.managers().find((option) => option.key === draft.managerKey);
    if (!manager) return;
    try {
      const data = {
        storeId: this.selectedStore().id,
        name: draft.name.trim(),
        code: draft.code.trim().toUpperCase(),
        address: draft.address.trim(),
        city: draft.city.trim(),
        state: draft.state.trim(),
        country: draft.country.trim(),
        managerKey: manager.key,
        managerName: manager.name,
        managerEmail: manager.email,
        status: draft.status,
      };
      const warehouse = editingId
        ? this.warehouseService.updateWarehouse(editingId, data)
        : this.warehouseService.createWarehouse(data);
      this.storeService.showToast(
        `Warehouse "${warehouse.name}" ${editingId ? 'saved' : 'created'} successfully.`,
        'success',
      );
      this.closeWarehouseEditor();
      this.stockWarehouseId.set(warehouse.id);
      this.receiveDraft.update((value) => ({
        ...value,
        warehouseId: value.warehouseId || warehouse.id,
      }));
      this.transferDraft.update((value) => ({
        ...value,
        sourceLocationKey: value.sourceLocationKey || `warehouse:${warehouse.id}`,
      }));
    } catch (error) {
      this.warehouseErrors.set({ form: this.errorMessage(error) });
    }
  }

  deleteWarehouse(warehouse: Warehouse): void {
    if (!window.confirm(`Delete warehouse "${warehouse.name}"?`)) return;
    try {
      this.inventoryService.deleteWarehouse(warehouse.id);
      this.storeService.showToast(`Warehouse "${warehouse.name}" deleted.`, 'danger');
    } catch (error) {
      this.storeService.showToast(this.errorMessage(error), 'warning');
    }
  }

  setReceiveField(field: keyof ReturnType<typeof this.receiveDraft>, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.receiveDraft.update((draft) => ({ ...draft, [field]: value }));
    this.receiveError.set('');
  }

  updateReceiveLine(index: number, field: keyof ReceiveLineDraft, event: Event): void {
    const raw = (event.target as HTMLInputElement | HTMLSelectElement).value;
    const value = field === 'quantity' || field === 'unitCost' ? Number(raw) : raw;
    this.receiveLines.update((lines) =>
      lines.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, [field]: value, ...(field === 'productId' ? { variantId: null } : {}) }
          : line,
      ),
    );
    this.receiveError.set('');
  }

  addReceiveLine(): void {
    this.receiveLines.update((lines) => [...lines, this.emptyReceiveLine()]);
  }

  removeReceiveLine(index: number): void {
    this.receiveLines.update((lines) =>
      lines.length === 1
        ? [this.emptyReceiveLine()]
        : lines.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  saveReceipt(): void {
    const draft = this.receiveDraft();
    const lines = this.receiveLines().filter(
      (line) => line.productId || line.quantity || line.unitCost,
    );
    if (
      !draft.warehouseId ||
      !draft.supplierName.trim() ||
      !draft.referenceNumber.trim() ||
      !draft.occurredAt
    ) {
      this.receiveError.set('Select a warehouse and enter supplier, reference, and date.');
      return;
    }
    if (
      !lines.length ||
      lines.some(
        (line) =>
          !line.productId ||
          (this.hasVariants(line.productId) && !line.variantId) ||
          line.quantity <= 0 ||
          line.unitCost < 0,
      )
    ) {
      this.receiveError.set(
        'Each receipt line requires a product, exact variant, positive quantity, and valid unit cost.',
      );
      return;
    }
    if (
      new Set(lines.map((line) => `${line.productId}:${line.variantId ?? 'simple'}`)).size !==
      lines.length
    ) {
      this.receiveError.set('Combine duplicate product variants into a single receipt line.');
      return;
    }
    try {
      this.inventoryService.receiveWarehouseStock({
        storeId: this.selectedStore().id,
        warehouseId: draft.warehouseId,
        supplierName: draft.supplierName.trim(),
        referenceNumber: draft.referenceNumber.trim(),
        occurredAt: this.toIsoDate(draft.occurredAt),
        createdBy: this.currentUserName(),
        lines: lines.map((line) => ({
          ...line,
          quantity: Math.trunc(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      });
      this.storeService.showToast('Stock received and warehouse quantities updated.', 'success');
      this.stockWarehouseId.set(draft.warehouseId);
      this.receiveDraft.set({
        warehouseId: draft.warehouseId,
        supplierName: '',
        referenceNumber: this.warehouseService.createReference('RCV'),
        occurredAt: this.today(),
      });
      this.receiveLines.set([this.emptyReceiveLine()]);
      this.receiveError.set('');
      this.selectTab('stock');
    } catch (error) {
      this.receiveError.set(this.errorMessage(error));
    }
  }

  setStockWarehouse(event: Event): void {
    this.stockWarehouseId.set((event.target as HTMLSelectElement).value);
  }

  setTransferField(field: keyof ReturnType<typeof this.transferDraft>, event: Event): void {
    const value = (event.target as HTMLInputElement | HTMLSelectElement).value;
    this.transferDraft.update((draft) => ({ ...draft, [field]: value }));
    if (field === 'sourceLocationKey') {
      this.transferLines.set([this.emptyTransferLine()]);
      this.transferDraft.update((draft) => ({
        ...draft,
        destinationLocationKey:
          draft.destinationLocationKey === value
            ? (this.transferDestinations()[0]?.key ?? '')
            : draft.destinationLocationKey,
      }));
    }
    this.transferError.set('');
  }

  updateTransferLine(index: number, field: keyof TransferLineDraft, event: Event): void {
    const raw = (event.target as HTMLInputElement | HTMLSelectElement).value;
    const value = field === 'quantity' ? Number(raw) : raw;
    this.transferLines.update((lines) =>
      lines.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, [field]: value, ...(field === 'productId' ? { variantId: null } : {}) }
          : line,
      ),
    );
    this.transferError.set('');
  }

  addTransferLine(): void {
    this.transferLines.update((lines) => [...lines, this.emptyTransferLine()]);
  }

  removeTransferLine(index: number): void {
    this.transferLines.update((lines) =>
      lines.length === 1
        ? [this.emptyTransferLine()]
        : lines.filter((_, lineIndex) => lineIndex !== index),
    );
  }

  availableForTransfer(productId: string, variantId: string | null): number {
    return this.inventoryService.getBalance(
      this.selectedStore().id,
      productId,
      this.transferDraft().sourceLocationKey,
      variantId,
    ).availableQuantity;
  }

  transferableProducts(): Product[] {
    const ids = new Set(
      this.inventoryService
        .getLocationBalances(this.selectedStore().id, this.transferDraft().sourceLocationKey)
        .filter((balance) => balance.availableQuantity > 0)
        .map((balance) => balance.productId),
    );
    return this.products().filter((product) => ids.has(product.id));
  }

  confirmTransfer(): void {
    const draft = this.transferDraft();
    const lines = this.transferLines().filter((line) => line.productId || line.quantity);
    if (
      !draft.sourceLocationKey ||
      !draft.destinationLocationKey ||
      !draft.referenceNumber ||
      !draft.occurredAt
    ) {
      this.transferError.set(
        'Select source and destination locations, then enter reference and date.',
      );
      return;
    }
    if (
      !lines.length ||
      lines.some(
        (line) =>
          !line.productId ||
          (this.hasVariants(line.productId) && !line.variantId) ||
          line.quantity <= 0 ||
          line.quantity > this.availableForTransfer(line.productId, line.variantId),
      )
    ) {
      this.transferError.set(
        'Every line needs a positive quantity within the available stock limit.',
      );
      return;
    }
    if (
      new Set(lines.map((line) => `${line.productId}:${line.variantId ?? 'simple'}`)).size !==
      lines.length
    ) {
      this.transferError.set('Combine duplicate product variants into a single transfer line.');
      return;
    }
    try {
      this.inventoryService.transferWarehouseStock({
        storeId: this.selectedStore().id,
        sourceLocationKey: draft.sourceLocationKey,
        destinationLocationKey: draft.destinationLocationKey,
        referenceNumber: draft.referenceNumber,
        occurredAt: this.toIsoDate(draft.occurredAt),
        createdBy: this.currentUserName(),
        lines: lines.map((line) => ({
          productId: line.productId,
          variantId: line.variantId,
          quantity: Math.trunc(line.quantity),
        })),
      });
      this.storeService.showToast('Stock transferred to the selected location.', 'success');
      const warehouseKey = [draft.sourceLocationKey, draft.destinationLocationKey].find((key) =>
        key.startsWith('warehouse:'),
      );
      if (warehouseKey) this.stockWarehouseId.set(warehouseKey.replace('warehouse:', ''));
      this.transferDraft.set({
        ...draft,
        referenceNumber: this.warehouseService.createReference('TRF'),
        occurredAt: this.today(),
      });
      this.transferLines.set([this.emptyTransferLine()]);
      this.selectTab('stock');
    } catch (error) {
      this.transferError.set(this.errorMessage(error));
    }
  }

  setAdjustmentField(field: keyof ReturnType<typeof this.adjustmentDraft>, event: Event): void {
    const raw = (event.target as HTMLInputElement | HTMLSelectElement).value;
    const value = field === 'quantity' ? Number(raw) : raw;
    this.adjustmentDraft.update((draft) => ({
      ...draft,
      [field]: value,
      ...(field === 'productId' ? { variantId: null } : {}),
    }));
    if (field === 'warehouseId') this.selectFirstAdjustmentProduct(String(value));
    this.adjustmentError.set('');
  }

  adjustmentProducts(): Product[] {
    const ids = new Set(
      this.inventoryService
        .getWarehouseStockByWarehouse(this.adjustmentDraft().warehouseId)
        .map((stock) => stock.productId),
    );
    return this.products().filter((product) => ids.has(product.id));
  }

  confirmAdjustment(): void {
    const draft = this.adjustmentDraft();
    if (
      !draft.warehouseId ||
      !draft.productId ||
      (this.hasVariants(draft.productId) && !draft.variantId) ||
      !draft.reason.trim() ||
      !draft.referenceNumber ||
      !draft.occurredAt
    ) {
      this.adjustmentError.set(
        'Select warehouse, product and type, then enter date, reference, and reason.',
      );
      return;
    }
    if (draft.quantity <= 0 || this.adjustmentNewStock() < 0) {
      this.adjustmentError.set(
        'Enter a valid quantity that does not make warehouse stock negative.',
      );
      return;
    }
    try {
      this.inventoryService.adjustWarehouseStock({
        storeId: this.selectedStore().id,
        warehouseId: draft.warehouseId,
        productId: draft.productId,
        variantId: draft.variantId,
        adjustmentType: draft.adjustmentType,
        quantity: Math.trunc(draft.quantity),
        reason: draft.reason.trim(),
        note: draft.note.trim(),
        referenceNumber: draft.referenceNumber,
        occurredAt: this.toIsoDate(draft.occurredAt),
        createdBy: this.currentUserName(),
      });
      this.storeService.showToast('Warehouse stock adjusted successfully.', 'success');
      this.stockWarehouseId.set(draft.warehouseId);
      this.adjustmentDraft.update((value) => ({
        ...value,
        quantity: 0,
        reason: '',
        note: '',
        referenceNumber: this.warehouseService.createReference('ADJ'),
        occurredAt: this.today(),
      }));
      this.selectTab('stock');
    } catch (error) {
      this.adjustmentError.set(this.errorMessage(error));
    }
  }

  setReportType(type: ReportType): void {
    this.reportType.set(type);
  }

  setReportWarehouse(event: Event): void {
    this.reportWarehouseId.set((event.target as HTMLSelectElement).value);
  }

  setReportDate(field: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    field === 'from' ? this.reportFrom.set(value) : this.reportTo.set(value);
  }

  exportReport(): void {
    const rows = this.reportCsvRows();
    const csv = rows
      .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `warehouse-${this.reportType()}-${this.today()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    this.storeService.showToast('Warehouse report exported.', 'success');
  }

  availableStock(stock: WarehouseStock): number {
    return Math.max(0, stock.quantity - stock.reservedQuantity);
  }

  stockTone(stock: WarehouseStock): StockTone {
    const available = this.availableStock(stock);
    if (available === 0) return 'out';
    if (available <= stock.lowStockThreshold) return 'low';
    return 'in';
  }

  stockStatusLabel(stock: WarehouseStock): string {
    const tone = this.stockTone(stock);
    return tone === 'in' ? 'In Stock' : tone === 'low' ? 'Low Stock' : 'Out of Stock';
  }

  warehouseLocation(warehouse: Warehouse): string {
    return [warehouse.city, warehouse.state, warehouse.country].filter(Boolean).join(', ');
  }

  warehouseName(id: string): string {
    const warehouse = this.warehouseService.getWarehouse(id);
    return warehouse ? `${warehouse.name} (${warehouse.code})` : 'Deleted warehouse';
  }

  branchName(id?: string): string {
    if (!id) return '-';
    return this.branchService.getById(id)?.name ?? 'Deleted branch';
  }

  productName(id: string): string {
    return this.productService.getProductById(id)?.name ?? 'Deleted product';
  }

  variantsFor(productId: string) {
    return productId ? this.inventoryService.getVariants(productId) : [];
  }

  transferVariantsFor(productId: string) {
    return this.variantsFor(productId).filter(
      (variant) =>
        this.availableForTransfer(productId, this.inventoryService.variantId(variant)) > 0,
    );
  }

  adjustmentVariantsFor(productId: string) {
    const warehouseId = this.adjustmentDraft().warehouseId;
    return this.variantsFor(productId).filter((variant) =>
      this.inventoryService.getWarehouseStock(
        warehouseId,
        productId,
        this.inventoryService.variantId(variant),
      ),
    );
  }

  hasVariants(productId: string): boolean {
    return this.variantsFor(productId).length > 0;
  }

  variantLabel(productId: string, variantId: string | null): string {
    return this.inventoryService.variantLabel(productId, variantId);
  }

  itemSku(productId: string, variantId: string | null): string {
    return this.inventoryService.itemSku(productId, variantId);
  }

  locationName(locationKey: string | null | undefined): string {
    return this.inventoryService.locationName(this.selectedStore().id, locationKey ?? null);
  }

  transactionQuantity(transaction: WarehouseTransaction): number {
    return transaction.lines.reduce((total, line) => total + Math.abs(line.quantity), 0);
  }

  transactionDestination(transaction: WarehouseTransaction): string {
    if (transaction.type === 'receive') return transaction.supplierName ?? '-';
    if (transaction.type === 'transfer') {
      return `${this.locationName(transaction.sourceLocationKey)} -> ${this.locationName(transaction.destinationLocationKey)}`;
    }
    return transaction.reason ?? '-';
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    }).format(new Date(value));
  }

  formatMoney(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(value);
  }

  private resetStoreContext(storeId: string): void {
    const firstWarehouse = this.warehouseService
      .getWarehousesByStore(storeId)
      .find((warehouse) => warehouse.status === 'active');
    const warehouseId = firstWarehouse?.id ?? '';
    this.searchQuery.set('');
    this.closeWarehouseEditor();
    this.stockWarehouseId.set(warehouseId);
    this.receiveDraft.set({
      warehouseId,
      supplierName: '',
      referenceNumber: this.warehouseService.createReference('RCV'),
      occurredAt: this.today(),
    });
    this.receiveLines.set([this.emptyReceiveLine()]);
    const transferLocations = this.inventoryService
      .getLocations(storeId)
      .filter(
        (location) =>
          location.active && (location.type === 'warehouse' || location.type === 'branch'),
      );
    const sourceLocationKey = warehouseId
      ? `warehouse:${warehouseId}`
      : (transferLocations[0]?.key ?? '');
    this.transferDraft.set({
      sourceLocationKey,
      destinationLocationKey:
        transferLocations.find((location) => location.key !== sourceLocationKey)?.key ?? '',
      referenceNumber: this.warehouseService.createReference('TRF'),
      occurredAt: this.today(),
    });
    this.transferLines.set([this.emptyTransferLine()]);
    this.adjustmentDraft.set({
      warehouseId,
      productId: '',
      variantId: null,
      adjustmentType: 'decrease',
      quantity: 0,
      reason: '',
      note: '',
      referenceNumber: this.warehouseService.createReference('ADJ'),
      occurredAt: this.today(),
    });
    this.selectFirstAdjustmentProduct(warehouseId);
    this.reportWarehouseId.set('all');
    this.receiveError.set('');
    this.transferError.set('');
    this.adjustmentError.set('');
  }

  private prepareSection(section: WarehouseTab): void {
    if (section === 'receive') this.ensureReceiveWarehouse();
    if (section === 'stock') this.ensureStockWarehouse();
    if (section === 'transfer') this.ensureTransferLocation();
    if (section === 'adjustment') this.ensureAdjustmentSelection();
  }

  private ensureReceiveWarehouse(): void {
    if (!this.resolveWarehouse(this.receiveDraft().warehouseId)) {
      this.receiveDraft.update((draft) => ({
        ...draft,
        warehouseId: this.activeWarehouses()[0]?.id ?? '',
      }));
    }
  }

  private ensureStockWarehouse(): void {
    if (!this.resolveWarehouse(this.stockWarehouseId()))
      this.stockWarehouseId.set(this.activeWarehouses()[0]?.id ?? '');
  }

  private ensureTransferLocation(): void {
    const locations = this.transferLocations();
    const draft = this.transferDraft();
    const sourceLocationKey = locations.some((location) => location.key === draft.sourceLocationKey)
      ? draft.sourceLocationKey
      : (locations[0]?.key ?? '');
    const destinationLocationKey = locations.some(
      (location) =>
        location.key === draft.destinationLocationKey && location.key !== sourceLocationKey,
    )
      ? draft.destinationLocationKey
      : (locations.find((location) => location.key !== sourceLocationKey)?.key ?? '');
    this.transferDraft.set({ ...draft, sourceLocationKey, destinationLocationKey });
  }

  private ensureAdjustmentSelection(): void {
    const warehouseId =
      this.resolveWarehouse(this.adjustmentDraft().warehouseId)?.id ??
      this.activeWarehouses()[0]?.id ??
      '';
    this.adjustmentDraft.update((draft) => ({ ...draft, warehouseId }));
    this.selectFirstAdjustmentProduct(warehouseId);
  }

  private selectFirstAdjustmentProduct(warehouseId: string): void {
    const currentProductId = this.adjustmentDraft().productId;
    const stocks = this.inventoryService.getWarehouseStockByWarehouse(warehouseId);
    const productId = stocks.some((stock) => stock.productId === currentProductId)
      ? currentProductId
      : (stocks[0]?.productId ?? '');
    this.adjustmentDraft.update((draft) => ({ ...draft, warehouseId, productId, variantId: null }));
  }

  private resolveWarehouse(id: string): Warehouse | undefined {
    const storeId = this.selectedStore().id;
    const selected = this.warehouseService.getWarehouse(id);
    return selected?.storeId === storeId ? selected : this.activeWarehouses()[0];
  }

  private reportCsvRows(): Array<Array<string | number>> {
    if (this.reportType() === 'stock' || this.reportType() === 'low') {
      const rows = this.reportType() === 'low' ? this.reportLowStocks() : this.reportStocks();
      return [
        [
          'Warehouse',
          'Product',
          'Variant',
          'SKU',
          'Total Stock',
          'Reserved',
          'Available',
          'Status',
        ],
        ...rows.map((row) => [
          row.warehouse.name,
          row.product.name,
          this.variantLabel(row.product.id, row.stock.variantId),
          this.itemSku(row.product.id, row.stock.variantId),
          row.stock.quantity,
          row.stock.reservedQuantity,
          this.availableStock(row.stock),
          this.stockStatusLabel(row.stock),
        ]),
      ];
    }
    return [
      [
        'Date',
        'Reference',
        'Type',
        'Warehouse',
        'Destination / Source',
        'Quantity',
        'Amount',
        'User',
      ],
      ...this.reportTransactions().map((transaction) => [
        this.formatDate(transaction.occurredAt),
        transaction.referenceNumber,
        transaction.type,
        this.warehouseName(transaction.warehouseId),
        this.transactionDestination(transaction),
        this.transactionQuantity(transaction),
        transaction.totalCost,
        transaction.createdBy,
      ]),
    ];
  }

  private emptyWarehouseDraft(): WarehouseDraft {
    return {
      name: '',
      code: '',
      address: '',
      city: '',
      state: '',
      country: '',
      managerKey: '',
      status: 'active',
    };
  }

  emptyReceiveLine(): ReceiveLineDraft {
    return { productId: '', variantId: null, batchNumber: '', quantity: 0, unitCost: 0 };
  }

  emptyTransferLine(): TransferLineDraft {
    return { productId: '', variantId: null, quantity: 0 };
  }

  private today(): string {
    return new Date().toISOString().slice(0, 10);
  }

  private monthStart(): string {
    return `${this.today().slice(0, 8)}01`;
  }

  private toIsoDate(date: string): string {
    return new Date(`${date}T12:00:00`).toISOString();
  }

  private currentUserName(): string {
    return this.authService.getCurrentUser()?.name ?? 'Store Admin';
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'The warehouse operation could not be completed.';
  }
}
