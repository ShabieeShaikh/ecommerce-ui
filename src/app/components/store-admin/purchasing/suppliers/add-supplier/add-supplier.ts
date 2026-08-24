import { Component, DestroyRef, inject, signal } from '@angular/core';

import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';

import { SupplierService } from '../../../../../services/supplier.service';
import { StoreService } from '../../../../../services/store.service';

import {
  LocationCountry,
  LocationService,
  LocationState,
} from '../../../../../services/location.service';

import { CreateSupplierRequest, SupplierStatus } from '../models/supplier.model';

@Component({
  selector: 'app-add-supplier',
  imports: [ReactiveFormsModule],
  templateUrl: './add-supplier.html',
  styleUrl: './add-supplier.css',
})
export class AddSupplier {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  private readonly supplierService = inject(SupplierService);
  private readonly storeService = inject(StoreService);

  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isSubmitting = signal(false);

  readonly countries = signal<LocationCountry[]>([]);
  readonly states = signal<LocationState[]>([]);
  readonly cities = signal<string[]>([]);

  readonly isLoadingCountries = signal(false);
  readonly isLoadingCities = signal(false);
  readonly locationError = signal('');

  readonly selectedStoreId = this.storeService.selectedStoreId;

  readonly supplierForm = this.fb.nonNullable.group({
    supplierCode: ['', [Validators.required, Validators.maxLength(30)]],

    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],

    contactPerson: [''],

    email: ['', [Validators.email]],

    phone: ['', [Validators.required, Validators.maxLength(20)]],

    alternatePhone: [''],

    country: [''],
    state: [''],
    city: [''],
    address: [''],
    postalCode: [''],

    taxNumber: [''],

    paymentTerms: [''],

    notes: [''],

    status: ['active' as SupplierStatus],
  });

  constructor() {
    this.loadCountries();
  }
  private loadCountries(): void {
    this.isLoadingCountries.set(true);
    this.locationError.set('');

    this.locationService
      .getCountries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (countries) => {
          this.countries.set(countries);
          this.isLoadingCountries.set(false);
        },
        error: () => {
          this.isLoadingCountries.set(false);
          this.locationError.set('Location options could not be loaded.');
        },
      });
  }

  onCountryChange(): void {
    const countryName = this.supplierForm.controls.country.value;

    // Clear the old state and city when the country changes.
    this.supplierForm.controls.state.setValue('');
    this.supplierForm.controls.city.setValue('');

    this.states.set([]);
    this.cities.set([]);
    this.locationError.set('');

    if (!countryName) {
      return;
    }

    const selectedCountry = this.countries().find((country) => country.name === countryName);

    const availableStates = selectedCountry?.states ?? [];

    this.states.set(availableStates);

    // Some countries do not have states in the API.
    if (availableStates.length === 0) {
      this.loadCities(countryName);
    }
  }

  onStateChange(): void {
    const country = this.supplierForm.controls.country.value;

    const state = this.supplierForm.controls.state.value;

    // Clear the previous city.
    this.supplierForm.controls.city.setValue('');
    this.cities.set([]);
    this.locationError.set('');

    if (country && state) {
      this.loadCities(country, state);
    }
  }

  private loadCities(country: string, state?: string): void {
    this.isLoadingCities.set(true);
    this.locationError.set('');

    this.locationService
      .getCities(country, state)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cities) => {
          this.cities.set(cities);
          this.isLoadingCities.set(false);
        },
        error: () => {
          this.cities.set([]);
          this.isLoadingCities.set(false);
          this.locationError.set('City options could not be loaded.');
        },
      });
  }

  submitSupplier(): void {
    this.clearSupplierCodeDuplicateError();

    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }

    const storeId = this.selectedStoreId();

    if (!storeId) {
      return;
    }

    const supplierCode = this.supplierForm.controls.supplierCode.value.trim();

    if (this.supplierService.isSupplierCodeExists(storeId, supplierCode)) {
      this.setSupplierCodeDuplicateError();
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.supplierForm.getRawValue();

    const request: CreateSupplierRequest = {
      storeId,

      supplierCode,

      name: formValue.name.trim(),

      contactPerson: formValue.contactPerson.trim() || undefined,

      email: formValue.email.trim() || undefined,

      phone: formValue.phone.trim(),

      alternatePhone: formValue.alternatePhone.trim() || undefined,

      country: formValue.country.trim() || undefined,

      state: formValue.state.trim() || undefined,

      city: formValue.city.trim() || undefined,

      address: formValue.address.trim() || undefined,

      postalCode: formValue.postalCode.trim() || undefined,

      taxNumber: formValue.taxNumber.trim() || undefined,

      paymentTerms: formValue.paymentTerms.trim() || undefined,

      notes: formValue.notes.trim() || undefined,

      status: formValue.status,
    };

    this.supplierService.createSupplier(request);

    this.isSubmitting.set(false);

    this.router.navigate(['/store-admin/purchasing/suppliers']);
  }

  cancel(): void {
    this.router.navigate(['/store-admin/purchasing/suppliers']);
  }

  hasError(controlName: keyof typeof this.supplierForm.controls, errorName: string): boolean {
    const control = this.supplierForm.controls[controlName];

    return control.touched && control.hasError(errorName);
  }

  private setSupplierCodeDuplicateError(): void {
    const control = this.supplierForm.controls.supplierCode;

    control.setErrors({
      ...(control.errors ?? {}),
      supplierCodeExists: true,
    });
    control.markAsTouched();
  }

  private clearSupplierCodeDuplicateError(): void {
    const control = this.supplierForm.controls.supplierCode;

    if (!control.hasError('supplierCodeExists')) {
      return;
    }

    const errors = { ...(control.errors ?? {}) };
    delete errors['supplierCodeExists'];
    control.setErrors(Object.keys(errors).length ? errors : null);
  }
}
