import { Component, signal, inject, HostListener, computed } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive, Router } from '@angular/router';
import { StoreService } from '../../../services/store.service';

@Component({
  selector: 'app-store-admin-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './store-admin-layout.html',
  styleUrl: './store-admin-layout.css'
})
export class StoreAdminLayout {
  readonly storeService = inject(StoreService);
  readonly router = inject(Router);

  sidebarCollapsed = signal(false);

  // Topbar dropdown state
  showUserMenu       = signal(false);
  showStoreDropdown  = signal(false);
  showNotifPanel     = signal(false);
  searchQuery        = signal('');
  showSearchResults  = signal(false);

  // Current selected store (default = first store)
  selectedStoreId = signal<string>('store-001');

  selectedStore = computed(() =>
    this.storeService.stores().find(s => s.id === this.selectedStoreId())
    ?? this.storeService.stores()[0]
  );

  // Search results computed from query
  searchResults = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q || q.length < 2) return [];
    return this.storeService.stores().filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q) ||
      s.owner.toLowerCase().includes(q) ||
      s.city.toLowerCase().includes(q)
    ).slice(0, 6);
  });

  // Mock notifications
  notifications = [
    { id: 'n1', title: 'New Order Received', message: 'Fashion Hub received a $420 order', time: '2 min ago', unread: true,  icon: 'order'  },
    { id: 'n2', title: 'Store Approved',     message: 'TechZone is now Active',           time: '1 hr ago',  unread: true,  icon: 'success' },
    { id: 'n3', title: 'Low Stock Alert',    message: 'Beauty Vault has 3 items below 10 units', time: '3 hr ago', unread: false, icon: 'warning' },
    { id: 'n4', title: 'Revenue Milestone',  message: 'Sports Arena crossed $30K revenue',time: 'Yesterday', unread: false, icon: 'star'   },
  ];

  unreadCount = computed(() => this.notifications.filter(n => n.unread).length);

  toggleSidebar() { this.sidebarCollapsed.update(v => !v); }

  toggleUserMenu(e: Event) {
    e.stopPropagation();
    this.showUserMenu.update(v => !v);
    this.showStoreDropdown.set(false);
    this.showNotifPanel.set(false);
  }

  toggleStoreDropdown(e: Event) {
    e.stopPropagation();
    this.showStoreDropdown.update(v => !v);
    this.showUserMenu.set(false);
    this.showNotifPanel.set(false);
  }

  toggleNotifPanel(e: Event) {
    e.stopPropagation();
    this.showNotifPanel.update(v => !v);
    this.showUserMenu.set(false);
    this.showStoreDropdown.set(false);
  }

  selectStore(id: string) {
    this.selectedStoreId.set(id);
    this.showStoreDropdown.set(false);
    const store = this.storeService.stores().find(s => s.id === id);
    if (store) this.storeService.showToast(`Switched to ${store.name}`, 'info');
  }

  onSearchInput(event: Event) {
    const val = (event.target as HTMLInputElement).value;
    this.searchQuery.set(val);
    this.showSearchResults.set(val.trim().length >= 2);
  }

  clearSearch() {
    this.searchQuery.set('');
    this.showSearchResults.set(false);
  }

  navigateToStore(id: string) {
    this.clearSearch();
    this.router.navigate(['/store-admin/stores']);
  }

  markAllRead() {
    this.notifications.forEach(n => n.unread = false);
    this.storeService.showToast('All notifications marked as read', 'success');
  }

  goToProfile()  { this.showUserMenu.set(false); this.router.navigate(['/store-admin/profile']); }
  goToSettings() { this.showUserMenu.set(false); this.router.navigate(['/store-admin/settings']); }
  logout()       { this.showUserMenu.set(false); this.router.navigate(['/login']); }

  removeToast(id: string) { this.storeService.removeToast(id); }

  // Close all dropdowns on outside click
  @HostListener('document:click')
  onDocumentClick() {
    this.showUserMenu.set(false);
    this.showStoreDropdown.set(false);
    this.showNotifPanel.set(false);
    this.showSearchResults.set(false);
  }
}
