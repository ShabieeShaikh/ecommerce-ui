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

export const routes: Routes = [
  {
    path: 'register',
    component: Register
  },
  {
    path: 'login',
    component: Login
  },
  {
    path: 'store-admin',
    component: StoreAdminLayout,
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        component: Dashboard
      },
      {
        path: 'stores',
        component: StoreListing
      },
      {
        path: 'stores/create',
        component: CreateStore
      },
      {
        path: 'analytics',
        component: Analytics
      },
      {
        path: 'locations',
        component: StoreLocations
      },
      {
        path: 'settings',
        component: Settings
      },
      {
        path: 'profile',
        component: Profile
      },
      {
        path: 'products',
        component: Products
      }
    ]
  },
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full'
  }
];
