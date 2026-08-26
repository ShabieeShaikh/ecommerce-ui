import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import Swal, { SweetAlertIcon } from 'sweetalert2';
import { AuthService } from '../../../services/auth';
import { StoreService } from '../../../services/store.service';
import { ThemeService } from '../../../services/theme.service';
import { Store, ToastNotification } from '../../../models/admin.models';

interface NavigationItem {
  label: string;
  route?: string;
  icon:
    | 'dashboard'
    | 'store'
    | 'branch'
    | 'products'
    | 'catalog'
    | 'attributes'
    | 'brands'
    | 'inventory'
    | 'warehouse'
    | 'receive'
    | 'stock'
    | 'transfer'
    | 'adjustment'
    | 'reports'
    | 'managers'
    | 'staff'
    | 'purchasing'
    | 'supplier'
    | 'purchase-order'
    | 'payment'
    | 'purchase-return'
    | 'analytics'
    | 'location'
    | 'settings'
    | 'profile';
  exact?: boolean;
  children?: NavigationSubItem[];
}

interface NavigationSubItem {
  label: string;
  route?: string;
  icon: NavigationItem['icon'];
  exact?: boolean;
  disabled?: boolean;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

@Component({
  selector: 'app-store-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './store-admin-layout.html',
  styleUrl: './store-admin-layout.css',
})
export class StoreAdminLayout {
  readonly storeService = inject(StoreService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly themeService = inject(ThemeService);

  readonly sidebarCollapsed = signal(false);
  readonly mobileDrawerOpen = signal(false);
  readonly showUserMenu = signal(false);
  readonly showStoreDropdown = signal(false);
  readonly showNotifPanel = signal(false);
  readonly searchQuery = signal('');
  readonly searchFocused = signal(false);
  readonly openNavigationTree = signal<string | null>(
    this.router.url.startsWith('/store-admin/warehouses')
      ? 'Warehouse'
      : this.router.url.startsWith('/store-admin/inventory')
        ? 'Inventory'
        : this.router.url.startsWith('/store-admin/catalog')
          ? 'Catalog'
          : this.router.url.startsWith('/store-admin/purchasing')
            ? 'Purchasing'
            : 'Store',
  );

  readonly currentUser = computed(() => this.authService.getCurrentUser());
  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly selectedStore = this.storeService.selectedStore;
  readonly stores = this.storeService.stores;
  readonly queuedAlerts = this.storeService.toasts;
  readonly notifications = this.storeService.notifications;
  readonly unreadCount = this.storeService.unreadNotificationsCount;
  private alertOpen = false;
  private readonly alertQueueEffect = effect(() => {
    const nextAlert = this.queuedAlerts()[0];
    if (!nextAlert || this.alertOpen) return;
    void this.presentAlert(nextAlert);
  });

  readonly navigationGroups: NavigationGroup[] = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', route: '/store-admin/dashboard', icon: 'dashboard', exact: true },
      ],
    },
    {
      label: 'Store',
      items: [
        {
          label: 'Store',
          icon: 'store',
          children: [
            { label: 'Stores', route: '/store-admin/stores', icon: 'store' },
            { label: 'Branches', route: '/store-admin/branches', icon: 'branch' },
            { label: 'Products', route: '/store-admin/products', icon: 'products' },
            { label: 'Managers', route: '/store-admin/managers', icon: 'managers' },
            { label: 'Staff', icon: 'staff', disabled: true },
          ],
        },
        {
          label: 'Catalog',
          icon: 'catalog',
          children: [
            {
              label: 'Categories',
              route: '/store-admin/catalog/categories',
              icon: 'catalog',
              exact: false,
            },
            {
              label: 'Attributes',
              route: '/store-admin/catalog/attributes',
              icon: 'attributes',
              exact: true,
            },
            { label: 'Brands', route: '/store-admin/catalog/brands', icon: 'brands', exact: true },
          ],
        },
        {
          label: 'Inventory',
          icon: 'inventory',
          children: [
            { label: 'Overview', route: '/store-admin/inventory', icon: 'inventory', exact: true },
            {
              label: 'Add Stock',
              route: '/store-admin/inventory/add',
              icon: 'receive',
              exact: true,
            },
            {
              label: 'Allocate Stock',
              route: '/store-admin/inventory/allocate',
              icon: 'branch',
              exact: true,
            },
            {
              label: 'Stock Transfer',
              route: '/store-admin/inventory/transfer',
              icon: 'transfer',
              exact: true,
            },
            {
              label: 'Adjustments',
              route: '/store-admin/inventory/adjustments',
              icon: 'adjustment',
              exact: true,
            },
            {
              label: 'Reports',
              route: '/store-admin/inventory/reports',
              icon: 'reports',
              exact: true,
            },
            {
              label: 'Warehouse Sync',
              route: '/store-admin/inventory/warehouse-integration',
              icon: 'warehouse',
              exact: true,
            },
            {
              label: 'Order Integration',
              route: '/store-admin/inventory/order-integration',
              icon: 'products',
              exact: true,
            },
          ],
        },
        {
          label: 'Warehouse',
          icon: 'warehouse',
          children: [
            {
              label: 'Overview',
              route: '/store-admin/warehouses/overview',
              icon: 'warehouse',
              exact: true,
            },
            {
              label: 'Warehouses',
              route: '/store-admin/warehouses',
              icon: 'warehouse',
              exact: true,
            },
            {
              label: 'Receive Stock',
              route: '/store-admin/warehouses/receive',
              icon: 'receive',
              exact: true,
            },
            {
              label: 'Stock Overview',
              route: '/store-admin/warehouses/stock',
              icon: 'stock',
              exact: true,
            },
            {
              label: 'Stock Transfer',
              route: '/store-admin/warehouses/transfer',
              icon: 'transfer',
              exact: true,
            },
            {
              label: 'Adjustments',
              route: '/store-admin/warehouses/adjustments',
              icon: 'adjustment',
              exact: true,
            },
            {
              label: 'Stock Movement',
              route: '/store-admin/warehouses/movements',
              icon: 'transfer',
              exact: true,
            },
            {
              label: 'Reports',
              route: '/store-admin/warehouses/reports',
              icon: 'reports',
              exact: true,
            },
          ],
        },
        {
          label: 'Purchasing',
          icon: 'purchasing',
          children: [
            {
              label: 'Suppliers',
              route: '/store-admin/purchasing/suppliers',
              icon: 'supplier',
              exact: true,
            },
            {
              label: 'Purchase Orders',
              route: '/store-admin/purchasing/purchase-orders',
              icon: 'purchase-order',
              exact: true,
            },
            {
              label: 'Goods Receipts',
              route: '/store-admin/purchasing/goods-receipts',
              icon: 'receive',
              exact: true,
            },
            {
              label: 'Supplier Invoices',
              route: '/store-admin/purchasing/supplier-invoices',
              icon: 'purchase-order',
              exact: true,
            },
            {
              label: 'Supplier Payments',
              route: '/store-admin/purchasing/supplier-payments',
              icon: 'payment',
              exact: true,
            },
            {
              label: 'Purchase Returns',
              route: '/store-admin/purchasing/purchase-returns',
              icon: 'purchase-return',
              exact: true,
            },
            {
              label: 'Reports',
              route: '/store-admin/purchasing/reports',
              icon: 'reports',
              exact: true,
            },
          ],
        },
        { label: 'Analytics', route: '/store-admin/analytics', icon: 'analytics' },
        { label: 'Locations', route: '/store-admin/locations', icon: 'location' },
      ],
    },
    {
      label: 'Account',
      items: [
        { label: 'Profile', route: '/store-admin/profile', icon: 'profile' },
        { label: 'Settings', route: '/store-admin/settings', icon: 'settings' },
      ],
    },
  ];


  readonly userInitials = computed(() =>
    this.getInitials(this.currentUser()?.name ?? 'Store Admin'),
  );
  readonly userName = computed(() => this.currentUser()?.name ?? 'Store Admin');
  readonly userEmail = computed(() => this.currentUser()?.email ?? 'admin@digishop.local');
  readonly userRole = computed(() => this.formatRole(this.currentUser()?.role ?? 'StoreAdmin'));

  readonly searchResults = computed<Store[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (query.length < 2) {
      return [];
    }

    return this.stores()
      .filter(
        (store) =>
          store.name.toLowerCase().includes(query) ||
          store.category.toLowerCase().includes(query) ||
          store.owner.toLowerCase().includes(query) ||
          store.city.toLowerCase().includes(query),
      )
      .slice(0, 6);
  });

  readonly showSearchResults = computed(
    () => this.searchFocused() && this.searchQuery().trim().length >= 2,
  );

  toggleDesktopSidebar(): void {
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  isDarkMode(): boolean {
    return this.themeService.isDark();
  }

  toggleTheme(event: Event): void {
    event.stopPropagation();
    this.themeService.toggle();
    this.closePanels();
  }

  isNavigationTreeOpen(label: string): boolean {
    return this.openNavigationTree() === label;
  }

  navigationTreeId(label: string): string {
    return `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-submenu`;
  }

  toggleNavigationTree(label: string): void {
    if (this.sidebarCollapsed()) {
      this.sidebarCollapsed.set(false);
      this.openNavigationTree.set(label);
      return;
    }
    this.openNavigationTree.update((openLabel) => (openLabel === label ? null : label));
  }

  openMobileDrawer(event?: Event): void {
    event?.stopPropagation();
    this.mobileDrawerOpen.set(true);
    this.closePanels();
  }

  closeMobileDrawer(): void {
    this.mobileDrawerOpen.set(false);
  }

  toggleUserMenu(event: Event): void {
    event.stopPropagation();
    this.showUserMenu.update((open) => !open);
    this.showStoreDropdown.set(false);
    this.showNotifPanel.set(false);
  }

  toggleStoreDropdown(event: Event): void {
    event.stopPropagation();
    this.showStoreDropdown.update((open) => !open);
    this.showUserMenu.set(false);
    this.showNotifPanel.set(false);
  }

  toggleNotifPanel(event: Event): void {
    event.stopPropagation();
    this.showNotifPanel.update((open) => !open);
    this.showUserMenu.set(false);
    this.showStoreDropdown.set(false);
  }

  selectStore(id: string): void {
    this.storeService.changeSelectedStore(id);
    this.showStoreDropdown.set(false);
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchQuery.set(value);
    this.searchFocused.set(true);
  }

  clearSearch(event?: Event): void {
    event?.stopPropagation();
    this.searchQuery.set('');
    this.searchFocused.set(false);
  }

  navigateToStore(id: string): void {
    this.selectStore(id);
    this.clearSearch();
    this.router.navigate(['/store-admin/stores']);
  }

  markAllRead(): void {
    this.storeService.markAllNotificationsRead();
  }

  goToProfile(): void {
    this.showUserMenu.set(false);
    this.router.navigate(['/store-admin/profile']);
  }

  goToSettings(): void {
    this.showUserMenu.set(false);
    this.router.navigate(['/store-admin/settings']);
  }

  logout(): void {
    this.closePanels();
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  onNavItemClick(): void {
    this.closeMobileDrawer();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closePanels();
    this.searchFocused.set(false);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closePanels();
    this.closeMobileDrawer();
    this.searchFocused.set(false);
  }

  private closePanels(): void {
    this.showUserMenu.set(false);
    this.showStoreDropdown.set(false);
    this.showNotifPanel.set(false);
  }

  private async presentAlert(alert: ToastNotification): Promise<void> {
    this.alertOpen = true;
    const presentation: Record<
      ToastNotification['type'],
      { title: string; icon: SweetAlertIcon }
    > = {
      success: { title: 'Success', icon: 'success' },
      danger: { title: 'Error', icon: 'error' },
      warning: { title: 'Warning', icon: 'warning' },
      info: { title: 'Information', icon: 'info' },
    };
    const style = presentation[alert.type];
    try {
      await Swal.fire({
        toast: true,
        position: 'top-end',
        title: style.title,
        text: alert.message,
        icon: style.icon,
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
      });
    } finally {
      this.alertOpen = false;
      this.storeService.removeToast(alert.id);
    }
  }

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  private formatRole(role: string): string {
    return role.replace(/([a-z])([A-Z])/g, '$1 $2');
  }

}
