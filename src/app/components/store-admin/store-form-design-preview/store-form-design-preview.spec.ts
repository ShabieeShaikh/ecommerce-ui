import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { StoreFormDesignPreview } from './store-form-design-preview';

describe('StoreFormDesignPreview', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StoreFormDesignPreview],
      providers: [provideRouter([])],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  it('preserves every input from the live create-store form', () => {
    const fixture = TestBed.createComponent(StoreFormDesignPreview);
    fixture.detectChanges();
    const expectedControls = [
      'address',
      'city',
      'country',
      'description',
      'email',
      'name',
      'owner',
      'phone',
      'phoneCode',
      'postalCode',
      'state',
      'status',
    ];
    const renderedControls = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('[formControlName]'),
    )
      .map((element) => element.getAttribute('formControlName'))
      .filter((name): name is string => Boolean(name))
      .sort();

    expect(Object.keys(fixture.componentInstance.storeForm.controls).sort()).toEqual(
      expectedControls,
    );
    expect(renderedControls).toEqual(expectedControls);
    expect(
      (fixture.nativeElement as HTMLElement).querySelectorAll('input[type="file"]'),
    ).toHaveLength(2);
  }, 15_000);

  it('keeps country and phone-code selection synchronized', () => {
    const component = TestBed.createComponent(StoreFormDesignPreview).componentInstance;
    component.storeForm.controls.country.setValue('United Arab Emirates');

    component.onCountryChange();

    expect(component.storeForm.controls.phoneCode.value).toBe('+971');
    expect(component.phoneCountry().name).toBe('United Arab Emirates');
  });

  it('updates the live store identity preview without saving data', () => {
    const fixture = TestBed.createComponent(StoreFormDesignPreview);
    fixture.componentInstance.storeForm.patchValue({
      name: 'North Star Market',
      owner: 'Sara Khan',
      city: 'Karachi',
      country: 'Pakistan',
    });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.store-identity h3')?.textContent?.trim()).toBe(
      'North Star Market',
    );
    expect(element.querySelector('.preview-location')?.textContent).toContain('Karachi, Pakistan');
  });

  it('validates required inputs before showing the preview confirmation', () => {
    const fixture = TestBed.createComponent(StoreFormDesignPreview);
    const component = fixture.componentInstance;

    component.submitPreview();
    fixture.detectChanges();
    expect(component.storeForm.invalid).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.field-error')).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.preview-message')).toBeNull();

    component.storeForm.patchValue({
      name: 'North Star Market',
      owner: 'Sara Khan',
      email: 'sara@example.com',
      phone: '3001234567',
      country: 'Pakistan',
      state: 'Sindh',
      city: 'Karachi',
      address: '12 Main Boulevard',
      postalCode: '75500',
    });
    component.submitPreview();
    fixture.detectChanges();
    expect(component.storeForm.valid).toBe(true);
    expect((fixture.nativeElement as HTMLElement).querySelector('.preview-message')).not.toBeNull();
  });
});
