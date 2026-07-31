import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../../../services/store.service';

@Component({
  selector: 'app-profile',
  imports: [FormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile {
  readonly storeService = inject(StoreService);

  isSaving = signal(false);
  activeTab = signal<'personal' | 'business' | 'security' | 'activity'>('personal');

  profile = {
    fullName: 'John Doe',
    username: 'johndoe_admin',
    email: 'john@example.com',
    phone: '+1 (555) 234-5678',
    role: 'Super Admin',
    bio: 'Senior Store Manager overseeing digital operations and platform store expansions.',
    avatarUrl: '',
    company: 'DigiShop Global LLC',
    taxId: 'US-987654321',
    address: '777 Commerce Way, Suite 500',
    city: 'San Francisco',
    state: 'CA',
    country: 'United States',
    postalCode: '94103',
    website: 'https://digishop-admin.com',
    linkedin: 'linkedin.com/in/johndoe-admin',
    twitter: '@johndoe_ecommerce'
  };

  activities = [
    { id: 1, action: 'Updated store location', target: 'Fashion Hub Store', timestamp: '10 minutes ago', icon: 'location' },
    { id: 2, action: 'Approved new store creation', target: 'Sports Arena', timestamp: '2 hours ago', icon: 'check' },
    { id: 3, action: 'Changed security settings', target: '2FA Enabled', timestamp: '1 day ago', icon: 'security' },
    { id: 4, action: 'Exported quarterly report', target: 'Analytics Module', timestamp: '3 days ago', icon: 'download' },
    { id: 5, action: 'Logged in from new device', target: 'Chrome / macOS', timestamp: '5 days ago', icon: 'login' }
  ];

  setTab(tab: 'personal' | 'business' | 'security' | 'activity') {
    this.activeTab.set(tab);
  }

  saveProfile() {
    this.isSaving.set(true);
    setTimeout(() => {
      this.isSaving.set(false);
      this.storeService.showToast('Profile updated successfully!', 'success');
    }, 600);
  }

  uploadAvatar() {
    this.storeService.showToast('Avatar upload handler invoked', 'info');
  }
}
