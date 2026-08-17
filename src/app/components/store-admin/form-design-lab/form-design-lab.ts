import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

type AccentOption = { name: string; value: string };
type LabFieldName =
  | 'name'
  | 'sku'
  | 'category'
  | 'brand'
  | 'productType'
  | 'price'
  | 'comparePrice'
  | 'quantity'
  | 'lowStock'
  | 'description'
  | 'status'
  | 'featured'
  | 'trackInventory';

@Component({
  selector: 'app-form-design-lab',
  imports: [ReactiveFormsModule, RouterLink, CurrencyPipe],
  templateUrl: './form-design-lab.html',
  styleUrl: './form-design-lab.css',
})
export class FormDesignLab {
  private readonly fb = inject(FormBuilder);

  readonly submitted = signal(false);
  readonly imagePreview = signal('');
  readonly selectedAccent = signal('#6d5dfc');
  readonly categories = ['Apparel', 'Electronics', 'Home & Living', 'Beauty', 'Sports'];
  readonly accents: AccentOption[] = [
    { name: 'Violet', value: '#6d5dfc' },
    { name: 'Ocean', value: '#1688f8' },
    { name: 'Emerald', value: '#16a36a' },
    { name: 'Sunset', value: '#ef7a45' },
  ];

  readonly form = this.fb.nonNullable.group({
    name: ['Aura Everyday Sneakers', [Validators.required, Validators.maxLength(80)]],
    sku: ['AUR-SNK-001', [Validators.required, Validators.pattern(/^[A-Za-z0-9-]+$/)]],
    category: ['Apparel', Validators.required],
    brand: ['Aura Studio', Validators.required],
    productType: ['physical', Validators.required],
    price: [89, [Validators.required, Validators.min(0)]],
    comparePrice: [119, [Validators.min(0)]],
    quantity: [24, [Validators.required, Validators.min(0)]],
    lowStock: [6, [Validators.required, Validators.min(0)]],
    description: [
      'Lightweight everyday sneakers with a breathable knit upper and responsive cushioning.',
      Validators.maxLength(240),
    ],
    status: ['active', Validators.required],
    featured: [true],
    trackInventory: [true],
  });

  readonly productName = signal(this.form.controls.name.value);
  readonly productCategory = signal(this.form.controls.category.value);
  readonly productPrice = signal(this.form.controls.price.value);
  readonly productComparePrice = signal(this.form.controls.comparePrice.value);
  readonly productQuantity = signal(this.form.controls.quantity.value);
  readonly productLowStock = signal(this.form.controls.lowStock.value);
  readonly stockLabel = computed(() => {
    const quantity = Number(this.productQuantity());
    if (quantity <= 0) return 'Out of stock';
    if (quantity <= Number(this.productLowStock())) return 'Low stock';
    return 'In stock';
  });

  constructor() {
    this.form.valueChanges.subscribe((value) => {
      this.productName.set(value.name ?? '');
      this.productCategory.set(value.category ?? '');
      this.productPrice.set(Number(value.price ?? 0));
      this.productComparePrice.set(Number(value.comparePrice ?? 0));
      this.productQuantity.set(Number(value.quantity ?? 0));
      this.productLowStock.set(Number(value.lowStock ?? 0));
      this.submitted.set(false);
    });
  }

  fieldInvalid(name: LabFieldName): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  selectAccent(color: string): void {
    this.selectedAccent.set(color);
  }

  onImageSelected(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.readImage(file);
  }

  onImageDrop(event: DragEvent): void {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) this.readImage(file);
  }

  allowDrop(event: DragEvent): void {
    event.preventDefault();
  }

  removeImage(): void {
    this.imagePreview.set('');
  }

  saveDraft(): void {
    this.form.controls.status.setValue('draft');
    this.submitted.set(true);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.set(true);
  }

  private readImage(file: File): void {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => this.imagePreview.set(String(reader.result ?? ''));
    reader.readAsDataURL(file);
  }
}
