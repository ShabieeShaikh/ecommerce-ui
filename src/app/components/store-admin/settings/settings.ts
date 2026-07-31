import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../../../services/store.service';

@Component({
  selector: 'app-settings',
  imports: [FormsModule],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class Settings {
  readonly storeService = inject(StoreService);

  activeSection = signal<'general' | 'notifications' | 'security' | 'billing' | 'danger'>('general');
  isSaving = signal(false);
  showPasswordForm = signal(false);

  // General settings
  generalForm = {
    storeName: 'DigiShop Admin',
    timezone: 'Asia/Karachi',
    currency: 'USD',
    language: 'en',
    dateFormat: 'MM/DD/YYYY',
    itemsPerPage: '10',
  };

  // Notification preferences
  notifications = {
    emailNewOrder: true,
    emailLowStock: true,
    emailNewStore: false,
    emailWeeklyReport: true,
    smsNewOrder: false,
    smsLowStock: true,
    pushNewOrder: true,
    pushStoreUpdate: true,
  };

  // Security
  securityForm = {
    currentPassword: '',
    newPassword: '',
    confirmNewPassword: '',
    twoFactor: false,
    sessionTimeout: '60',
  };

  timezones = [
    'UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
    'Europe/London', 'Europe/Paris', 'Asia/Karachi', 'Asia/Dubai',
    'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney'
  ];

  currencies = ['USD', 'EUR', 'GBP', 'AED', 'PKR', 'INR', 'SAR', 'CAD', 'AUD'];
  languages  = [{ code: 'en', label: 'English' }, { code: 'ar', label: 'Arabic' }, { code: 'fr', label: 'French' }, { code: 'de', label: 'German' }];

  setSection(s: 'general' | 'notifications' | 'security' | 'billing' | 'danger') {
    this.activeSection.set(s);
  }

  saveGeneral() {
    this.isSaving.set(true);
    setTimeout(() => {
      this.isSaving.set(false);
      this.storeService.showToast('General settings saved successfully!', 'success');
    }, 700);
  }

  saveNotifications() {
    this.isSaving.set(true);
    setTimeout(() => {
      this.isSaving.set(false);
      this.storeService.showToast('Notification preferences updated!', 'success');
    }, 500);
  }

  savePassword() {
    if (this.securityForm.newPassword !== this.securityForm.confirmNewPassword) {
      this.storeService.showToast('Passwords do not match!', 'danger');
      return;
    }
    if (this.securityForm.newPassword.length < 8) {
      this.storeService.showToast('Password must be at least 8 characters!', 'warning');
      return;
    }
    this.isSaving.set(true);
    setTimeout(() => {
      this.isSaving.set(false);
      this.securityForm.currentPassword = '';
      this.securityForm.newPassword = '';
      this.securityForm.confirmNewPassword = '';
      this.showPasswordForm.set(false);
      this.storeService.showToast('Password changed successfully!', 'success');
    }, 700);
  }

  onDeactivate() {
    if (confirm('Are you sure you want to deactivate your account? This action cannot be undone.')) {
      this.storeService.showToast('Account deactivation request submitted.', 'warning');
    }
  }
}
