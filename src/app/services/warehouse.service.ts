import { Injectable, inject, signal } from '@angular/core';
import { Warehouse, WarehouseUpsert } from '../models/warehouse.models';
import { LocalStorageService } from './local-storage.service';

const WAREHOUSES_STORAGE_KEY = 'digishop_warehouses_v1';

@Injectable({ providedIn: 'root' })
export class WarehouseService {
  private readonly storage = inject(LocalStorageService);
  private readonly warehousesSignal = signal<Warehouse[]>(this.storage.getItem<Warehouse[]>(WAREHOUSES_STORAGE_KEY) ?? []);

  readonly warehouses = this.warehousesSignal.asReadonly();

  getWarehousesByStore(storeId: string): Warehouse[] {
    return this.warehousesSignal().filter(warehouse => warehouse.storeId === storeId)
      .sort((left, right) => left.name.localeCompare(right.name));
  }

  getWarehouse(id: string): Warehouse | undefined { return this.warehousesSignal().find(warehouse => warehouse.id === id); }

  isCodeAvailable(storeId: string, code: string, excludeId?: string): boolean {
    const normalized = code.trim().toLowerCase();
    return !this.warehousesSignal().some(warehouse => warehouse.storeId === storeId && warehouse.id !== excludeId && warehouse.code.toLowerCase() === normalized);
  }

  createWarehouse(data: WarehouseUpsert): Warehouse {
    this.assertWarehouseData(data);
    if (!this.isCodeAvailable(data.storeId, data.code)) throw new Error('This warehouse code is already in use.');
    const timestamp = new Date().toISOString();
    const warehouse: Warehouse = { ...this.clean(data), id: this.createId('warehouse'), createdAt: timestamp, updatedAt: timestamp };
    this.commit([warehouse, ...this.warehousesSignal()]);
    return warehouse;
  }

  updateWarehouse(id: string, data: WarehouseUpsert): Warehouse {
    const existing = this.getWarehouse(id);
    if (!existing) throw new Error('The selected warehouse could not be found.');
    this.assertWarehouseData(data);
    if (!this.isCodeAvailable(data.storeId, data.code, id)) throw new Error('This warehouse code is already in use.');
    const updated: Warehouse = { ...existing, ...this.clean(data), updatedAt: new Date().toISOString() };
    this.commit(this.warehousesSignal().map(warehouse => warehouse.id === id ? updated : warehouse));
    return updated;
  }

  deleteWarehouse(id: string): void {
    if (!this.getWarehouse(id)) throw new Error('The selected warehouse could not be found.');
    this.commit(this.warehousesSignal().filter(warehouse => warehouse.id !== id));
  }

  createReference(prefix: 'RCV' | 'TRF' | 'ADJ'): string {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    return `${prefix}-${date}-${Date.now().toString().slice(-4)}`;
  }

  private clean(data: WarehouseUpsert): WarehouseUpsert {
    return {
      ...data, name: data.name.trim(), code: data.code.trim().toUpperCase(), address: data.address.trim(),
      city: data.city.trim(), state: data.state.trim(), country: data.country.trim(), managerKey: data.managerKey.trim(),
      managerName: data.managerName.trim(), managerEmail: data.managerEmail.trim().toLowerCase()
    };
  }

  private assertWarehouseData(data: WarehouseUpsert): void {
    if (!data.name.trim() || !data.code.trim() || !data.address.trim() || !data.city.trim() || !data.country.trim() || !data.managerName.trim()) {
      throw new Error('Complete all required warehouse fields.');
    }
  }

  private commit(warehouses: Warehouse[]): void {
    this.storage.setItem(WAREHOUSES_STORAGE_KEY, warehouses);
    this.warehousesSignal.set(warehouses);
  }

  private createId(prefix: string): string { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
}
