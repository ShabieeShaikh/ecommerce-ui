import { Component, signal } from '@angular/core';

export interface AnalyticsKpi  { id: string; label: string; value: string; change: number; trend: 'up'|'down'|'neutral'; colorVar: string; }
export interface RecentOrder   { id: string; orderId: string; store: string; customer: string; amount: number; status: 'completed'|'processing'|'cancelled'|'pending'; date: string; }
export interface TopProduct    { rank: number; name: string; store: string; sold: number; revenue: number; trend: 'up'|'down'; }
export interface ActivityItem  { id: string; type: 'order'|'store'|'alert'|'review'|'payment'; message: string; timestamp: string; colorVar: string; }

const MOCK_KPIS: AnalyticsKpi[] = [
  { id: 'revenue',    label: 'Total Revenue',    value: '$128.5K', change: 23,   trend: 'up',      colorVar: 'blue'   },
  { id: 'orders',     label: 'Total Orders',     value: '4,821',   change: 15,   trend: 'up',      colorVar: 'purple' },
  { id: 'visitors',   label: 'Store Visitors',   value: '89.2K',   change: 31,   trend: 'up',      colorVar: 'green'  },
  { id: 'conversion', label: 'Conversion Rate',  value: '3.84%',   change: -0.4, trend: 'down',    colorVar: 'orange' },
  { id: 'avg-order',  label: 'Avg. Order Value', value: '$26.65',  change: 7,    trend: 'up',      colorVar: 'indigo' },
  { id: 'score',      label: 'Store Score',      value: '92/100',  change: 4,    trend: 'up',      colorVar: 'cyan'   },
];

const MOCK_ORDERS: RecentOrder[] = [
  { id: 'o1', orderId: '#ORD-8821', store: 'Fashion Hub',    customer: 'Alice Brown',  amount: 142.50,  status: 'completed',  date: 'Today, 10:24 AM'       },
  { id: 'o2', orderId: '#ORD-8820', store: 'TechZone',       customer: 'Bob Smith',    amount: 899.00,  status: 'processing', date: 'Today, 09:15 AM'       },
  { id: 'o3', orderId: '#ORD-8819', store: 'Sports Arena',   customer: 'Carol White',  amount: 65.00,   status: 'completed',  date: 'Yesterday, 6:45 PM'    },
  { id: 'o4', orderId: '#ORD-8818', store: 'Book Nook',      customer: 'Dan Rogers',   amount: 28.99,   status: 'pending',    date: 'Yesterday, 4:22 PM'    },
  { id: 'o5', orderId: '#ORD-8817', store: 'Luxury Watches', customer: 'Eva Turner',   amount: 4850.00, status: 'completed',  date: 'Jul 28, 2:10 PM'       },
  { id: 'o6', orderId: '#ORD-8816', store: 'Fashion Hub',    customer: 'Frank Muller', amount: 78.25,   status: 'cancelled',  date: 'Jul 28, 11:05 AM'      },
];

const MOCK_PRODUCTS: TopProduct[] = [
  { rank: 1, name: 'Premium Running Shoes',      store: 'Sports Arena',   sold: 342, revenue: 51300,  trend: 'up'   },
  { rank: 2, name: 'Wireless ANC Headphones',    store: 'TechZone',       sold: 218, revenue: 65400,  trend: 'up'   },
  { rank: 3, name: 'Classic Leather Watch',       store: 'Luxury Watches', sold: 187, revenue: 112200, trend: 'up'   },
  { rank: 4, name: 'Floral Summer Dress',         store: 'Fashion Hub',    sold: 420, revenue: 33600,  trend: 'down' },
  { rank: 5, name: 'Organic Green Tea Set',       store: 'Organic Market', sold: 560, revenue: 16800,  trend: 'up'   },
];

const MOCK_ACTIVITY: ActivityItem[] = [
  { id: 'a1', type: 'order',   message: '#ORD-8821 completed — Fashion Hub — $142.50',    timestamp: '10:24 AM',  colorVar: 'green'  },
  { id: 'a2', type: 'store',   message: 'Home & Garden Co submitted for approval',         timestamp: '09:40 AM',  colorVar: 'yellow' },
  { id: 'a3', type: 'payment', message: 'Payout of $4,850 processed for Luxury Watches',  timestamp: '09:15 AM',  colorVar: 'blue'   },
  { id: 'a4', type: 'alert',   message: 'Low stock: Wireless ANC (12 units remaining)',    timestamp: 'Yesterday', colorVar: 'orange' },
  { id: 'a5', type: 'review',  message: 'New 5★ review on Book Nook by Dan Rogers',       timestamp: 'Yesterday', colorVar: 'purple' },
  { id: 'a6', type: 'order',   message: '#ORD-8816 cancelled — refund initiated',          timestamp: 'Jul 28',    colorVar: 'red'    },
];

@Component({
  selector: 'app-analytics',
  imports: [],
  templateUrl: './analytics.html',
  styleUrl: './analytics.css'
})
export class Analytics {
  isLoadingKpi      = signal(false);
  isLoadingCharts   = signal(false);
  isLoadingOrders   = signal(false);
  isLoadingProducts = signal(false);
  hasError          = signal(false);
  selectedPeriod    = signal<'7d'|'30d'|'90d'|'1y'>('30d');

  kpis         = MOCK_KPIS;
  recentOrders = signal<RecentOrder[]>(MOCK_ORDERS);
  topProducts  = signal<TopProduct[]>(MOCK_PRODUCTS);
  activityFeed = signal<ActivityItem[]>(MOCK_ACTIVITY);

  setPeriod(p: any) { this.selectedPeriod.set(p); }
  formatRevenue(n: number): string {
    if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`;
    if (n >= 1_000)     return `$${(n/1_000).toFixed(1)}K`;
    return `$${n}`;
  }
  capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
}
