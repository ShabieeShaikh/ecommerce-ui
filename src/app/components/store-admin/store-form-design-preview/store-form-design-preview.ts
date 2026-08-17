import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { StoreStatus } from '../../../models/admin.models';

type MediaKind = 'logo' | 'banner';
type StorePreviewField = keyof StoreFormDesignPreview['storeForm']['controls'];

interface CountryOption {
  name: string;
  dialCode: string;
  flagUrl: string;
  flagAlt: string;
}

const COUNTRIES: CountryOption[] = [
  {
    name: 'Pakistan',
    dialCode: '+92',
    flagUrl: 'https://flagcdn.com/pk.svg',
    flagAlt: 'Pakistan flag',
  },
  {
    name: 'United States',
    dialCode: '+1',
    flagUrl: 'https://flagcdn.com/us.svg',
    flagAlt: 'United States flag',
  },
  {
    name: 'United Kingdom',
    dialCode: '+44',
    flagUrl: 'https://flagcdn.com/gb.svg',
    flagAlt: 'United Kingdom flag',
  },
  { name: 'Canada', dialCode: '+1', flagUrl: 'https://flagcdn.com/ca.svg', flagAlt: 'Canada flag' },
  {
    name: 'Australia',
    dialCode: '+61',
    flagUrl: 'https://flagcdn.com/au.svg',
    flagAlt: 'Australia flag',
  },
  {
    name: 'Germany',
    dialCode: '+49',
    flagUrl: 'https://flagcdn.com/de.svg',
    flagAlt: 'Germany flag',
  },
  { name: 'India', dialCode: '+91', flagUrl: 'https://flagcdn.com/in.svg', flagAlt: 'India flag' },
  {
    name: 'United Arab Emirates',
    dialCode: '+971',
    flagUrl: 'https://flagcdn.com/ae.svg',
    flagAlt: 'United Arab Emirates flag',
  },
  {
    name: 'Saudi Arabia',
    dialCode: '+966',
    flagUrl: 'https://flagcdn.com/sa.svg',
    flagAlt: 'Saudi Arabia flag',
  },
];

function trimmedRequired(control: AbstractControl): { required: true } | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true };
}

@Component({
  selector: 'app-store-form-design-preview',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './store-form-design-preview.html',
  styleUrl: './store-form-design-preview.css',
})
export class StoreFormDesignPreview {
  private readonly formBuilder = inject(NonNullableFormBuilder);

  readonly countries = COUNTRIES;
  readonly submitted = signal(false);
  readonly logoPreview = signal('');
  readonly bannerPreview = signal('');
  readonly logoFileName = signal('No file chosen');
  readonly bannerFileName = signal('No file chosen');

  readonly storeForm = this.formBuilder.group({
    name: ['', [trimmedRequired, Validators.minLength(2), Validators.maxLength(80)]],
    owner: ['', [trimmedRequired, Validators.minLength(2), Validators.maxLength(100)]],
    description: ['', [Validators.maxLength(500)]],
    email: ['', [trimmedRequired, Validators.email, Validators.maxLength(120)]],
    phoneCode: ['+92', [Validators.required]],
    phone: ['', [trimmedRequired, Validators.pattern(/^[0-9][0-9 ()-]{6,17}$/)]],
    country: ['', [trimmedRequired]],
    state: ['', [trimmedRequired, Validators.maxLength(80)]],
    city: ['', [trimmedRequired, Validators.maxLength(80)]],
    address: ['', [trimmedRequired, Validators.minLength(5), Validators.maxLength(200)]],
    postalCode: ['', [trimmedRequired, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/)]],
    status: ['active' as StoreStatus, [Validators.required]],
  });

  fieldInvalid(field: StorePreviewField): boolean {
    const control = this.storeForm.controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  fieldError(field: StorePreviewField): string {
    const control = this.storeForm.controls[field];
    if (!this.fieldInvalid(field)) return '';
    if (control.hasError('required')) return 'This field is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    if (control.hasError('minlength')) return 'Enter at least 2 characters.';
    if (field === 'phone') return 'Enter a valid 7 to 18 digit phone number.';
    if (field === 'postalCode') return 'Enter a valid postal code.';
    return 'Check this value and try again.';
  }

  onCountryChange(): void {
    const country = this.countries.find(
      (option) => option.name === this.storeForm.controls.country.value,
    );
    if (country) this.storeForm.controls.phoneCode.setValue(country.dialCode);
  }

  phoneCountry(): CountryOption {
    const selectedCountry = this.countries.find(
      (country) => country.name === this.storeForm.controls.country.value,
    );
    const currentDialCode = this.storeForm.controls.phoneCode.value;
    return (
      (selectedCountry?.dialCode === currentDialCode ? selectedCountry : undefined) ??
      this.countries.find((country) => country.dialCode === currentDialCode) ??
      selectedCountry ??
      this.countries[0]
    );
  }

  onMediaSelected(event: Event, kind: MediaKind): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const preview = String(reader.result ?? '');
      if (kind === 'logo') {
        this.logoPreview.set(preview);
        this.logoFileName.set(file.name);
      } else {
        this.bannerPreview.set(preview);
        this.bannerFileName.set(file.name);
      }
    };
    reader.readAsDataURL(file);
  }

  removeMedia(kind: MediaKind, input: HTMLInputElement): void {
    input.value = '';
    if (kind === 'logo') {
      this.logoPreview.set('');
      this.logoFileName.set('No file chosen');
    } else {
      this.bannerPreview.set('');
      this.bannerFileName.set('No file chosen');
    }
  }

  submitPreview(): void {
    this.submitted.set(true);
    if (this.storeForm.invalid) {
      this.storeForm.markAllAsTouched();
      return;
    }
  }
}
