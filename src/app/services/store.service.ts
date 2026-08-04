import { Injectable, signal, computed, inject } from '@angular/core';
import { LocalStorageService } from './local-storage.service';
import { Notification, Store, StoreDashboardData, StoreDashboardKpi, ToastNotification } from '../models/admin.models';

export type { Store, ToastNotification } from '../models/admin.models';

const INITIAL_STORES: Store[] = [
  { id: 'store-001', name: 'Fashion Hub',       category: 'Fashion & Apparel',     status: 'active',   owner: 'Sarah Connor',  email: 'sarah@fashionhub.com',   phone: '+1-555-2345', address: '123 Fashion Ave', city: 'New York',      state: 'NY', country: 'United States', revenue: 48750,  orders: 1243, visitors: 28400, rating: 4.8, createdAt: 'Mar 15, 2024', accentColor: '#7C3AED' },
  { id: 'store-002', name: 'TechZone',          category: 'Electronics',           status: 'active',   owner: 'Mike Rahman',   email: 'mike@techzone.com',      phone: '+1-555-3456', address: '456 Tech Blvd',    city: 'San Francisco', state: 'CA', country: 'United States', revenue: 91200,  orders: 2810, visitors: 54300, rating: 4.6, createdAt: 'Jan 20, 2024', accentColor: '#2563EB' },
  { id: 'store-003', name: 'Home & Garden Co',  category: 'Home & Living',         status: 'pending',  owner: 'Aisha Patel',   email: 'aisha@homegarden.com',   phone: '+1-555-4567', address: '789 Green St',     city: 'Chicago',       state: 'IL', country: 'United States', revenue: 12400,  orders: 390,  visitors: 8700,  rating: 4.2, createdAt: 'Jun 01, 2024', accentColor: '#10B981' },
  { id: 'store-004', name: 'Sports Arena',      category: 'Sports & Fitness',      status: 'active',   owner: 'Carlos Mendez', email: 'carlos@sportsarena.com', phone: '+1-555-5678', address: '101 Stadium Way',  city: 'Miami',         state: 'FL', country: 'United States', revenue: 33600,  orders: 870,  visitors: 19200, rating: 4.5, createdAt: 'Feb 28, 2024', accentColor: '#F59E0B' },
  { id: 'store-005', name: 'Beauty Vault',      category: 'Beauty & Cosmetics',    status: 'disabled', owner: 'Emma Johnson',  email: 'emma@beautyvault.com',   phone: '+1-555-6789', address: '202 Glamour Rd',   city: 'Los Angeles',   state: 'CA', country: 'United States', revenue: 0,      orders: 0,    visitors: 0,     rating: 3.8, createdAt: 'Nov 10, 2023', accentColor: '#EC4899' },
  { id: 'store-006', name: 'Book Nook',         category: 'Books & Stationery',    status: 'active',   owner: 'David Lee',     email: 'david@booknook.com',     phone: '+1-555-7890', address: '303 Read Lane',    city: 'Seattle',       state: 'WA', country: 'United States', revenue: 8900,   orders: 456,  visitors: 12100, rating: 4.9, createdAt: 'Apr 05, 2024', accentColor: '#06B6D4' },
];

const STORE_DASHBOARD_DATA: Record<string, StoreDashboardData> = {
  'store-001': {
    storeId: 'store-001',
    dateRangeLabel: 'May 12 - May 18, 2025',
    previousRangeLabel: 'vs May 5 - May 11',
    kpis: [
      { id: 'revenue', label: 'Total Revenue', value: '$24,780.50', change: 18.5, trend: 'up', icon: 'revenue', tone: 'purple' },
      { id: 'orders', label: 'Total Orders', value: '1,248', change: 12.3, trend: 'up', icon: 'orders', tone: 'blue' },
      { id: 'customers', label: 'Total Customers', value: '856', change: 9.7, trend: 'up', icon: 'customers', tone: 'green' },
      { id: 'aov', label: 'Average Order Value', value: '$78.42', change: 5.3, trend: 'up', icon: 'cart', tone: 'orange' },
      { id: 'products', label: 'Total Products', value: '342', change: 3.1, trend: 'up', icon: 'products', tone: 'violet' }
    ],
    revenueOverview: [
      { label: 'May 12', value: 3100 },
      { label: 'May 13', value: 4050 },
      { label: 'May 14', value: 5750 },
      { label: 'May 15', value: 3800 },
      { label: 'May 16', value: 5520 },
      { label: 'May 17', value: 3980 },
      { label: 'May 18', value: 6080 }
    ],
    salesByCategory: [
      { name: 'Mobiles & Tablets', amount: 8420.50, percentage: 34, color: '#7C3AED' },
      { name: 'Laptops & Computers', amount: 6120.30, percentage: 25, color: '#EC4899' },
      { name: 'Accessories', amount: 4320.20, percentage: 17, color: '#F59E0B' },
      { name: 'Smart Wearables', amount: 3210.10, percentage: 13, color: '#14B8A6' },
      { name: 'Audio', amount: 2710.40, percentage: 11, color: '#3B82F6' }
    ],
    topProducts: [
      { id: 'p1', name: 'iPhone 15 Pro Max', sold: 145, revenue: 10150, imageTone: '#6366F1' },
      { id: 'p2', name: 'MacBook Air M3', sold: 98, revenue: 8820, imageTone: '#0EA5E9' },
      { id: 'p3', name: 'Samsung Galaxy Watch 6', sold: 86, revenue: 2580, imageTone: '#111827' },
      { id: 'p4', name: 'Sony WH-1000XM5', sold: 74, revenue: 1850, imageTone: '#374151' },
      { id: 'p5', name: 'iPad Air 5', sold: 63, revenue: 1260, imageTone: '#2563EB' }
    ],
    recentOrders: [
      { id: '#ORD-7851', customer: 'Alex Johnson', amount: 299.99, status: 'Delivered' },
      { id: '#ORD-7850', customer: 'Maria Garcia', amount: 159.50, status: 'Delivered' },
      { id: '#ORD-7849', customer: 'David Smith', amount: 1249.00, status: 'Processing' },
      { id: '#ORD-7848', customer: 'Emily Davis', amount: 89.99, status: 'Shipped' },
      { id: '#ORD-7847', customer: 'Michael Brown', amount: 549.00, status: 'Processing' }
    ],
    performance: [
      { id: 'visitors', label: 'Visitors', value: '12,580', change: 11.2, trend: 'up', tone: 'purple', sparkline: [24, 22, 26, 21, 32, 37, 28, 25, 21, 24] },
      { id: 'views', label: 'Page Views', value: '28,450', change: 13.6, trend: 'up', tone: 'pink', sparkline: [31, 35, 29, 37, 45, 39, 36, 30, 33] },
      { id: 'bounce', label: 'Bounce Rate', value: '32.5%', change: -3.6, trend: 'down', tone: 'orange', sparkline: [30, 38, 32, 35, 48, 40, 37, 31, 34] },
      { id: 'conversion', label: 'Conversion Rate', value: '4.28%', change: 9.8, trend: 'up', tone: 'green', sparkline: [18, 24, 19, 27, 35, 29, 25, 21, 23] }
    ]
  }
};

const ACCENT_COLORS = ['#7C3AED', '#2563EB', '#10B981', '#F59E0B', '#EC4899', '#06B6D4', '#8B5CF6', '#F97316'];

const LS_KEY = 'digishop_stores_v1';
const SELECTED_STORE_KEY = 'digishop_selected_store_id_v1';
const NOTIFICATIONS_KEY = 'digishop_notifications_v1';

const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: 'n1', title: 'New Order Received', message: 'Fashion Hub received a $420 order', time: '2 min ago', unread: true, icon: 'order' },
  { id: 'n2', title: 'Store Approved', message: 'TechZone is now active', time: '1 hr ago', unread: true, icon: 'success' },
  { id: 'n3', title: 'Low Stock Alert', message: 'Beauty Vault has 3 items below 10 units', time: '3 hr ago', unread: false, icon: 'warning' },
  { id: 'n4', title: 'Revenue Milestone', message: 'Sports Arena crossed $30K revenue', time: 'Yesterday', unread: false, icon: 'star' }
];

@Injectable({
  providedIn: 'root'
})
export class StoreService {
  private readonly storage = inject(LocalStorageService);

  private storesSignal = signal<Store[]>(this.loadStores());
  private toastsSignal = signal<ToastNotification[]>([]);
  private notificationsSignal = signal<Notification[]>(this.loadNotifications());

  readonly stores = this.storesSignal.asReadonly();
  readonly toasts = this.toastsSignal.asReadonly();
  readonly notifications = this.notificationsSignal.asReadonly();

  private selectedStoreIdSignal = signal<string>(this.loadSelectedStoreId());

  readonly selectedStoreId = this.selectedStoreIdSignal.asReadonly();
  readonly selectedStore = computed(() => {
    const stores = this.storesSignal();
    return stores.find(store => store.id === this.selectedStoreIdSignal()) ?? stores[0];
  });

  readonly totalStoresCount = computed(() => this.storesSignal().length);
  readonly activeStoresCount = computed(() => this.storesSignal().filter(s => s.status === 'active').length);
  readonly disabledStoresCount = computed(() => this.storesSignal().filter(s => s.status === 'disabled').length);
  readonly pendingStoresCount = computed(() => this.storesSignal().filter(s => s.status === 'pending').length);
  readonly totalRevenue = computed(() => this.storesSignal().reduce((acc, s) => acc + s.revenue, 0));
  readonly unreadNotificationsCount = computed(() => this.notificationsSignal().filter(n => n.unread).length);
  readonly selectedDashboard = computed(() => {
    const store = this.selectedStore();
    return STORE_DASHBOARD_DATA[store.id] ?? this.buildDashboardFromStore(store);
  });

  getStores(): Store[] {
    return this.storesSignal();
  }

  getStoreById(id: string): Store | undefined {
    return this.storesSignal().find(store => store.id === id);
  }

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
      this.saveStores(updated);
      return updated;
    });
    this.showToast(`Store "${newStore.name}" created! Status: Pending approval.`, 'warning');
    return newStore;
  }

  updateStore(id: string, updatedFields: Partial<Store>): void {
    this.storesSignal.update(stores => {
      const updated = stores.map(s => s.id === id ? { ...s, ...updatedFields } : s);
      this.saveStores(updated);
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
      this.saveStores(updated);
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
      this.saveStores(updated);
      return updated;
    });
    if (store) {
      this.showToast(`Store "${store.name}" deleted.`, 'danger');
    }
  }
  changeSelectedStore(id: string): void {
    const store = this.getStoreById(id);
    if (store) {
      this.selectedStoreIdSignal.set(id);
      this.storage.setItem(SELECTED_STORE_KEY, id);
      this.showToast(`Switched to ${store.name}`, 'info');
    }
  }

  markAllNotificationsRead(): void {
    this.notificationsSignal.update(notifications => {
      const updated = notifications.map(notification => ({ ...notification, unread: false }));
      this.storage.setItem(NOTIFICATIONS_KEY, updated);
      return updated;
    });
    this.showToast('All notifications marked as read', 'success');
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

  private loadStores(): Store[] {
    return this.storage.getItem<Store[]>(LS_KEY) ?? INITIAL_STORES;
  }

  private saveStores(stores: Store[]): void {
    this.storage.setItem(LS_KEY, stores);
  }

  private loadSelectedStoreId(): string {
    const stores = this.storesSignal();
    const persistedId = this.storage.getItem<string>(SELECTED_STORE_KEY);
    return persistedId && stores.some(store => store.id === persistedId) ? persistedId : stores[0]?.id ?? '';
  }

  private loadNotifications(): Notification[] {
    return this.storage.getItem<Notification[]>(NOTIFICATIONS_KEY) ?? INITIAL_NOTIFICATIONS;
  }

  private buildDashboardFromStore(store: Store): StoreDashboardData {
    const revenue = store.revenue || 0;
    const orders = store.orders || 0;
    const customers = Math.max(Math.round(orders * 0.68), 0);
    const aov = orders ? revenue / orders : 0;
    const products = Math.max(42, Math.round(orders / 5));
    const seed = Math.max(revenue / 1000, 8);
    const categories = this.buildCategories(revenue);

    return {
      storeId: store.id,
      dateRangeLabel: 'May 12 - May 18, 2025',
      previousRangeLabel: 'vs May 5 - May 11',
      kpis: [
        this.createKpi('revenue', 'Total Revenue', this.formatCurrency(revenue), 12.4, 'revenue', 'purple'),
        this.createKpi('orders', 'Total Orders', orders.toLocaleString('en-US'), 8.2, 'orders', 'blue'),
        this.createKpi('customers', 'Total Customers', customers.toLocaleString('en-US'), 6.9, 'customers', 'green'),
        this.createKpi('aov', 'Average Order Value', this.formatCurrency(aov), 4.1, 'cart', 'orange'),
        this.createKpi('products', 'Total Products', products.toLocaleString('en-US'), 2.8, 'products', 'violet')
      ],
      revenueOverview: ['May 12', 'May 13', 'May 14', 'May 15', 'May 16', 'May 17', 'May 18'].map((label, index) => ({
        label,
        value: Math.round(seed * [64, 78, 92, 69, 88, 74, 100][index])
      })),
      salesByCategory: categories,
      topProducts: [
        { id: `${store.id}-p1`, name: `${store.category.split('&')[0].trim()} Starter Kit`, sold: 118, revenue: revenue * 0.23, imageTone: store.accentColor },
        { id: `${store.id}-p2`, name: `${store.name} Best Seller`, sold: 94, revenue: revenue * 0.19, imageTone: '#2563EB' },
        { id: `${store.id}-p3`, name: 'Premium Bundle', sold: 76, revenue: revenue * 0.14, imageTone: '#10B981' },
        { id: `${store.id}-p4`, name: 'Limited Edition Item', sold: 61, revenue: revenue * 0.1, imageTone: '#F59E0B' },
        { id: `${store.id}-p5`, name: 'Everyday Essential', sold: 54, revenue: revenue * 0.08, imageTone: '#EC4899' }
      ],
      recentOrders: [
        { id: '#ORD-7851', customer: store.owner, amount: Math.max(aov * 2.4, 89.99), status: 'Delivered' },
        { id: '#ORD-7850', customer: 'Maria Garcia', amount: Math.max(aov * 1.7, 59.50), status: 'Delivered' },
        { id: '#ORD-7849', customer: 'David Smith', amount: Math.max(aov * 4.1, 149.00), status: 'Processing' },
        { id: '#ORD-7848', customer: 'Emily Davis', amount: Math.max(aov * 1.1, 39.99), status: 'Shipped' },
        { id: '#ORD-7847', customer: 'Michael Brown', amount: Math.max(aov * 2.8, 79.00), status: 'Processing' }
      ],
      performance: [
        { id: 'visitors', label: 'Visitors', value: store.visitors.toLocaleString('en-US'), change: 9.4, trend: 'up', tone: 'purple', sparkline: [18, 23, 19, 26, 31, 27, 34, 30, 32] },
        { id: 'views', label: 'Page Views', value: Math.round(store.visitors * 2.18).toLocaleString('en-US'), change: 12.1, trend: 'up', tone: 'pink', sparkline: [29, 31, 26, 35, 42, 38, 34, 30, 33] },
        { id: 'bounce', label: 'Bounce Rate', value: '34.8%', change: -2.9, trend: 'down', tone: 'orange', sparkline: [36, 34, 39, 33, 31, 29, 32, 28, 27] },
        { id: 'conversion', label: 'Conversion Rate', value: '3.92%', change: 7.5, trend: 'up', tone: 'green', sparkline: [16, 20, 18, 24, 28, 25, 30, 27, 31] }
      ]
    };
  }

  private createKpi(
    id: string,
    label: string,
    value: string,
    change: number,
    icon: StoreDashboardKpi['icon'],
    tone: StoreDashboardKpi['tone']
  ): StoreDashboardKpi {
    return { id, label, value, change, trend: change > 0 ? 'up' : change < 0 ? 'down' : 'neutral', icon, tone };
  }

  private buildCategories(revenue: number): StoreDashboardData['salesByCategory'] {
    const base = [
      { name: 'Core Products', percentage: 34, color: '#7C3AED' },
      { name: 'Premium Items', percentage: 25, color: '#EC4899' },
      { name: 'Accessories', percentage: 17, color: '#F59E0B' },
      { name: 'Bundles', percentage: 13, color: '#14B8A6' },
      { name: 'Other', percentage: 11, color: '#3B82F6' }
    ];

    return base.map(category => ({
      ...category,
      amount: revenue * (category.percentage / 100)
    }));
  }

  private formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: value >= 1000 ? 0 : 2,
      maximumFractionDigits: value >= 1000 ? 0 : 2
    }).format(value);
  }
}
