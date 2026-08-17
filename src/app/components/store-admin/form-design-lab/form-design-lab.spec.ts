import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { FormDesignLab } from './form-design-lab';

describe('FormDesignLab', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FormDesignLab],
      providers: [provideRouter([])],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('renders the isolated form sections and live preview', () => {
    const fixture = TestBed.createComponent(FormDesignLab);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelectorAll('.form-card')).toHaveLength(4);
    expect(element.querySelector('.preview-content h3')?.textContent?.trim()).toBe(
      'Aura Everyday Sneakers',
    );
  }, 15_000);

  it('updates the preview when form values change', () => {
    const fixture = TestBed.createComponent(FormDesignLab);
    fixture.componentInstance.form.patchValue({
      name: 'Test Trail Shoes',
      price: 75,
      comparePrice: 95,
      quantity: 4,
      lowStock: 5,
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.preview-content h3')?.textContent?.trim()).toBe(
      'Test Trail Shoes',
    );
    expect(element.querySelector('.preview-stock')?.textContent).toContain('Low stock');
    expect(element.querySelector('.preview-stock')?.textContent).toContain('4 units');
  });

  it('shows validation before allowing the UI-only submit state', () => {
    const fixture = TestBed.createComponent(FormDesignLab);
    const component = fixture.componentInstance;
    component.form.controls.name.setValue('');

    component.submit();
    fixture.detectChanges();
    expect(component.submitted()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelector('.error')).not.toBeNull();

    component.form.controls.name.setValue('Valid product');
    component.submit();
    fixture.detectChanges();
    expect(component.submitted()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.success-banner')).not.toBeNull();
  });
});
