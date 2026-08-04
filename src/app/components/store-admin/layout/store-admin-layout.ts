import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../../services/auth';
import { StoreService } from '../../../services/store.service';
import { Store } from '../../../models/admin.models';

interface NavigationItem {
  label: string;
  route: string;
  icon: 'dashboard' | 'store' | 'products' | 'analytics' | 'location' | 'settings' | 'profile';
  exact?: boolean;
}

interface NavigationGroup {
  label: string;
  items: NavigationItem[];
}

@Component({
  selector: 'app-store-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './store-admin-layout.html',
  styleUrl: './store-admin-layout.css'
})
export class StoreAdminLayout {
  readonly storeService = inject(StoreService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly sidebarCollapsed = signal(false);
  readonly mobileDrawerOpen = signal(false);
  readonly showUserMenu = signal(false);
  readonly showStoreDropdown = signal(false);
  readonly showNotifPanel = signal(false);
  readonly searchQuery = signal('');
  readonly searchFocused = signal(false);

  readonly currentUser = computed(() => this.authService.getCurrentUser());
  readonly selectedStoreId = this.storeService.selectedStoreId;
  readonly selectedStore = this.storeService.selectedStore;
  readonly stores = this.storeService.stores;
  readonly notifications = this.storeService.notifications;
  readonly unreadCount = this.storeService.unreadNotificationsCount;
  readonly toasts = this.storeService.toasts;

  readonly navigationGroups: NavigationGroup[] = [
    {
      label: 'Main',
      items: [
        { label: 'Dashboard', route: '/store-admin/dashboard', icon: 'dashboard', exact: true }
      ]
    },
    {
      label: 'Store',
      items: [
        { label: 'Store Management', route: '/store-admin/stores', icon: 'store', exact: true },
        { label: 'Products', route: '/store-admin/products', icon: 'products' },
        { label: 'Analytics', route: '/store-admin/analytics', icon: 'analytics' },
        { label: 'Locations', route: '/store-admin/locations', icon: 'location' }
      ]
    },
    {
      label: 'Account',
      items: [
        { label: 'Profile', route: '/store-admin/profile', icon: 'profile' },
        { label: 'Settings', route: '/store-admin/settings', icon: 'settings' }
      ]
    }
  ];

  readonly userInitials = computed(() => this.getInitials(this.currentUser()?.name ?? 'Store Admin'));
  readonly userName = computed(() => this.currentUser()?.name ?? 'Store Admin');
  readonly userEmail = computed(() => this.currentUser()?.email ?? 'admin@digishop.local');
  readonly userRole = computed(() => this.formatRole(this.currentUser()?.role ?? 'StoreAdmin'));

  readonly searchResults = computed<Store[]>(() => {
    const query = this.searchQuery().toLowerCase().trim();
    if (query.length < 2) {
      return [];
    }

    return this.stores()
      .filter(store =>
        store.name.toLowerCase().includes(query) ||
        store.category.toLowerCase().includes(query) ||
        store.owner.toLowerCase().includes(query) ||
        store.city.toLowerCase().includes(query)
      )
      .slice(0, 6);
  });

  readonly showSearchResults = computed(() => this.searchFocused() && this.searchQuery().trim().length >= 2);

  toggleDesktopSidebar(): void {
    this.sidebarCollapsed.update(collapsed => !collapsed);
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
    this.showUserMenu.update(open => !open);
    this.showStoreDropdown.set(false);
    this.showNotifPanel.set(false);
  }

  toggleStoreDropdown(event: Event): void {
    event.stopPropagation();
    this.showStoreDropdown.update(open => !open);
    this.showUserMenu.set(false);
    this.showNotifPanel.set(false);
  }

  toggleNotifPanel(event: Event): void {
    event.stopPropagation();
    this.showNotifPanel.update(open => !open);
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

  removeToast(id: string): void {
    this.storeService.removeToast(id);
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

  private getInitials(name: string): string {
    return name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part.charAt(0).toUpperCase())
      .join('');
  }

  private formatRole(role: string): string {
    return role.replace(/([a-z])([A-Z])/g, '$1 $2');
  }
}
