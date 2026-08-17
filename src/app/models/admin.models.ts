import { ProductAttributeValue, ProductVariant } from './product-catalog.models';

export type StoreStatus = 'active' | 'disabled' | 'pending';
export type ProductStatus = 'active' | 'draft' | 'archived';
export type BranchStatus = 'active' | 'inactive';
export type BranchAddressScope = 'international' | 'national' | 'regional';
export type UserRole = 'StoreAdmin' | 'Admin' | 'User' | string;
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

export interface LoginOtpResponseData {
  userId: string;
  userName: string;
  email: string;
  roles: string[];
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
  bannerUrl?: string;
  inventoryAllocationLimit: number;
}

export interface Product {
  id: string;
  storeId: string;
  name: string;
  sku: string;
  category: string;
  categoryId?: string;
  brand?: string;
  barcode?: string;
  shortDescription?: string;
  taxClass?: string;
  price: number;
  comparePrice?: number;
  stock: number;
  status: ProductStatus;
  imageUrl: string;
  imageUrls?: string[];
  description: string;
  tags: string[];
  attributes?: ProductAttributeValue[];
  variants?: ProductVariant[];
  weight?: number;
  dimensions?: string;
  rating: number;
  salesCount: number;
  createdAt?: string;
  updatedAt?: string;
}

export type ProductUpsert = Omit<Product, 'id' | 'stock' | 'rating' | 'salesCount' | 'createdAt' | 'updatedAt'>;

export interface ProductInventoryAllocation {
  id: string;
  productId: string;
  storeId: string;
  branchId: string | null;
  quantity: number;
  reservedQuantity: number;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export type ProductInventoryInput = Pick<ProductInventoryAllocation, 'storeId' | 'branchId' | 'quantity' | 'lowStockThreshold'> & Partial<Pick<ProductInventoryAllocation, 'reservedQuantity'>>;

export type BranchWeekday = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday';

export interface BranchTimeSlot {
  openingTime: string;
  closingTime: string;
}

export interface BranchOperatingDay {
  day: BranchWeekday;
  isOpen: boolean;
  timeSlots: BranchTimeSlot[];
}

export interface Branch {
  id: string;
  storeId: string;
  addressScope: BranchAddressScope;
  name: string;
  code: string;
  description: string;
  country: string;
  state: string;
  city: string;
  address: string;
  postalCode: string;
  managerName: string;
  managerEmail: string;
  managerPhone: string;
  operatingHours: BranchOperatingDay[];
  status: BranchStatus;
  createdAt: string;
  updatedAt: string;
}

export type BranchUpsert = Omit<Branch, 'id' | 'createdAt' | 'updatedAt'>;

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
  code?: string | null;
  message?: string;
  data: LoginOtpResponseData | null;
}
