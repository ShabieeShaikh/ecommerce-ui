import { Component, input } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import {
  CategoryAttributeDefinition,
  ProductAttributeData,
} from '../../../models/product-catalog.models';

@Component({
  selector: 'app-dynamic-product-field',
  imports: [ReactiveFormsModule],
  templateUrl: './dynamic-product-field.html',
  styleUrl: './dynamic-product-field.css',
})
export class DynamicProductField {
  readonly definition = input.required<CategoryAttributeDefinition>();
  readonly control = input.required<FormControl<ProductAttributeData>>();
  readonly submitted = input(false);

  invalid(): boolean {
    return this.control().invalid && (this.control().touched || this.submitted());
  }

  isOccasion(): boolean {
    return (
      this.definition().key.toLowerCase() === 'occasion' ||
      this.definition().label.trim().toLowerCase() === 'occasion'
    );
  }

  optionChecked(option: string): boolean {
    const value = this.control().value;
    return Array.isArray(value) && value.includes(option);
  }

  toggleOption(option: string, checked: boolean): void {
    const current = this.control().value;
    const selected = Array.isArray(current) ? current : [];
    this.control().setValue(
      checked ? [...new Set([...selected, option])] : selected.filter((value) => value !== option),
    );
    this.control().markAsDirty();
    this.control().markAsTouched();
  }
}
