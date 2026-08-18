import { Routes } from '@angular/router';
import { Register } from './components/register/register';
import { Login } from './components/login/login';
import { StoreAdminLayout } from './components/store-admin/layout/store-admin-layout';
import { Dashboard } from './components/store-admin/dashboard/dashboard';
import { StoreListing } from './components/store-admin/store-listing/store-listing';
import { CreateStore } from './components/store-admin/create-store/create-store';
import { Analytics } from './components/store-admin/analytics/analytics';
import { StoreLocations } from './components/store-admin/store-locations/store-locations';
import { Settings } from './components/store-admin/settings/settings';
import { Profile } from './components/store-admin/profile/profile';
import { Products } from './components/store-admin/products/products';
import { BranchListing } from './components/store-admin/branch-listing/branch-listing';
import { BranchForm } from './components/store-admin/branch-form/branch-form';
import { ProductForm } from './components/store-admin/product-form/product-form';
import { ManagerListing } from './components/store-admin/manager-listing/manager-listing';
import { StoreDetails } from './components/store-admin/store-details/store-details';
import { SupplierList } from './components/store-admin/purchasing/suppliers/supplier-list/supplier-list';

const loadWarehouseManagement = () =>
  import('./components/store-admin/warehouse-management/warehouse-management').then(
    (module) => module.WarehouseManagement,
  );

export const routes: Routes = [
  {
    path: 'register',
    component: Register,
  },
  {
    path: 'login',
    component: Login,
  },
  {
    path: 'store-admin',
    component: StoreAdminLayout,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
      {
        path: 'dashboard',
        component: Dashboard,
      },
      {
        path: 'stores',
        component: StoreListing,
      },
      {
        path: 'stores/create',
        component: CreateStore,
      },
      {
        path: 'purchasing/suppliers',
        component: SupplierList
      },
      {
        path: 'store-form-design-preview',
        loadComponent: () =>
          import('./components/store-admin/store-form-design-preview/store-form-design-preview').then(
            (module) => module.StoreFormDesignPreview,
          ),
      },
      {
        path: 'stores/:id/edit',
        component: CreateStore,
      },
      {
        path: 'stores/:id',
        component: StoreDetails,
      },
      {
        path: 'analytics',
        component: Analytics,
      },
      {
        path: 'locations',
        component: StoreLocations,
      },
      {
        path: 'settings',
        component: Settings,
      },
      {
        path: 'profile',
        component: Profile,
      },
      {
        path: 'products',
        component: Products,
      },
      {
        path: 'products/create',
        component: ProductForm,
      },
      {
        path: 'products/:id/edit',
        component: ProductForm,
      },
      {
        path: 'products/:id',
        loadComponent: () =>
          import('./components/store-admin/product-details/product-details').then(
            (module) => module.ProductDetails,
          ),
      },
      {
        path: 'form-design-lab',
        loadComponent: () =>
          import('./components/store-admin/form-design-lab/form-design-lab').then(
            (module) => module.FormDesignLab,
          ),
      },
      {
        path: 'branches',
        component: BranchListing,
      },
      {
        path: 'branches/create',
        component: BranchForm,
      },
      {
        path: 'branches/:id/edit',
        component: BranchForm,
      },
      {
        path: 'managers',
        component: ManagerListing,
      },
      {
        path: 'catalog/categories',
        loadComponent: () =>
          import('./components/store-admin/catalog-management/catalog-management').then(
            (module) => module.CatalogManagement,
          ),
        data: { catalogSection: 'categories' },
      },
      {
        path: 'catalog/categories/:id',
        loadComponent: () =>
          import('./components/store-admin/category-details/category-details').then(
            (module) => module.CategoryDetails,
          ),
      },
      {
        path: 'catalog/attributes',
        loadComponent: () =>
          import('./components/store-admin/catalog-management/catalog-management').then(
            (module) => module.CatalogManagement,
          ),
        data: { catalogSection: 'attributes' },
      },
      {
        path: 'catalog/brands',
        loadComponent: () =>
          import('./components/store-admin/catalog-management/catalog-management').then(
            (module) => module.CatalogManagement,
          ),
        data: { catalogSection: 'brands' },
      },
      {
        path: 'inventory',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'overview' },
      },
      {
        path: 'inventory/add',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'add' },
      },
      {
        path: 'inventory/allocate',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'allocate' },
      },
      {
        path: 'inventory/transfer',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'transfer' },
      },
      {
        path: 'inventory/adjustments',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'adjustment' },
      },
      {
        path: 'inventory/reports',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'reports' },
      },
      {
        path: 'inventory/warehouse-integration',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'warehouse' },
      },
      {
        path: 'inventory/order-integration',
        loadComponent: () =>
          import('./components/store-admin/inventory-management/inventory-management').then(
            (module) => module.InventoryManagement,
          ),
        data: { inventorySection: 'orders' },
      },
      {
        path: 'warehouses/overview',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'overview' },
      },
      {
        path: 'warehouses',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'warehouses' },
      },
      {
        path: 'warehouses/receive',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'receive' },
      },
      {
        path: 'warehouses/stock',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'stock' },
      },
      {
        path: 'warehouses/transfer',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'transfer' },
      },
      {
        path: 'warehouses/adjustments',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'adjustment' },
      },
      {
        path: 'warehouses/movements',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'movements' },
      },
      {
        path: 'warehouses/reports',
        loadComponent: loadWarehouseManagement,
        data: { warehouseSection: 'reports' },
      },
    ],
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
