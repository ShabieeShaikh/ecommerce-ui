import { Injectable, inject } from '@angular/core';

import { InventoryLocation } from '../models/inventory.models';
import { BranchService } from './branch.service';
import { StoreService } from './store.service';
import { WarehouseService } from './warehouse.service';

@Injectable({ providedIn: 'root' })
export class InventoryLocationService {
  private readonly storeService = inject(StoreService);
  private readonly branchService = inject(BranchService);
  private readonly warehouseService = inject(WarehouseService);

  getLocations(storeId: string, activeOnly = true): InventoryLocation[] {
    const store = this.storeService.getStoreById(storeId);
    if (!store) return [];

    return [
      {
        key: 'store',
        storeId,
        type: 'store',
        entityId: null,
        name: `${store.name} Main Store`,
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

  getLocation(
    storeId: string,
    locationKey: string,
    activeOnly = true,
  ): InventoryLocation | undefined {
    return this.getLocations(storeId, activeOnly).find((location) => location.key === locationKey);
  }
}
