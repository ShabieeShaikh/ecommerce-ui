import { Component, signal, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { StoreService, Store } from '../../../services/store.service';

export interface DeliveryZone {
  id: string; name: string; radius: number; unit: 'km' | 'mi';
  deliveryFee: number; estimatedTime: string; isActive: boolean;
}
export interface LocationHistory {
  id: string; action: string; performedBy: string; timestamp: string; details: string;
  type: 'update' | 'disable' | 'enable' | 'create';
}

// Generate mock delivery zones per store
function mockZones(storeId: string): DeliveryZone[] {
  return [
    { id: `${storeId}-z1`, name: 'Express Zone',  radius: 5,  unit: 'km', deliveryFee: 2.99,  estimatedTime: '30–45 min', isActive: true  },
    { id: `${storeId}-z2`, name: 'Standard Zone', radius: 15, unit: 'km', deliveryFee: 4.99,  estimatedTime: '1–2 hrs',   isActive: true  },
    { id: `${storeId}-z3`, name: 'Extended Zone', radius: 25, unit: 'km', deliveryFee: 8.99,  estimatedTime: '2–4 hrs',   isActive: true  },
    { id: `${storeId}-z4`, name: 'Wide Zone',     radius: 50, unit: 'km', deliveryFee: 14.99, estimatedTime: 'Next day',  isActive: false },
  ];
}

function mockHistory(storeName: string): LocationHistory[] {
  return [
    { id: 'h1', action: 'Location Updated',  performedBy: 'John Doe', timestamp: 'Jul 20, 2024 – 10:15 AM', details: `Coordinates updated for ${storeName}`,        type: 'update'  },
    { id: 'h2', action: 'Zone Added',        performedBy: 'John Doe', timestamp: 'Jul 15, 2024 – 03:40 PM', details: 'Extended Zone (25 km) delivery area added',        type: 'create'  },
    { id: 'h3', action: 'Location Disabled', performedBy: 'Admin',    timestamp: 'Jun 30, 2024 – 09:00 AM', details: 'Temporarily disabled for maintenance window',       type: 'disable' },
    { id: 'h4', action: 'Location Enabled',  performedBy: 'Admin',    timestamp: 'Jul 01, 2024 – 08:00 AM', details: 'Location restored and fully re-activated',          type: 'enable'  },
    { id: 'h5', action: 'Location Created',  performedBy: 'John Doe', timestamp: 'Mar 15, 2024 – 11:30 AM', details: `Initial location configured for ${storeName}`,      type: 'create'  },
  ];
}

@Component({
  selector: 'app-store-locations',
  imports: [FormsModule, TitleCasePipe],
  templateUrl: './store-locations.html',
  styleUrl: './store-locations.css'
})
export class StoreLocations {
  readonly storeService = inject(StoreService);

  // null = show card grid, store.id = show detail view
  selectedStoreId = signal<string | null>(null);
  activeTab = signal<'info' | 'zones' | 'history'>('info');
  isUpdating = signal(false);
  showAddZoneModal = signal(false);

  selectedStore = computed<Store | null>(() => {
    const id = this.selectedStoreId();
    if (!id) return null;
    return this.storeService.stores().find(s => s.id === id) ?? null;
  });

  deliveryZones = computed<DeliveryZone[]>(() => {
    const id = this.selectedStoreId();
    if (!id) return [];
    return mockZones(id);
  });

  locationHistory = computed<LocationHistory[]>(() => {
    const store = this.selectedStore();
    if (!store) return [];
    return mockHistory(store.name);
  });

  // New zone form
  newZone = { name: '', radius: 10, unit: 'km' as 'km' | 'mi', deliveryFee: 5.99, estimatedTime: '1–2 hrs' };

  selectStore(id: string) {
    this.selectedStoreId.set(id);
    this.activeTab.set('info');
  }

  goBack() { this.selectedStoreId.set(null); }

  setTab(tab: 'info' | 'zones' | 'history') { this.activeTab.set(tab); }

  onUpdateLocation() {
    this.isUpdating.set(true);
    setTimeout(() => {
      this.isUpdating.set(false);
      this.storeService.showToast('Location updated successfully!', 'success');
    }, 800);
  }

  onToggleZone(zone: DeliveryZone) {
    zone.isActive = !zone.isActive;
    const msg = zone.isActive ? `${zone.name} enabled` : `${zone.name} disabled`;
    this.storeService.showToast(msg, zone.isActive ? 'success' : 'warning');
  }

  onEditZone(zone: DeliveryZone) {
    this.storeService.showToast(`Editing ${zone.name} — form coming soon`, 'info');
  }

  onDeleteZone(zone: DeliveryZone) {
    this.storeService.showToast(`${zone.name} removed`, 'danger');
  }

  onAddZone() {
    this.showAddZoneModal.set(false);
    this.storeService.showToast(`Zone "${this.newZone.name}" added successfully!`, 'success');
    this.newZone = { name: '', radius: 10, unit: 'km', deliveryFee: 5.99, estimatedTime: '1–2 hrs' };
  }

  onShareLocation() {
    const store = this.selectedStore();
    if (store) {
      const url = `https://maps.google.com/?q=${store.city}`;
      navigator.clipboard?.writeText(url);
      this.storeService.showToast('Location link copied to clipboard!', 'success');
    }
  }

  onViewOnMaps() {
    const store = this.selectedStore();
    if (store) {
      window.open(`https://maps.google.com/?q=${store.address ?? store.city}+${store.country}`, '_blank');
    }
  }

  getStatusClass(status: Store['status']): string {
    return status === 'active' ? 'status-active' : status === 'disabled' ? 'status-disabled' : 'status-pending';
  }

  getHistoryIcon(type: LocationHistory['type']): string { return type; }
}
