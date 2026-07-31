import { Component, signal, inject, computed } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { StoreService, Store } from '../../../services/store.service';

export interface KpiCard {
  id: string; label: string; value: string;
  change: number; trend: 'up' | 'down' | 'neutral';
  colorVar: string; sparkline: number[]; iconType: string;
}
export interface QuickAction {
  id: string; title: string; description: string;
  route: string; gradient: string; iconType: string;
}

const MOCK_QUICK_ACTIONS: QuickAction[] = [
  { id: 'create-store', title: 'Create Store',     description: 'Launch a new ecommerce storefront',  route: '/store-admin/stores/create', gradient: 'linear-gradient(135deg,#7C3AED,#4F46E5)', iconType: 'plus'     },
  { id: 'view-stores',  title: 'View All Stores',  description: 'Browse and manage your stores',       route: '/store-admin/stores',         gradient: 'linear-gradient(135deg,#0EA5E9,#2563EB)', iconType: 'grid'     },
  { id: 'locations',   title: 'Manage Locations', description: 'Configure store locations and zones', route: '/store-admin/locations',       gradient: 'linear-gradient(135deg,#10B981,#059669)', iconType: 'map'      },
  { id: 'analytics',   title: 'View Analytics',   description: 'Track revenue, orders and growth',    route: '/store-admin/analytics',       gradient: 'linear-gradient(135deg,#F59E0B,#D97706)', iconType: 'chart'    },
  { id: 'settings',    title: 'Settings',         description: 'Customize platform preferences',      route: '/store-admin/settings',        gradient: 'linear-gradient(135deg,#6366F1,#4F46E5)', iconType: 'settings' },
];

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  readonly storeService = inject(StoreService);
  readonly router = inject(Router);

  readonly greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good Morning';
    if (h < 17) return 'Good Afternoon';
    return 'Good Evening';
  })();
  readonly today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });

  isLoadingKpi    = signal(false);
  isLoadingStores = signal(false);
  hasKpiError     = signal(false);
  hasStoreError   = signal(false);

  quickActions = MOCK_QUICK_ACTIONS;
  stores       = this.storeService.stores;

  kpiCards = computed<KpiCard[]>(() => [
    { id: 'total-stores',    label: 'Total Stores',     value: `${this.storeService.totalStoresCount()}`,   change: 8,   trend: 'up',      colorVar: 'purple', sparkline: [10,14,11,16,13,18,20,24], iconType: 'store'   },
    { id: 'active-stores',   label: 'Active Stores',    value: `${this.storeService.activeStoresCount()}`,  change: 12,  trend: 'up',      colorVar: 'green',  sparkline: [8,10,12,11,14,15,17,18],  iconType: 'check'   },
    { id: 'disabled-stores', label: 'Disabled Stores',  value: `${this.storeService.disabledStoresCount()}`,change: -2,  trend: 'down',    colorVar: 'red',    sparkline: [6,5,7,6,5,4,5,4],        iconType: 'ban'     },
    { id: 'pending',         label: 'Pending Approval', value: `${this.storeService.pendingStoresCount()}`, change: 0,   trend: 'neutral', colorVar: 'yellow', sparkline: [2,3,2,3,2,2,1,2],        iconType: 'clock'   },
    { id: 'revenue',         label: 'Monthly Revenue',  value: this.formatRevenue(this.storeService.totalRevenue()), change: 23, trend: 'up', colorVar: 'blue', sparkline: [72,85,78,95,88,102,115,128], iconType: 'dollar' },
    { id: 'orders',          label: 'Total Orders',     value: '4,821',   change: 15,  trend: 'up',      colorVar: 'indigo', sparkline: [3100,3500,3300,3800,4000,4200,4600,4821], iconType: 'package' },
    { id: 'visits',          label: 'Store Visits',     value: '89.2K',   change: 31,  trend: 'up',      colorVar: 'cyan',   sparkline: [52,60,55,68,72,78,83,89],                iconType: 'users'   },
    { id: 'rating',          label: 'Avg. Rating',      value: '4.7',     change: 4,   trend: 'up',      colorVar: 'orange', sparkline: [4.2,4.3,4.4,4.4,4.5,4.6,4.6,4.7],       iconType: 'star'    },
  ]);

  // Action handlers
  onToggleStatus(id: string, event: Event): void {
    event.stopPropagation();
    this.storeService.toggleStoreStatus(id);
  }

  onDeleteStore(id: string, name: string, event: Event): void {
    event.stopPropagation();
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
      this.storeService.deleteStore(id);
    }
  }

  onViewStore(id: string): void {
    this.router.navigate(['/store-admin/stores']);
  }

  onEditStore(id: string): void {
    this.storeService.showToast('Edit store panel opened.', 'info');
    this.router.navigate(['/store-admin/stores']);
  }

  onAnalytics(id: string): void {
    this.router.navigate(['/store-admin/analytics']);
  }

  onLocation(id: string): void {
    this.router.navigate(['/store-admin/locations']);
  }

  formatRevenue(n: number): string {
    if (n === 0) return '–';
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
    return `$${n}`;
  }

  formatNum(n: number): string {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
    return `${n}`;
  }

  capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  getSparklinePath(data: number[]): string {
    if (!data || data.length < 2) return '';
    const min = Math.min(...data), max = Math.max(...data);
    const range = max - min || 1;
    const W = 80, H = 26;
    return data.map((v, i) => {
      const x = (i / (data.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }
}
