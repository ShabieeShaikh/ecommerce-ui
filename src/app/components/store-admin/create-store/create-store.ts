import { Component, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { StoreService } from '../../../services/store.service';

export interface FormStep   { id: number; title: string; description: string; }
export interface BusinessHour { day: string; isOpen: boolean; openTime: string; closeTime: string; }

const FORM_STEPS: FormStep[] = [
  { id: 1, title: 'Basic Info',  description: 'Name, category, contacts'  },
  { id: 2, title: 'Location',    description: 'Address, map, coordinates'  },
  { id: 3, title: 'Media',       description: 'Logo and banner images'     },
  { id: 4, title: 'Operations',  description: 'Hours, delivery, status'    },
];

const CATEGORIES = [
  'Fashion & Apparel','Electronics','Home & Living','Sports & Fitness',
  'Beauty & Cosmetics','Books & Stationery','Food & Grocery','Gaming & Toys',
  'Jewelry & Accessories','Pets & Animals','Health & Wellness','Automotive','Other',
];
const COUNTRIES  = ['United States','United Kingdom','Canada','Australia','Germany','France','Pakistan','India','UAE','Saudi Arabia','Other'];

const DEFAULT_HOURS: BusinessHour[] = [
  { day: 'Monday',    isOpen: true,  openTime: '09:00', closeTime: '18:00' },
  { day: 'Tuesday',   isOpen: true,  openTime: '09:00', closeTime: '18:00' },
  { day: 'Wednesday', isOpen: true,  openTime: '09:00', closeTime: '18:00' },
  { day: 'Thursday',  isOpen: true,  openTime: '09:00', closeTime: '18:00' },
  { day: 'Friday',    isOpen: true,  openTime: '09:00', closeTime: '18:00' },
  { day: 'Saturday',  isOpen: true,  openTime: '10:00', closeTime: '16:00' },
  { day: 'Sunday',    isOpen: false, openTime: '10:00', closeTime: '16:00' },
];

@Component({
  selector: 'app-create-store',
  imports: [RouterLink, FormsModule],
  templateUrl: './create-store.html',
  styleUrl: './create-store.css'
})
export class CreateStore {
  readonly storeService = inject(StoreService);
  readonly router = inject(Router);

  steps         = FORM_STEPS;
  categories    = CATEGORIES;
  countries     = COUNTRIES;
  businessHours = DEFAULT_HOURS;

  activeStep = signal(1);
  isSaving   = signal(false);

  // Form Fields State
  formData = {
    name: '',
    category: 'Fashion & Apparel',
    description: '',
    status: 'pending' as 'active' | 'disabled' | 'pending',
    phone: '',
    email: '',
    owner: 'John Doe',
    address: '',
    country: 'United States',
    state: '',
    city: '',
    postalCode: '',
    latitude: 40.7128,
    longitude: -74.0060
  };

  setStep(n: number) { this.activeStep.set(n); }
  nextStep()  { if (this.activeStep() < this.steps.length) this.activeStep.update(s => s + 1); }
  prevStep()  { if (this.activeStep() > 1) this.activeStep.update(s => s - 1); }
  isComplete(id: number): boolean { return id < this.activeStep(); }

  saveStore(): void {
    if (this.isSaving()) return;

    // Default name fallback if user didn't enter one
    if (!this.formData.name.trim()) {
      this.formData.name = 'New Boutique Store';
    }
    if (!this.formData.email.trim()) {
      this.formData.email = 'contact@boutique.com';
    }
    if (!this.formData.city.trim()) {
      this.formData.city = 'New York';
    }

    this.isSaving.set(true);

    setTimeout(() => {
      this.storeService.addStore(this.formData);
      this.isSaving.set(false);
      this.router.navigate(['/store-admin/stores']);
    }, 600);
  }
}
