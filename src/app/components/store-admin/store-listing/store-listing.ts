import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService, Store } from '../../../services/store.service';

type StorePanelMode = 'details' | 'create' | 'edit';

interface StoreFormData {
  name: string;
  description: string;
  logoUrl: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  country: string;
  address: string;
  category: string;
  status: Store['status'];
}

const EMPTY_FORM: StoreFormData = {
  name: '',
  description: '',
  logoUrl: '',
  email: '',
  phone: '',
  city: '',
  state: '',
  country: 'United States',
  address: '',
  category: 'Electronics',
  status: 'active'
};

const CATEGORIES = [
  'Electronics',
  'Fashion & Apparel',
  'Home & Living',
  'Sports & Fitness',
  'Beauty & Cosmetics',
  'Books & Stationery',
  'Food & Grocery',
  'Gaming & Toys'
];

const LOCATION_OPTIONS = [
  'New York, USA',
  'Los Angeles, USA',
  'Chicago, USA',
  'Houston, USA',
  'Phoenix, USA',
  'Miami, USA',
  'Seattle, USA',
  'Boston, USA'
];

@Component({
  selector: 'app-store-listing',
  imports: [FormsModule],
  templateUrl: './store-listing.html',
  styleUrl: './store-listing.css'
})
export class StoreListing {
  readonly storeService = inject(StoreService);

  readonly stores = this.storeService.stores;
  readonly searchQuery = signal('');
  readonly panelMode = signal<StorePanelMode | null>(null);
  readonly selectedStoreId = signal(this.stores()[0]?.id ?? '');
  readonly editingStoreId = signal<string | null>(null);
  readonly activeDetailTab = signal<'overview' | 'information' | 'settings' | 'activity'>('overview');
  readonly categories = CATEGORIES;
  readonly locationOptions = LOCATION_OPTIONS;

  formData: StoreFormData = { ...EMPTY_FORM };

  readonly filteredStores = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return this.stores();
    }

    return this.stores().filter(store =>
      store.name.toLowerCase().includes(query) ||
      store.email.toLowerCase().includes(query) ||
      store.owner.toLowerCase().includes(query) ||
      store.city.toLowerCase().includes(query) ||
      store.country.toLowerCase().includes(query)
    );
  });

  readonly selectedStore = computed(() => {
    const stores = this.stores();
    return stores.find(store => store.id === this.selectedStoreId()) ?? stores[0];
  });

  readonly stats = computed(() => {
    const stores = this.stores();
    const total = stores.length;
    const active = stores.filter(store => store.status === 'active').length;
    const inactive = stores.filter(store => store.status === 'disabled').length;
    const draft = stores.filter(store => store.status === 'pending').length;

    return [
      { label: 'Total Stores', value: total, helper: 'All Locations', tone: 'purple', icon: 'store' },
      { label: 'Active Stores', value: active, helper: `${this.percent(active, total)}% of total`, tone: 'green', icon: 'active' },
      { label: 'Inactive Stores', value: inactive, helper: `${this.percent(inactive, total)}% of total`, tone: 'orange', icon: 'inactive' },
      { label: 'Draft Stores', value: draft, helper: `${this.percent(draft, total)}% of total`, tone: 'violet', icon: 'draft' }
    ];
  });

  constructor() {
    effect(() => {
      const stores = this.stores();
      if (!stores.some(store => store.id === this.selectedStoreId())) {
        this.selectedStoreId.set(stores[0]?.id ?? '');
      }
    });
  }

  onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
  }

  openCreatePanel(): void {
    this.formData = { ...EMPTY_FORM };
    this.editingStoreId.set(null);
    this.panelMode.set('create');
  }

  openDetails(store: Store): void {
    this.selectedStoreId.set(store.id);
    this.storeService.changeSelectedStore(store.id);
    this.activeDetailTab.set('overview');
    this.panelMode.set('details');
  }

  openEditPanel(store: Store): void {
    this.selectedStoreId.set(store.id);
    this.editingStoreId.set(store.id);
    this.formData = this.toFormData(store);
    this.panelMode.set('edit');
  }

  onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.storeService.showToast('Please choose a valid image file.', 'warning');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.formData.logoUrl = String(reader.result ?? '');
      this.storeService.showToast('Store logo preview updated.', 'success');
    };
    reader.onerror = () => {
      this.storeService.showToast('Unable to read the selected logo.', 'danger');
    };
    reader.readAsDataURL(file);
  }

  removeLogo(): void {
    this.formData.logoUrl = '';
  }

  closePanel(): void {
    this.panelMode.set(null);
    this.editingStoreId.set(null);
  }

  saveCreate(): void {
    const store = this.storeService.addStore(this.normalizeFormData());
    this.selectedStoreId.set(store.id);
    this.panelMode.set(null);
  }

  saveEdit(): void {
    const id = this.editingStoreId();
    if (!id) {
      return;
    }

    this.storeService.updateStore(id, this.normalizeFormData());
    this.selectedStoreId.set(id);
    this.panelMode.set(null);
    this.editingStoreId.set(null);
  }

  deleteStore(store: Store, event?: Event): void {
    event?.stopPropagation();
    if (confirm(`Are you sure you want to delete "${store.name}"?`)) {
      this.storeService.deleteStore(store.id);
      this.panelMode.set(null);
    }
  }

  toggleSelectedStatus(): void {
    const store = this.selectedStore();
    if (store) {
      this.storeService.toggleStoreStatus(store.id);
    }
  }

  setLocation(value: string): void {
    const [city, country] = value.split(',').map(part => part.trim());
    this.formData.city = city ?? '';
    this.formData.country = country ?? 'United States';
  }

  locationValue(store: Store | undefined): string {
    return store ? `${store.city}, ${store.country === 'United States' ? 'USA' : store.country}` : '';
  }

  formLocationValue(): string {
    if (!this.formData.city) {
      return '';
    }

    return `${this.formData.city}, ${this.formData.country === 'United States' ? 'USA' : this.formData.country}`;
  }

  statusLabel(status: Store['status']): string {
    if (status === 'disabled') return 'Inactive';
    if (status === 'pending') return 'Draft';
    return 'Active';
  }

  formatDateTime(date: string, time = '10:30 AM'): string {
    return `${date} ${time}`;
  }

  private toFormData(store: Store): StoreFormData {
    return {
      name: store.name,
      description: store.description ?? '',
      logoUrl: store.logoUrl ?? '',
      email: store.email,
      phone: store.phone,
      city: store.city,
      state: store.state ?? '',
      country: store.country,
      address: store.address ?? '',
      category: store.category,
      status: store.status
    };
  }

  private normalizeFormData(): Partial<Store> {
    const name = this.formData.name.trim() || 'New Store';
    const city = this.formData.city.trim() || 'New York';
    const country = this.formData.country.trim() || 'United States';

    return {
      name,
      description: this.formData.description.trim(),
      logoUrl: this.formData.logoUrl,
      email: this.formData.email.trim() || 'store@example.com',
      phone: this.formData.phone.trim() || '+1 (555) 000-0000',
      city,
      country,
      state: this.formData.state.trim(),
      address: this.formData.address.trim(),
      category: this.formData.category,
      status: this.formData.status,
      owner: 'John Doe'
    };
  }

  private percent(value: number, total: number): number {
    return total ? Math.round((value / total) * 100) : 0;
  }
}
