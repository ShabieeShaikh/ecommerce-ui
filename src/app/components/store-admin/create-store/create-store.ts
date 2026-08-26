import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { Store, StoreStatus } from '../../../models/admin.models';
import { StoreService } from '../../../services/store.service';
import { InventoryService } from '../../../services/inventory.service';

type MediaKind = 'logo' | 'banner';
type StoreFormControl = keyof CreateStore['storeForm']['controls'];

interface CountryOption {
  name: string;
  dialCode: string;
  code: string;
  flagUrl: string;
  flagAlt: string;
}

interface CountryApiResponse {
  name?: string;
  alpha2Code?: string;
  callingCodes?: string[];
  flags?: { svg?: string; png?: string };
}

const COUNTRY_API_URL = 'https://countries.dev/countries?fields=name,alpha2Code,callingCodes,flags';

const COUNTRIES: CountryOption[] = [
  {
    name: 'Pakistan',
    dialCode: '+92',
    code: 'pk',
    flagUrl: 'https://flagcdn.com/pk.svg',
    flagAlt: 'Pakistan flag',
  },
  {
    name: 'United States',
    dialCode: '+1',
    code: 'us',
    flagUrl: 'https://flagcdn.com/us.svg',
    flagAlt: 'United States flag',
  },
  {
    name: 'United Kingdom',
    dialCode: '+44',
    code: 'gb',
    flagUrl: 'https://flagcdn.com/gb.svg',
    flagAlt: 'United Kingdom flag',
  },
  {
    name: 'Canada',
    dialCode: '+1',
    code: 'ca',
    flagUrl: 'https://flagcdn.com/ca.svg',
    flagAlt: 'Canada flag',
  },
  {
    name: 'Australia',
    dialCode: '+61',
    code: 'au',
    flagUrl: 'https://flagcdn.com/au.svg',
    flagAlt: 'Australia flag',
  },
  {
    name: 'Germany',
    dialCode: '+49',
    code: 'de',
    flagUrl: 'https://flagcdn.com/de.svg',
    flagAlt: 'Germany flag',
  },
  {
    name: 'India',
    dialCode: '+91',
    code: 'in',
    flagUrl: 'https://flagcdn.com/in.svg',
    flagAlt: 'India flag',
  },
  {
    name: 'United Arab Emirates',
    dialCode: '+971',
    code: 'ae',
    flagUrl: 'https://flagcdn.com/ae.svg',
    flagAlt: 'United Arab Emirates flag',
  },
  {
    name: 'Saudi Arabia',
    dialCode: '+966',
    code: 'sa',
    flagUrl: 'https://flagcdn.com/sa.svg',
    flagAlt: 'Saudi Arabia flag',
  },
];

function trimmedRequired(control: AbstractControl): { required: true } | null {
  return typeof control.value === 'string' && control.value.trim() ? null : { required: true };
}

@Component({
  selector: 'app-create-store',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './create-store.html',
  styleUrl: './create-store.css',
})
export class CreateStore {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly storeService = inject(StoreService);
  private readonly inventoryService = inject(InventoryService);

  countries = [...COUNTRIES];
  readonly storeId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.storeId !== null;
  readonly editingStore = this.storeId ? this.storeService.getStoreById(this.storeId) : undefined;
  readonly submitted = signal(false);
  readonly isSaving = signal(false);
  readonly isProcessingMedia = signal(false);
  readonly logoPreview = signal(this.editingStore?.logoUrl ?? '');
  readonly bannerPreview = signal(this.editingStore?.bannerUrl ?? '');
  readonly logoFileName = signal(this.editingStore?.logoUrl ? 'Current logo' : 'No file chosen');
  readonly bannerFileName = signal(
    this.editingStore?.bannerUrl ? 'Current banner' : 'No file chosen',
  );
  readonly logoError = signal('');
  readonly bannerError = signal('');

  private readonly phoneParts = this.splitPhone(this.editingStore?.phone ?? '');

  readonly storeForm = this.formBuilder.group({
    name: [
      this.editingStore?.name ?? '',
      [trimmedRequired, Validators.minLength(2), Validators.maxLength(80)],
    ],
    owner: [
      this.editingStore?.owner ?? '',
      [trimmedRequired, Validators.minLength(2), Validators.maxLength(100)],
    ],
    description: [this.editingStore?.description ?? '', [Validators.maxLength(500)]],
    email: [
      this.editingStore?.email ?? '',
      [trimmedRequired, Validators.email, Validators.maxLength(120)],
    ],
    phoneCode: [this.phoneParts.code, [Validators.required]],
    phone: [
      this.phoneParts.number,
      [trimmedRequired, Validators.pattern(/^[0-9][0-9 ()-]{6,17}$/)],
    ],
    country: [this.editingStore?.country ?? '', [trimmedRequired]],
    state: [this.editingStore?.state ?? '', [trimmedRequired, Validators.maxLength(80)]],
    city: [this.editingStore?.city ?? '', [trimmedRequired, Validators.maxLength(80)]],
    address: [
      this.editingStore?.address ?? '',
      [trimmedRequired, Validators.minLength(5), Validators.maxLength(200)],
    ],
    postalCode: [
      this.editingStore?.postalCode ?? '',
      [trimmedRequired, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/)],
    ],
    inventoryAllocationLimit: [
      this.editingStore?.inventoryAllocationLimit ?? 1000,
      [
        Validators.required,
        Validators.min(1),
        Validators.max(1000000000),
        Validators.pattern(/^\d+$/),
      ],
    ],
    status: [(this.editingStore?.status ?? 'active') as StoreStatus, [Validators.required]],
  });

  constructor() {
    if (this.isEditMode && !this.editingStore) {
      this.storeService.showToast('The selected store could not be found.', 'warning');
      this.router.navigate(['/store-admin/stores']);
    }

    this.loadCountries();
  }

  fieldInvalid(field: StoreFormControl): boolean {
    const control = this.storeForm.controls[field];
    return control.invalid && (control.touched || this.submitted());
  }

  fieldError(field: StoreFormControl): string {
    const control = this.storeForm.controls[field];
    if (!this.fieldInvalid(field)) return '';
    if (control.hasError('belowCurrentStock')) {
      const currentStock = Number(control.getError('belowCurrentStock')?.currentStock ?? 0);
      return `The limit cannot be below the current physical stock of ${currentStock.toLocaleString('en-US')} units.`;
    }
    if (control.hasError('required')) return 'This field is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    if (control.hasError('minlength')) return 'Enter at least 2 characters.';
    if (control.hasError('maxlength')) return 'This value is too long.';
    if (field === 'phone') return 'Enter a valid 7 to 18 digit phone number.';
    if (field === 'postalCode') return 'Enter a valid postal code.';
    if (field === 'inventoryAllocationLimit')
      return 'Enter a whole-number limit greater than zero.';
    return 'Check this value and try again.';
  }

  onCountryChange(): void {
    const country = this.countries.find(
      (option) => option.name === this.storeForm.controls.country.value,
    );
    if (country) {
      this.storeForm.controls.phoneCode.setValue(country.dialCode);
    }
  }

  phoneCountry(): CountryOption {
    const selectedCountry = this.countries.find(
      (country) => country.name === this.storeForm.controls.country.value,
    );
    const currentDialCode = this.storeForm.controls.phoneCode.value;
    if (selectedCountry?.dialCode === currentDialCode) return selectedCountry;
    const dialCodeCountry = this.countries.find((country) => country.dialCode === currentDialCode);
    return dialCodeCountry ?? selectedCountry ?? this.countries[0] ?? COUNTRIES[0];
  }

  private loadCountries(): void {
    this.http.get<CountryApiResponse[]>(COUNTRY_API_URL).subscribe({
      next: (response) => {
        const countries = response
          .map((country): CountryOption | null => {
            const name = country.name?.trim();
            const code = country.alpha2Code?.toLowerCase();
            const callingCode = country.callingCodes?.[0]?.trim() ?? '';
            const dialCode = callingCode.startsWith('+') ? callingCode : `+${callingCode}`;
            const flagUrl = country.flags?.svg ?? country.flags?.png;
            if (!name || !code || !dialCode || !flagUrl) return null;
            return {
              name,
              code,
              dialCode,
              flagUrl,
              flagAlt: `${name} flag`,
            };
          })
          .filter((country): country is CountryOption => country !== null)
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!countries.length) return;
        this.countries = countries;

        if (this.editingStore?.phone) {
          const phone = this.splitPhone(this.editingStore.phone);
          this.storeForm.controls.phoneCode.setValue(phone.code);
          this.storeForm.controls.phone.setValue(phone.number);
        }
      },
      error: () => {
        // Keep the local fallback list so store creation remains usable offline.
      },
    });
  }

  async onMediaSelected(event: Event, kind: MediaKind): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    const allowedTypes =
      kind === 'logo' ? ['image/png', 'image/jpeg'] : ['image/png', 'image/jpeg', 'image/webp'];
    const maxBytes = kind === 'logo' ? 2 * 1024 * 1024 : 5 * 1024 * 1024;
    const errorSignal = kind === 'logo' ? this.logoError : this.bannerError;

    errorSignal.set('');
    if (!allowedTypes.includes(file.type)) {
      errorSignal.set(
        kind === 'logo' ? 'Choose a PNG or JPG image.' : 'Choose a PNG, JPG, or WebP image.',
      );
      input.value = '';
      return;
    }
    if (file.size > maxBytes) {
      errorSignal.set(
        `${kind === 'logo' ? 'Logo' : 'Banner'} must be ${kind === 'logo' ? '2MB' : '5MB'} or smaller.`,
      );
      input.value = '';
      return;
    }

    this.isProcessingMedia.set(true);
    try {
      const preview = await this.resizeForLocalStorage(
        file,
        kind === 'logo' ? 500 : 1600,
        kind === 'logo' ? 500 : 600,
      );
      if (kind === 'logo') {
        this.logoPreview.set(preview);
        this.logoFileName.set(file.name);
      } else {
        this.bannerPreview.set(preview);
        this.bannerFileName.set(file.name);
      }
    } catch {
      errorSignal.set('The selected image could not be processed.');
      input.value = '';
    } finally {
      this.isProcessingMedia.set(false);
    }
  }

  removeMedia(kind: MediaKind, input: HTMLInputElement): void {
    input.value = '';
    if (kind === 'logo') {
      this.logoPreview.set('');
      this.logoFileName.set('No file chosen');
      this.logoError.set('');
    } else {
      this.bannerPreview.set('');
      this.bannerFileName.set('No file chosen');
      this.bannerError.set('');
    }
  }

  async saveStore(): Promise<void> {
    this.submitted.set(true);
    this.validateInventoryLimit();
    if (this.storeForm.invalid || this.isSaving() || this.isProcessingMedia()) {
      this.storeForm.markAllAsTouched();
      requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            '.field-control.invalid input, .field-control.invalid select, .phone-control.invalid input, textarea.invalid',
          )
          ?.focus();
      });
      return;
    }

    this.isSaving.set(true);
    const value = this.storeForm.getRawValue();
    const storeData: Partial<Store> = {
      name: value.name.trim(),
      owner: value.owner.trim(),
      description: value.description.trim(),
      email: value.email.trim(),
      phone: `${value.phoneCode} ${value.phone.trim()}`,
      country: value.country,
      state: value.state.trim(),
      city: value.city.trim(),
      address: value.address.trim(),
      postalCode: value.postalCode.trim(),
      inventoryAllocationLimit: Number(value.inventoryAllocationLimit),
      status: value.status,
      logoUrl: this.logoPreview() || undefined,
      bannerUrl: this.bannerPreview() || undefined,
      category: this.editingStore?.category ?? 'General Store',
    };

    try {
      if (this.isEditMode && this.storeId) {
        this.storeService.updateStore(this.storeId, storeData, false);
      } else {
        this.storeService.addStore(storeData, false);
      }
      this.storeService.showToast(
        `Store "${storeData.name}" ${this.isEditMode ? 'was updated' : 'was created'} successfully.`,
        'success',
      );
      await this.router.navigate(['/store-admin/stores']);
    } catch {
      this.isSaving.set(false);
      await Swal.fire({
        title: 'Unable to Save Store',
        text: 'The store could not be saved. Try smaller branding images.',
        icon: 'error',
        confirmButtonColor: '#6437e8',
      });
    }
  }

  private validateInventoryLimit(): void {
    const control = this.storeForm.controls.inventoryAllocationLimit;
    const errors = { ...(control.errors ?? {}) };
    delete errors['belowCurrentStock'];
    control.setErrors(Object.keys(errors).length ? errors : null);
    if (!this.isEditMode || !this.storeId || control.invalid) return;
    const currentStock = this.inventoryService.getTotalStock(this.storeId);
    if (Number(control.value) < currentStock) {
      control.setErrors({ ...(control.errors ?? {}), belowCurrentStock: { currentStock } });
    }
  }

  private splitPhone(phone: string): { code: string; number: string } {
    const codes = [...new Set(this.countries.map((country) => country.dialCode))].sort(
      (a, b) => b.length - a.length,
    );
    const code = codes.find((item) => phone.trim().startsWith(item)) ?? '+92';
    const number = phone.trim().startsWith(code) ? phone.trim().slice(code.length) : phone.trim();
    return { code, number: number.replace(/^[\s()-]+/, '') };
  }

  private async resizeForLocalStorage(
    file: File,
    maxWidth: number,
    maxHeight: number,
  ): Promise<string> {
    const source = await this.readFile(file);
    const image = await this.loadImage(source);
    const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas is unavailable.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const outputType =
      file.type === 'image/png'
        ? 'image/png'
        : file.type === 'image/webp'
          ? 'image/webp'
          : 'image/jpeg';
    return canvas.toDataURL(outputType, 0.84);
  }

  private readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Invalid image.'));
      image.src = source;
    });
  }
}
