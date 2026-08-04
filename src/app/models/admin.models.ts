export type StoreStatus = 'active' | 'disabled' | 'pending';
export type ProductStatus = 'active' | 'draft' | 'archived';
export type UserRole = 'StoreAdmin' | 'Admin';
export type ToastType = 'success' | 'danger' | 'warning' | 'info';
export type NotificationType = 'order' | 'success' | 'warning' | 'star';

export interface UserStoreSummary {
  id: string;
  name: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  stores: UserStoreSummary[];
}

export interface SocialLinks {
  facebook: string;
  x: string;
  linkedIn: string;
  instagram: string;
}

export interface UserProfile {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  jobTitle: string;
  bio: string;
  avatarUrl: string;
  country: string;
  city: string;
  state: string;
  postalCode: string;
  taxId: string;
  socialLinks: SocialLinks;
}

export type UserProfileUpdate = Partial<Omit<UserProfile, 'userId'>>;

export interface Store {
  id: string;
  name: string;
  category: string;
  description?: string;
  status: StoreStatus;
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
  logoUrl?: string;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  comparePrice?: number;
  stock: number;
  status: ProductStatus;
  imageUrl: string;
  description: string;
  tags: string[];
  weight?: number;
  dimensions?: string;
  rating: number;
  salesCount: number;
}

export interface Category {
  id: string;
  storeId: string;
  name: string;
  productCount: number;
}

export interface DashboardStats {
  totalStores: number;
  activeStores: number;
  disabledStores: number;
  pendingStores: number;
  totalRevenue: number;
  totalOrders: number;
  totalVisitors: number;
  averageRating: number;
}

export type DashboardTrend = 'up' | 'down' | 'neutral';

export interface StoreDashboardKpi {
  id: string;
  label: string;
  value: string;
  change: number;
  trend: DashboardTrend;
  icon: 'revenue' | 'orders' | 'customers' | 'cart' | 'products';
  tone: 'purple' | 'blue' | 'green' | 'orange' | 'violet';
}

export interface RevenuePoint {
  label: string;
  value: number;
}

export interface CategorySales {
  name: string;
  amount: number;
  percentage: number;
  color: string;
}

export interface TopProduct {
  id: string;
  name: string;
  sold: number;
  revenue: number;
  imageTone: string;
}

export interface RecentOrder {
  id: string;
  customer: string;
  amount: number;
  status: 'Delivered' | 'Processing' | 'Shipped';
}

export interface StorePerformanceMetric {
  id: string;
  label: string;
  value: string;
  change: number;
  trend: DashboardTrend;
  tone: 'purple' | 'pink' | 'orange' | 'green';
  sparkline: number[];
}

export interface StoreDashboardData {
  storeId: string;
  dateRangeLabel: string;
  previousRangeLabel: string;
  kpis: StoreDashboardKpi[];
  revenueOverview: RevenuePoint[];
  salesByCategory: CategorySales[];
  topProducts: TopProduct[];
  recentOrders: RecentOrder[];
  performance: StorePerformanceMetric[];
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  icon: NotificationType;
}

export interface Settings {
  id: string;
  userId: string;
  theme: 'light';
  emailNotifications: boolean;
  lowStockAlerts: boolean;
}

export interface Order {
  id: string;
  storeId: string;
  customerName: string;
  total: number;
  status: 'pending' | 'paid' | 'fulfilled' | 'cancelled';
  createdAt: string;
}

export interface Inventory {
  productId: string;
  storeId: string;
  quantity: number;
  lowStockThreshold: number;
}

export interface Analytics {
  storeId: string;
  revenue: number;
  orders: number;
  visitors: number;
  conversionRate: number;
}

export interface ToastNotification {
  id: string;
  message: string;
  type: ToastType;
}

export interface LoginOtpRequest {
  email: string;
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
}

export interface VerifyLoginOtpRequest extends LoginOtpRequest {
  otp: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  data: User & { accessToken?: string };
}
