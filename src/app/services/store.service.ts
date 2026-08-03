import { Injectable, signal, computed } from '@angular/core';

export interface Store {
  id: string;
  name: string;
  category: string;
  description?: string;
  status: 'active' | 'disabled' | 'pending';
  owner: string;
  email: string;
  phone: string;
  address?: string;
  city: string;
  state?: string;
  country: string;
  postalCode?: string;
  latitude?: number;
  longitude?: number;
  revenue: number;
  orders: number;
  visitors: number;
  rating: number;
  createdAt: string;
  accentColor: string;
}

export interface ToastNotification {
  id: string;
  message: string;
  type: 'success' | 'danger' | 'warning' | 'info';
}

const INITIAL_STORES: Store[] = [
  { id: 'store-001', name: 'Fashion Hub',       category: 'Fashion & Apparel',     status: 'active',   owner: 'Sarah Connor',  email: 'sarah@fashionhub.com',   phone: '+1-555-2345', address: '123 Fashion Ave', city: 'New York',      state: 'NY', country: 'United States', revenue: 48750,  orders: 1243, visitors: 28400, rating: 4.8, createdAt: 'Mar 15, 2024', accentColor: '#7C3AED' },
  { id: 'store-002', name: 'TechZone',          category: 'Electronics',           status: 'active',   owner: 'Mike Rahman',   email: 'mike@techzone.com',      phone: '+1-555-3456', address: '456 Tech Blvd',    city: 'San Francisco', state: 'CA', country: 'United States', revenue: 91200,  orders: 2810, visitors: 54300, rating: 4.6, createdAt: 'Jan 20, 2024', accentColor: '#2563EB' },
  { id: 'store-003', name: 'Home & Garden Co',  category: 'Home & Living',         status: 'pending',  owner: 'Aisha Patel',   email: 'aisha@homegarden.com',   phone: '+1-555-4567', address: '789 Green St',     city: 'Chicago',       state: 'IL', country: 'United States', revenue: 12400,  orders: 390,  visitors: 8700,  rating: 4.2, createdAt: 'Jun 01, 2024', accentColor: '#10B981' },
  { id: 'store-004', name: 'Sports Arena',      category: 'Sports & Fitness',      status: 'active',   owner: 'Carlos Mendez', email: 'carlos@sportsarena.com', phone: '+1-555-5678', address: '101 Stadium Way',  city: 'Miami',         state: 'FL', country: 'United States', revenue: 33600,  orders: 870,  visitors: 19200, rating: 4.5, createdAt: 'Feb 28, 2024', accentColor: '#F59E0B' },
  { id: 'store-005', name: 'Beauty Vault',      category: 'Beauty & Cosmetics',    status: 'disabled', owner: 'Emma Johnson',  email: 'emma@beautyvault.com',   phone: '+1-555-6789', address: '202 Glamour Rd',   city: 'Los Angeles',   state: 'CA', country: 'United States', revenue: 0,      orders: 0,    visitors: 0,     rating: 3.8, createdAt: 'Nov 10, 2023', accentColor: '#EC4899' },
  { id: 'store-006', name: 'Book Nook',         category: 'Books & Stationery',    status: 'active',   owner: 'David Lee',     email: 'david@booknook.com',     phone: '+1-555-7890', address: '303 Read Lane',    city: 'Seattle',       state: 'WA', country: 'United States', revenue: 8900,   orders: 456,  visitors: 12100, rating: 4.9, createdAt: 'Apr 05, 2024', accentColor: '#06B6D4' },
];

const ACCENT_COLORS = ['#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316'];

const LS_KEY = 'digishop_stores_v1';

function loadStores(): Store[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw) as Store[];
  } catch { /* ignore */ }
  return INITIAL_STORES;
}

function saveStores(stores: Store[]): void {
  try { localStorage.setItem(LS_KEY, JSON.stringify(stores)); } catch { /* ignore */ }
}

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private storesSignal = signal<Store[]>(loadStores());
  private toastsSignal = signal<ToastNotification[]>([]);

  readonly stores = this.storesSignal.asReadonly();
  readonly toasts = this.toastsSignal.asReadonly();

  // Currently selected store across the whole admin portal
private selectedStoreIdSignal = signal<string>('store-001');

readonly selectedStoreId = this.selectedStoreIdSignal.asReadonly();

readonly selectedStore = computed(() => {

  const stores = this.storesSignal();

  return stores.find(
    store => store.id === this.selectedStoreIdSignal()
  ) || stores[0];

});

// readonly selectedStore = computed(() =>
//   this.storesSignal().find(
//     store => store.id === this.selectedStoreIdSignal()
//   ) ?? this.storesSignal()[0]
// );



  readonly totalStoresCount = computed(() => this.storesSignal().length);
  readonly activeStoresCount = computed(() => this.storesSignal().filter(s => s.status === 'active').length);
  readonly disabledStoresCount = computed(() => this.storesSignal().filter(s => s.status === 'disabled').length);
  readonly pendingStoresCount = computed(() => this.storesSignal().filter(s => s.status === 'pending').length);
  readonly totalRevenue = computed(() => this.storesSignal().reduce((acc, s) => acc + s.revenue, 0));

  addStore(data: Partial<Store>): Store {
    const id = `store-${Date.now().toString().slice(-4)}`;
    const randomColor = ACCENT_COLORS[Math.floor(Math.random() * ACCENT_COLORS.length)];
    const todayStr = new Date().toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });

    const newStore: Store = {
      id,
      name: data.name || 'New Ecommerce Store',
      category: data.category || 'General Store',
      description: data.description || '',
      status: data.status || 'pending',
      owner: data.owner || 'Store Manager',
      email: data.email || 'contact@store.com',
      phone: data.phone || '+1-555-0000',
      address: data.address || '',
      city: data.city || 'New York',
      state: data.state || '',
      country: data.country || 'United States',
      postalCode: data.postalCode || '',
      latitude: data.latitude || 40.7128,
      longitude: data.longitude || -74.0060,
      revenue: 0,
      orders: 0,
      visitors: 0,
      rating: 5.0,
      createdAt: todayStr,
      accentColor: randomColor
    };

    this.storesSignal.update(stores => {
      const updated = [newStore, ...stores];
      saveStores(updated);
      return updated;
    });
    this.showToast(`Store "${newStore.name}" created! Status: Pending approval.`, 'warning');
    return newStore;
  }

  updateStore(id: string, updatedFields: Partial<Store>): void {
    this.storesSignal.update(stores => {
      const updated = stores.map(s => s.id === id ? { ...s, ...updatedFields } : s);
      saveStores(updated);
      return updated;
    });
    const store = this.storesSignal().find(s => s.id === id);
    if (store) {
      this.showToast(`Store "${store.name}" updated!`, 'info');
    }
  }

  toggleStoreStatus(id: string): void {
    let updatedStore: Store | undefined;
    this.storesSignal.update(stores => {
      const updated = stores.map(s => {
        if (s.id === id) {
          const newStatus: Store['status'] = s.status === 'active' ? 'disabled' : 'active';
          updatedStore = { ...s, status: newStatus };
          return updatedStore;
        }
        return s;
      });
      saveStores(updated);
      return updated;
    });

    if (updatedStore) {
      const msg = updatedStore.status === 'active'
        ? `Store "${updatedStore.name}" is now Active.`
        : `Store "${updatedStore.name}" has been Disabled.`;
      const type = updatedStore.status === 'active' ? 'success' : 'warning';
      this.showToast(msg, type);
    }
  }

  deleteStore(id: string): void {
    const store = this.storesSignal().find(s => s.id === id);
    this.storesSignal.update(stores => {
      const updated = stores.filter(s => s.id !== id);
      saveStores(updated);
      return updated;
    });
    if (store) {
      this.showToast(`Store "${store.name}" deleted.`, 'danger');
    }
  }


  changeSelectedStore(id:string):void{

  const store = this.storesSignal()
    .find(s => s.id === id);

  if(store){

    this.selectedStoreIdSignal.set(id);

    this.showToast(
      `Switched to ${store.name}`,
      'info'
    );

  }

}



  showToast(message: string, type: ToastNotification['type'] = 'info'): void {
    const id = `toast-${Date.now()}`;
    const newToast: ToastNotification = { id, message, type };
    this.toastsSignal.update(toasts => [...toasts, newToast]);

    setTimeout(() => {
      this.removeToast(id);
    }, 4000);
  }

  removeToast(id: string): void {
    this.toastsSignal.update(toasts => toasts.filter(t => t.id !== id));
  }
}
