import { Component } from '@angular/core';
import { SupplierInvoiceFormBase, SUPPLIER_INVOICE_FORM_IMPORTS } from '../supplier-invoice-form';

@Component({
  selector: 'app-edit-supplier-invoice',
  standalone: true,
  imports: [...SUPPLIER_INVOICE_FORM_IMPORTS],
  templateUrl: '../supplier-invoice-form.html',
  styleUrl: '../supplier-invoice-form.css',
})
export class EditSupplierInvoice extends SupplierInvoiceFormBase {}
