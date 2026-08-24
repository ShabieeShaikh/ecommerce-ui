import { Component, DestroyRef, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  LocationCountry,
  LocationService,
  LocationState,
} from '../../../../../services/location.service';
import { StoreService } from '../../../../../services/store.service';
import { SupplierService } from '../../../../../services/supplier.service';
import { Supplier, SupplierStatus, UpdateSupplierRequest } from '../models/supplier.model';

@Component({
  selector: 'app-edit-supplier',
  imports: [ReactiveFormsModule],
  templateUrl: './edit-supplier.html',
  styleUrls: ['../add-supplier/add-supplier.css', './edit-supplier.css'],
})
export class EditSupplier {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supplierService = inject(SupplierService);
  private readonly storeService = inject(StoreService);
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  private formSupplierId: number | null = null;

  readonly isSubmitting = signal(false);
  readonly countries = signal<LocationCountry[]>([]);
  readonly states = signal<LocationState[]>([]);
  readonly cities = signal<string[]>([]);
  readonly isLoadingCountries = signal(false);
  readonly isLoadingCities = signal(false);
  readonly locationError = signal('');

  readonly supplierId = this.parseSupplierId(this.route.snapshot.paramMap.get('id'));

  readonly supplier = computed<Supplier | undefined>(() => {
    if (this.supplierId === null) return undefined;

    const supplier = this.supplierService.getSupplierById(this.supplierId);
    return supplier?.storeId === this.storeService.selectedStoreId() ? supplier : undefined;
  });

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
    effect(() => {
      const supplier = this.supplier();

      if (!supplier || this.formSupplierId === supplier.id) return;

      this.prefillForm(supplier);
      this.formSupplierId = supplier.id;
      this.loadCountries();
    });
  }

  submitSupplier(): void {
    this.clearSupplierCodeDuplicateError();

    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }

    const supplier = this.supplier();
    if (!supplier || this.supplierId === null) return;

    const supplierCode = this.supplierForm.controls.supplierCode.value.trim();

    if (this.supplierService.isSupplierCodeExists(supplier.storeId, supplierCode, supplier.id)) {
      this.setSupplierCodeDuplicateError();
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.supplierForm.getRawValue();
    const request: UpdateSupplierRequest = {
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

    const updatedSupplier = this.supplierService.updateSupplier(this.supplierId, request);

    this.isSubmitting.set(false);

    if (updatedSupplier) {
      void this.router.navigate(['/store-admin/purchasing/suppliers', updatedSupplier.id]);
    }
  }

  cancel(): void {
    const supplier = this.supplier();

    if (supplier) {
      void this.router.navigate(['/store-admin/purchasing/suppliers', supplier.id]);
      return;
    }

    this.backToSuppliers();
  }

  backToSuppliers(): void {
    void this.router.navigate(['/store-admin/purchasing/suppliers']);
  }

  onCountryChange(): void {
    const countryName = this.supplierForm.controls.country.value;

    this.supplierForm.controls.state.setValue('');
    this.supplierForm.controls.city.setValue('');
    this.states.set([]);
    this.cities.set([]);
    this.locationError.set('');

    if (!countryName) return;

    const selectedCountry = this.countries().find((country) => country.name === countryName);
    const availableStates = selectedCountry?.states ?? [];

    this.states.set(availableStates);

    if (availableStates.length === 0) {
      this.loadCities(countryName);
    }
  }

  onStateChange(): void {
    const country = this.supplierForm.controls.country.value;
    const state = this.supplierForm.controls.state.value;

    this.supplierForm.controls.city.setValue('');
    this.cities.set([]);
    this.locationError.set('');

    if (country && state) {
      this.loadCities(country, state);
    }
  }

  hasError(controlName: keyof typeof this.supplierForm.controls, errorName: string): boolean {
    const control = this.supplierForm.controls[controlName];
    return control.touched && control.hasError(errorName);
  }

  private prefillForm(supplier: Supplier): void {
    this.supplierForm.setValue({
      supplierCode: supplier.supplierCode,
      name: supplier.name,
      contactPerson: supplier.contactPerson ?? '',
      email: supplier.email ?? '',
      phone: supplier.phone,
      alternatePhone: supplier.alternatePhone ?? '',
      country: supplier.country ?? '',
      state: supplier.state ?? '',
      city: supplier.city ?? '',
      address: supplier.address ?? '',
      postalCode: supplier.postalCode ?? '',
      taxNumber: supplier.taxNumber ?? '',
      paymentTerms: supplier.paymentTerms ?? '',
      notes: supplier.notes ?? '',
      status: supplier.status,
    });
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

    if (!control.hasError('supplierCodeExists')) return;

    const errors = { ...(control.errors ?? {}) };
    delete errors['supplierCodeExists'];
    control.setErrors(Object.keys(errors).length ? errors : null);
  }

  private loadCountries(): void {
    this.isLoadingCountries.set(true);
    this.locationError.set('');

    this.locationService
      .getCountries()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (countries) => {
          const countryValue = this.supplierForm.controls.country.value;
          const hasCurrentCountry = countries.some((country) => country.name === countryValue);
          const availableCountries =
            countryValue && !hasCurrentCountry
              ? [
                  {
                    name: countryValue,
                    iso3: '',
                    states: [],
                  },
                  ...countries,
                ]
              : countries;

          this.countries.set(availableCountries);
          this.isLoadingCountries.set(false);
          this.prepareLocationOptions();
        },
        error: () => {
          this.isLoadingCountries.set(false);
          this.locationError.set('Location options could not be loaded.');
        },
      });
  }

  private prepareLocationOptions(): void {
    const countryName = this.supplierForm.controls.country.value;
    const stateName = this.supplierForm.controls.state.value;

    if (!countryName) return;

    const selectedCountry = this.countries().find((country) => country.name === countryName);
    let availableStates = selectedCountry?.states ?? [];

    if (stateName && !availableStates.some((state) => state.name === stateName)) {
      availableStates = [...availableStates, { name: stateName, code: '' }];
    }

    this.states.set(availableStates);

    if (stateName || availableStates.length === 0) {
      this.loadCities(countryName, stateName || undefined, true);
    }
  }

  private loadCities(country: string, state?: string, preserveCurrentCity = false): void {
    const currentCity = preserveCurrentCity ? this.supplierForm.controls.city.value : '';

    this.isLoadingCities.set(true);
    this.locationError.set('');

    this.locationService
      .getCities(country, state)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cities) => {
          const availableCities =
            currentCity && !cities.includes(currentCity) ? [currentCity, ...cities] : cities;

          this.cities.set(availableCities);
          this.isLoadingCities.set(false);
        },
        error: () => {
          this.cities.set(currentCity ? [currentCity] : []);
          this.isLoadingCities.set(false);
          this.locationError.set('City options could not be loaded.');
        },
      });
  }

  private parseSupplierId(value: string | null): number | null {
    if (value === null || value.trim() === '') return null;

    const id = Number(value);
    return Number.isSafeInteger(id) && id >= 0 ? id : null;
  }
}
