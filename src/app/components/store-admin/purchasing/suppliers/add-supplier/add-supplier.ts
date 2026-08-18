import { Component, inject, signal } from '@angular/core';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';

import { SupplierService } from '../../../../../services/supplier.service';
import { StoreService } from '../../../../../services/store.service';

import {
  CreateSupplierRequest,
  SupplierStatus
} from '../models/supplier.model';

@Component({
  selector: 'app-add-supplier',
  imports: [ReactiveFormsModule],
  templateUrl: './add-supplier.html',
  styleUrl: './add-supplier.css'
})
export class AddSupplier {

  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);

  private readonly supplierService = inject(SupplierService);
  private readonly storeService = inject(StoreService);

  readonly isSubmitting = signal(false);

  readonly selectedStoreId = this.storeService.selectedStoreId;

  readonly supplierForm = this.fb.nonNullable.group({

    supplierCode: [
      '',
      [
        Validators.required,
        Validators.maxLength(30)
      ]
    ],

    name: [
      '',
      [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100)
      ]
    ],

    contactPerson: [''],

    email: [
      '',
      [
        Validators.email
      ]
    ],

    phone: [
      '',
      [
        Validators.required,
        Validators.maxLength(20)
      ]
    ],

    alternatePhone: [''],

    country: [''],
    state: [''],
    city: [''],
    address: [''],
    postalCode: [''],

    taxNumber: [''],

    paymentTerms: [''],

    notes: [''],

    status: ['active' as SupplierStatus]
  });


  submitSupplier(): void {

    if (this.supplierForm.invalid) {
      this.supplierForm.markAllAsTouched();
      return;
    }

    const storeId = this.selectedStoreId();

    if (!storeId) {
      return;
    }

    this.isSubmitting.set(true);

    const formValue = this.supplierForm.getRawValue();

    const request: CreateSupplierRequest = {

      storeId,

      supplierCode: formValue.supplierCode.trim(),

      name: formValue.name.trim(),

      contactPerson:
        formValue.contactPerson.trim() || undefined,

      email:
        formValue.email.trim() || undefined,

      phone:
        formValue.phone.trim(),

      alternatePhone:
        formValue.alternatePhone.trim() || undefined,

      country:
        formValue.country.trim() || undefined,

      state:
        formValue.state.trim() || undefined,

      city:
        formValue.city.trim() || undefined,

      address:
        formValue.address.trim() || undefined,

      postalCode:
        formValue.postalCode.trim() || undefined,

      taxNumber:
        formValue.taxNumber.trim() || undefined,

      paymentTerms:
        formValue.paymentTerms.trim() || undefined,

      notes:
        formValue.notes.trim() || undefined,

      status: formValue.status
    };

    this.supplierService.createSupplier(request);

    this.isSubmitting.set(false);

    this.router.navigate([
      '/store-admin/purchasing/suppliers'
    ]);
  }


  cancel(): void {

    this.router.navigate([
      '/store-admin/purchasing/suppliers'
    ]);
  }


  hasError(
    controlName: keyof typeof this.supplierForm.controls,
    errorName: string
  ): boolean {

    const control =
      this.supplierForm.controls[controlName];

    return (
      control.touched &&
      control.hasError(errorName)
    );
  }

}