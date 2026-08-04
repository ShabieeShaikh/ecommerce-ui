import { Component, computed, inject, signal } from '@angular/core';
import { StoreService } from '../../../services/store.service';
import { CategorySales, RevenuePoint, StorePerformanceMetric } from '../../../models/admin.models';

type ChartPeriod = 'Daily' | 'Weekly' | 'Monthly';

@Component({
  selector: 'app-dashboard',
  imports: [],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css'
})
export class Dashboard {
  private readonly storeService = inject(StoreService);

  readonly selectedPeriod = signal<ChartPeriod>('Weekly');
  readonly hoveredRevenueIndex = signal<number | null>(null);
  readonly selectedStore = this.storeService.selectedStore;
  readonly dashboard = this.storeService.selectedDashboard;

  readonly revenuePoints = computed(() => this.buildRevenuePoints(this.selectedPeriod()));
  readonly hoveredRevenuePoint = computed(() => {
    const index = this.hoveredRevenueIndex();
    return index === null ? null : this.revenuePoints()[index] ?? null;
  });
  readonly chartMax = computed(() => {
    const max = Math.max(...this.revenuePoints().map(point => point.value), 1);
    return Math.ceil(max / 1000) * 1000;
  });
  readonly chartYTicks = computed(() => {
    const max = this.chartMax();
    return [max, max * 0.75, max * 0.5, max * 0.25, 0];
  });
  readonly periodDateLabel = computed(() => {
    if (this.selectedPeriod() === 'Daily') return 'May 18, 2025';
    if (this.selectedPeriod() === 'Monthly') return 'Jan - Dec 2025';
    return this.dashboard().dateRangeLabel;
  });
  readonly totalCategorySales = computed(() =>
    this.dashboard().salesByCategory.reduce((sum, category) => sum + category.amount, 0)
  );

  exportReport(): void {
    const store = this.selectedStore();
    const payload = {
      storeId: store?.id,
      storeName: store?.name,
      period: this.selectedPeriod(),
      revenueOverview: this.revenuePoints(),
      dashboard: this.dashboard()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${store?.name ?? 'store'}-dashboard-report.json`.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    anchor.click();
    URL.revokeObjectURL(url);
  }

  changePeriod(event: Event): void {
    this.selectedPeriod.set((event.target as HTMLSelectElement).value as ChartPeriod);
    this.hoveredRevenueIndex.set(null);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  formatCompactCurrency(value: number): string {
    if (value >= 1000) {
      return `$${Math.round(value / 1000)}K`;
    }
    return this.formatCurrency(value);
  }

  revenuePath(points: RevenuePoint[]): string {
    if (points.length < 2) {
      return '';
    }

    return points.map((point, index) => {
      const x = this.pointX(index, points.length);
      const y = this.pointY(point.value);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  revenueAreaPath(points: RevenuePoint[]): string {
    const line = this.revenuePath(points);
    return `${line} L 560 190 L 0 190 Z`;
  }

  pointX(index: number, total: number): number {
    return total <= 1 ? 0 : (index / (total - 1)) * 560;
  }

  pointY(value: number): number {
    return 190 - (value / this.chartMax()) * 190;
  }

  tooltipX(index: number, total: number): number {
    return Math.min(Math.max(this.pointX(index, total) - 49, 4), 458);
  }

  tooltipY(value: number): number {
    return Math.max(this.pointY(value) - 44, 6);
  }

  performancePath(metric: StorePerformanceMetric): string {
    return this.buildPath(metric.sparkline, 104, 26);
  }

  donutBackground(categories: CategorySales[]): string {
    let cursor = 0;
    const segments = categories.map(category => {
      const start = cursor;
      cursor += category.percentage;
      return `${category.color} ${start}% ${cursor}%`;
    });

    return `conic-gradient(${segments.join(', ')})`;
  }

  private buildPath(values: number[], width: number, height: number): string {
    if (values.length < 2) {
      return '';
    }

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    return values.map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  private buildRevenuePoints(period: ChartPeriod): RevenuePoint[] {
    const baseValues = this.dashboard().revenueOverview.map(point => point.value);
    const store = this.selectedStore();
    const seed = Math.max(store.revenue / 1000, 12);

    if (period === 'Daily') {
      const hourlyShape = [0.12, 0.16, 0.22, 0.28, 0.42, 0.57, 0.68, 0.76, 0.86, 0.74, 0.64, 0.52];
      return hourlyShape.map((multiplier, index) => ({
        label: `${index + 8}${index + 8 < 12 ? 'am' : 'pm'}`,
        value: Math.round(seed * multiplier * 26)
      }));
    }

    if (period === 'Monthly') {
      const monthlyShape = [0.62, 0.7, 0.82, 0.78, 0.9, 1.02, 0.96, 1.08, 1.16, 1.1, 1.22, 1.34];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return months.map((label, index) => ({
        label,
        value: Math.round(seed * monthlyShape[index] * 58)
      }));
    }

    return this.dashboard().revenueOverview.map((point, index) => ({
      ...point,
      value: Math.round(baseValues[index])
    }));
  }
}
