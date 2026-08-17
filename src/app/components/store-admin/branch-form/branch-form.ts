import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  Branch,
  BranchAddressScope,
  BranchOperatingDay,
  BranchStatus,
  BranchTimeSlot,
  BranchUpsert,
  BranchWeekday,
} from '../../../models/admin.models';
import { BranchManagerRecord, BranchService } from '../../../services/branch.service';
import {
  LocationCountry,
  LocationService,
  LocationState,
} from '../../../services/location.service';
import { StoreService } from '../../../services/store.service';

type ControlName =
  | 'name'
  | 'code'
  | 'description'
  | 'addressScope'
  | 'country'
  | 'state'
  | 'city'
  | 'address'
  | 'postalCode'
  | 'managerMode'
  | 'existingManagerKey'
  | 'managerName'
  | 'managerEmail'
  | 'phoneCode'
  | 'managerPhone'
  | 'status';

type ManagerMode = 'existing' | 'new';

const STEPS = [
  { id: 1, label: 'Branch Info' },
  { id: 2, label: 'Address' },
  { id: 3, label: 'Manager & Hours' },
  { id: 4, label: 'Review' },
];

const PHONE_CODES = ['+92', '+1', '+44', '+61', '+49', '+91', '+971', '+966'];
const DAYS: BranchWeekday[] = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hours = Math.floor(index / 2)
    .toString()
    .padStart(2, '0');
  const minutes = index % 2 ? '30' : '00';
  return `${hours}:${minutes}`;
});
const ADDRESS_SCOPES: { value: BranchAddressScope; label: string }[] = [
  { value: 'international', label: 'International' },
  { value: 'national', label: 'National' },
  { value: 'regional', label: 'Regional' },
];

@Component({
  selector: 'app-branch-form',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './branch-form.html',
  styleUrl: './branch-form.css',
})
export class BranchForm {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly branchService = inject(BranchService);
  private readonly storeService = inject(StoreService);
  private readonly locationService = inject(LocationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly steps = STEPS;
  readonly addressScopes = ADDRESS_SCOPES;
  readonly phoneCodes = PHONE_CODES;
  readonly days = DAYS;
  readonly timeOptions = TIME_OPTIONS;
  readonly branchId = this.route.snapshot.paramMap.get('id');
  readonly isEditMode = this.branchId !== null;
  readonly editingBranch = this.branchId ? this.branchService.getById(this.branchId) : undefined;
  readonly contextStoreId = this.editingBranch?.storeId ?? this.storeService.selectedStore().id;
  readonly contextStore =
    this.storeService.getStoreById(this.contextStoreId) ?? this.storeService.selectedStore();
  readonly availableManagers = computed(() =>
    this.branchService.getManagersByStore(this.contextStoreId),
  );
  readonly activeStep = signal(1);
  readonly highestVisitedStep = signal(this.isEditMode ? 4 : 1);
  readonly operatingHours = signal<BranchOperatingDay[]>(
    this.initialOperatingHours(this.editingBranch),
  );
  readonly slotDayPickerOpen = signal(false);
  readonly selectedSlotDay = signal<BranchWeekday>('Monday');
  readonly submitted = signal(false);
  readonly isSaving = signal(false);
  readonly codeError = signal('');
  readonly scheduleError = signal('');
  readonly dayScheduleErrors = signal<Partial<Record<BranchWeekday, string>>>({});
  readonly countries = signal<LocationCountry[]>([]);
  readonly states = signal<LocationState[]>([]);
  readonly cities = signal<string[]>([]);
  readonly isLoadingCountries = signal(false);
  readonly isLoadingCities = signal(false);
  readonly locationError = signal('');
  readonly manualLocation = signal(false);
  readonly stateRequired = signal(true);
  readonly duplicateManagerError = signal('');

  private cityRequestId = 0;

  private readonly phoneParts = this.splitPhone(this.editingBranch?.managerPhone ?? '');
  private readonly initialManagerKey = this.editingBranch
    ? this.branchService.managerIdentityKey(
        this.editingBranch.managerName,
        this.editingBranch.managerEmail,
        this.editingBranch.managerPhone,
      )
    : '';
  private readonly stepControls: Record<number, ControlName[]> = {
    1: ['name', 'code', 'description'],
    2: ['addressScope'],
    3: ['managerMode'],
    4: [],
  };

  readonly branchForm = this.formBuilder.group({
    name: [
      this.editingBranch?.name ?? '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(80)],
    ],
    code: [
      this.editingBranch?.code ?? '',
      [Validators.required, Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9-]{1,19}$/)],
    ],
    description: [this.editingBranch?.description ?? '', [Validators.maxLength(150)]],
    addressScope: [
      (this.editingBranch?.addressScope ?? '') as BranchAddressScope | '',
      [Validators.required],
    ],
    country: [this.editingBranch?.country ?? '', [Validators.maxLength(80)]],
    state: [this.editingBranch?.state ?? '', [Validators.maxLength(80)]],
    city: [this.editingBranch?.city ?? '', [Validators.maxLength(80)]],
    address: [
      this.editingBranch?.address ?? '',
      [Validators.required, Validators.minLength(5), Validators.maxLength(180)],
    ],
    postalCode: [
      this.editingBranch?.postalCode ?? '',
      [Validators.pattern(/^[A-Za-z0-9][A-Za-z0-9 -]{2,11}$/)],
    ],
    managerMode: [
      (this.editingBranch ? 'existing' : '') as ManagerMode | '',
      [Validators.required],
    ],
    existingManagerKey: [this.editingBranch ? this.initialManagerKey : ''],
    managerName: [this.editingBranch?.managerName ?? ''],
    managerEmail: [this.editingBranch?.managerEmail ?? ''],
    phoneCode: [this.phoneParts.code],
    managerPhone: [this.phoneParts.number],
    status: [(this.editingBranch?.status ?? 'active') as BranchStatus, [Validators.required]],
  });

  constructor() {
    if (this.isEditMode && !this.editingBranch) {
      this.storeService.showToast('The selected branch could not be found.', 'warning');
      this.router.navigate(['/store-admin/branches']);
      return;
    }

    this.configureLocationValidators();
    this.configureManagerValidators();
    this.loadCountries();
    const scope = this.branchForm.controls.addressScope.value;
    if (scope) this.applyAddressScope(scope, true);
  }

  fieldInvalid(name: ControlName): boolean {
    const control = this.branchForm.controls[name];
    return control.invalid && (control.touched || this.submitted());
  }

  fieldError(name: ControlName): string {
    const control = this.branchForm.controls[name];
    if (!this.fieldInvalid(name)) return '';
    if (control.hasError('required')) return 'This field is required.';
    if (control.hasError('email')) return 'Enter a valid email address.';
    if (control.hasError('minlength')) return 'Enter at least 2 characters.';
    if (name === 'code') return 'Use 2-20 letters, numbers, or hyphens.';
    if (name === 'managerPhone') return 'Enter a valid 7 to 18 digit number.';
    if (name === 'postalCode') return 'Enter a valid postal code.';
    return 'This value is not valid.';
  }

  goToStep(step: number): void {
    if (step <= this.highestVisitedStep()) this.activeStep.set(step);
  }

  nextStep(): void {
    if (!this.validateStep(this.activeStep())) return;
    const next = Math.min(4, this.activeStep() + 1);
    this.highestVisitedStep.update((value) => Math.max(value, next));
    this.activeStep.set(next);
  }

  back(): void {
    if (this.activeStep() === 1) {
      this.router.navigate(['/store-admin/branches']);
      return;
    }
    this.activeStep.update((step) => step - 1);
  }

  toggleOperatingDay(day: BranchWeekday): void {
    this.operatingHours.update((schedule) =>
      schedule.map((item) => {
        if (item.day !== day) return item;
        const isOpen = !item.isOpen;
        return {
          ...item,
          isOpen,
          timeSlots: isOpen ? [this.defaultTimeSlot(day)] : [],
        };
      }),
    );
    this.clearScheduleError(day);
  }

  updateTimeSlot(
    day: BranchWeekday,
    slotIndex: number,
    field: keyof BranchTimeSlot,
    event: Event,
  ): void {
    const value = (event.target as HTMLSelectElement).value;
    this.operatingHours.update((schedule) =>
      schedule.map((item) =>
        item.day === day
          ? {
              ...item,
              timeSlots: item.timeSlots.map((slot, index) =>
                index === slotIndex ? { ...slot, [field]: value } : slot,
              ),
            }
          : item,
      ),
    );
    this.clearScheduleError(day);
  }

  addTimeSlot(day: BranchWeekday): void {
    const scheduleDay = this.operatingHours().find((item) => item.day === day);
    if (!scheduleDay?.isOpen) {
      this.operatingHours.update((schedule) =>
        schedule.map((item) =>
          item.day === day
            ? { ...item, isOpen: true, timeSlots: [this.defaultTimeSlot(day)] }
            : item,
        ),
      );
      this.clearScheduleError(day);
      return;
    }

    const lastSlot = scheduleDay.timeSlots.at(-1);
    const openingTime = lastSlot?.closingTime ?? this.defaultTimeSlot(day).openingTime;
    const openingIndex = this.timeOptions.indexOf(openingTime);
    if (openingIndex < 0 || openingIndex >= this.timeOptions.length - 1) {
      this.setDayScheduleError(
        day,
        'No later time is available. Adjust the previous closing time first.',
      );
      return;
    }

    const closingTime = this.timeOptions[Math.min(openingIndex + 4, this.timeOptions.length - 1)];
    this.operatingHours.update((schedule) =>
      schedule.map((item) =>
        item.day === day
          ? { ...item, timeSlots: [...item.timeSlots, { openingTime, closingTime }] }
          : item,
      ),
    );
    this.clearScheduleError(day);
  }

  removeTimeSlot(day: BranchWeekday, slotIndex: number): void {
    this.operatingHours.update((schedule) =>
      schedule.map((item) => {
        if (item.day !== day) return item;
        const timeSlots = item.timeSlots.filter((_, index) => index !== slotIndex);
        return { ...item, isOpen: timeSlots.length > 0, timeSlots };
      }),
    );
    this.clearScheduleError(day);
  }

  toggleSlotDayPicker(): void {
    this.slotDayPickerOpen.update((open) => !open);
  }

  selectSlotDay(event: Event): void {
    this.selectedSlotDay.set((event.target as HTMLSelectElement).value as BranchWeekday);
  }

  addSelectedTimeSlot(): void {
    this.addTimeSlot(this.selectedSlotDay());
    this.slotDayPickerOpen.set(false);
  }

  dayScheduleError(day: BranchWeekday): string {
    return this.dayScheduleErrors()[day] ?? '';
  }

  dayScheduleLabel(scheduleDay: BranchOperatingDay): string {
    if (!scheduleDay.isOpen) return 'Closed';
    return scheduleDay.timeSlots
      .map((slot) => `${this.formatTime(slot.openingTime)} - ${this.formatTime(slot.closingTime)}`)
      .join(', ');
  }

  openDaysCount(): number {
    return this.operatingHours().filter((day) => day.isOpen).length;
  }

  normalizeCode(): void {
    const control = this.branchForm.controls.code;
    control.setValue(control.value.trim().toUpperCase());
    this.codeError.set('');
  }

  onAddressScopeChange(): void {
    const scope = this.branchForm.controls.addressScope.value;
    if (!scope) {
      this.configureLocationValidators();
      return;
    }
    this.applyAddressScope(scope, false);
  }

  onCountryChange(): void {
    if (this.manualLocation()) return;
    this.branchForm.controls.state.setValue('');
    this.branchForm.controls.city.setValue('');
    this.cities.set([]);
    this.populateStates(this.branchForm.controls.country.value, false);
  }

  onStateChange(): void {
    if (this.manualLocation()) return;
    this.branchForm.controls.city.setValue('');
    this.cities.set([]);
    const country = this.branchForm.controls.country.value;
    const state = this.branchForm.controls.state.value;
    if (country && state) this.loadCities(country, state, false);
  }

  enableManualLocation(): void {
    this.manualLocation.set(true);
    this.locationError.set('');
    this.isLoadingCountries.set(false);
    this.isLoadingCities.set(false);
    this.cityRequestId += 1;
  }

  retryLocations(): void {
    this.manualLocation.set(false);
    this.locationError.set('');
    this.locationService.resetCountries();
    this.loadCountries();
  }

  scopeLabel(): string {
    const scope = this.branchForm.controls.addressScope.value;
    return this.addressScopes.find((option) => option.value === scope)?.label ?? '';
  }

  selectManagerMode(mode: ManagerMode): void {
    const currentMode = this.branchForm.controls.managerMode.value;
    if (currentMode === mode) return;

    this.branchForm.controls.managerMode.setValue(mode);
    this.branchForm.controls.managerMode.markAsTouched();
    this.branchForm.controls.existingManagerKey.setValue('');
    this.duplicateManagerError.set('');

    if (mode === 'existing' && this.isEditMode && this.initialManagerKey) {
      this.branchForm.controls.existingManagerKey.setValue(this.initialManagerKey);
      this.fillExistingManager();
    } else {
      this.clearManagerFields();
    }
    this.configureManagerValidators();
  }

  fillExistingManager(): void {
    const key = this.branchForm.controls.existingManagerKey.value;
    const manager = this.availableManagers().find((option) => option.key === key);
    this.duplicateManagerError.set('');
    if (!manager) {
      this.clearManagerFields();
      this.configureManagerValidators();
      return;
    }

    const phone = this.splitPhone(manager.phone);
    this.branchForm.patchValue({
      managerName: manager.name,
      managerEmail: manager.email,
      phoneCode: phone.code,
      managerPhone: phone.number,
    });
    this.configureManagerValidators();
  }

  managerFieldsVisible(): boolean {
    const mode = this.branchForm.controls.managerMode.value;
    return (
      mode === 'new' || (mode === 'existing' && !!this.branchForm.controls.existingManagerKey.value)
    );
  }

  managerModeLabel(): string {
    return this.branchForm.controls.managerMode.value === 'existing'
      ? 'Existing Manager'
      : 'New Manager';
  }

  managerAssignmentLabel(manager: BranchManagerRecord): string {
    const count = manager.branches.length;
    return `${manager.name} - ${count} branch${count === 1 ? '' : 'es'}`;
  }

  async saveBranch(): Promise<void> {
    this.submitted.set(true);
    for (const step of [1, 2, 3]) {
      if (!this.validateStep(step)) {
        this.activeStep.set(step);
        return;
      }
    }
    if (this.isSaving()) return;

    this.isSaving.set(true);
    const value = this.branchForm.getRawValue();
    const data: BranchUpsert = {
      storeId: this.contextStoreId,
      addressScope: value.addressScope as BranchAddressScope,
      name: value.name.trim(),
      code: value.code.trim().toUpperCase(),
      description: value.description.trim(),
      country: value.country,
      state: value.state.trim(),
      city: value.city.trim(),
      address: value.address.trim(),
      postalCode: value.postalCode.trim(),
      managerName: value.managerName.trim(),
      managerEmail: value.managerEmail.trim(),
      managerPhone: `${value.phoneCode} ${value.managerPhone.trim()}`,
      operatingHours: this.operatingHours().map((day) => ({
        ...day,
        timeSlots: day.timeSlots.map((slot) => ({ ...slot })),
      })),
      status: value.status,
    };

    try {
      if (this.isEditMode && this.branchId) {
        this.branchService.update(this.branchId, data);
      } else {
        this.branchService.create(data);
      }
      await Swal.fire({
        title: this.isEditMode ? 'Branch Updated' : 'Branch Created',
        text: `Branch "${data.name}" ${this.isEditMode ? 'was updated' : 'was created'} successfully.`,
        icon: 'success',
        confirmButtonText: 'Continue',
        confirmButtonColor: '#6437e8',
      });
      await this.router.navigate(['/store-admin/branches']);
    } catch {
      this.isSaving.set(false);
      await Swal.fire({
        title: 'Unable to Save Branch',
        text: 'The branch could not be saved. Review the form and try again.',
        icon: 'error',
        confirmButtonColor: '#6437e8',
      });
    }
  }

  formatTime(value: string): string {
    const [hours, minutes] = value.split(':').map(Number);
    return new Intl.DateTimeFormat('en-US', { hour: '2-digit', minute: '2-digit' }).format(
      new Date(2000, 0, 1, hours, minutes),
    );
  }

  fullAddress(): string {
    const value = this.branchForm.getRawValue();
    return [value.address, value.city, value.state, value.country, value.postalCode]
      .filter(Boolean)
      .join(', ');
  }

  private validateStep(step: number): boolean {
    const names = this.controlsForStep(step);
    names.forEach((name) => this.branchForm.controls[name].markAsTouched());
    const invalidControl = names.find((name) => this.branchForm.controls[name].invalid);
    if (invalidControl) {
      this.focusControl(invalidControl);
      return false;
    }

    if (step === 1) {
      this.normalizeCode();
      const code = this.branchForm.controls.code.value;
      if (
        !this.branchService.isCodeAvailable(this.contextStoreId, code, this.branchId ?? undefined)
      ) {
        this.codeError.set('This branch code is already used by another branch in this store.');
        this.focusControl('code');
        return false;
      }
    }

    if (step === 3) {
      if (this.branchForm.controls.managerMode.value === 'new') {
        const duplicate = this.findDuplicateManager();
        if (duplicate) {
          this.duplicateManagerError.set(
            `${duplicate.name} already exists. Select this manager from Existing Managers.`,
          );
          this.focusControl(
            this.branchForm.controls.managerEmail.value ? 'managerEmail' : 'managerPhone',
          );
          return false;
        }
      }
      this.duplicateManagerError.set('');
      if (!this.validateOperatingHours()) return false;
    }
    return true;
  }

  private focusControl(name: ControlName): void {
    requestAnimationFrame(() => {
      if (name === 'managerMode') {
        document.querySelector<HTMLElement>('.manager-mode-option')?.focus();
        return;
      }
      document.querySelector<HTMLElement>(`[formControlName="${name}"]`)?.focus();
    });
  }

  private controlsForStep(step: number): ControlName[] {
    if (step === 3) {
      const mode = this.branchForm.controls.managerMode.value;
      const controls: ControlName[] = ['managerMode'];
      if (!mode) return controls;
      if (mode === 'existing') controls.push('existingManagerKey');
      if (!this.managerFieldsVisible()) return controls;
      controls.push('managerName', 'managerEmail', 'phoneCode', 'managerPhone', 'status');
      return controls;
    }
    if (step !== 2) return this.stepControls[step];

    const scope = this.branchForm.controls.addressScope.value;
    const controls: ControlName[] = ['addressScope'];
    if (!scope) return controls;
    if (scope === 'international') controls.push('country');
    if (scope !== 'regional') controls.push('state', 'city');
    controls.push('address', 'postalCode');
    return controls;
  }

  private configureManagerValidators(): void {
    const mode = this.branchForm.controls.managerMode.value;
    const hasManager = this.managerFieldsVisible();
    this.branchForm.controls.existingManagerKey.setValidators(
      mode === 'existing' ? [Validators.required] : [],
    );
    this.branchForm.controls.managerName.setValidators(
      hasManager ? [Validators.required, Validators.minLength(2), Validators.maxLength(80)] : [],
    );
    this.branchForm.controls.managerEmail.setValidators(
      hasManager ? [Validators.email, Validators.maxLength(120)] : [],
    );
    this.branchForm.controls.phoneCode.setValidators(hasManager ? [Validators.required] : []);
    this.branchForm.controls.managerPhone.setValidators(
      hasManager ? [Validators.required, Validators.pattern(/^[0-9][0-9 ()-]{6,17}$/)] : [],
    );

    for (const control of [
      this.branchForm.controls.existingManagerKey,
      this.branchForm.controls.managerName,
      this.branchForm.controls.managerEmail,
      this.branchForm.controls.phoneCode,
      this.branchForm.controls.managerPhone,
    ]) {
      control.updateValueAndValidity({ emitEvent: false });
    }
  }

  private clearManagerFields(): void {
    this.branchForm.patchValue({
      managerName: '',
      managerEmail: '',
      phoneCode: '+92',
      managerPhone: '',
    });
  }

  private findDuplicateManager(): BranchManagerRecord | undefined {
    const email = this.branchForm.controls.managerEmail.value.trim().toLowerCase();
    const phone =
      `${this.branchForm.controls.phoneCode.value}${this.branchForm.controls.managerPhone.value}`.replace(
        /\D/g,
        '',
      );
    return this.availableManagers().find((manager) => {
      const sameEmail = !!email && manager.email.trim().toLowerCase() === email;
      const samePhone = !!phone && manager.phone.replace(/\D/g, '') === phone;
      return sameEmail || samePhone;
    });
  }

  private initialOperatingHours(branch?: Branch): BranchOperatingDay[] {
    if (branch?.operatingHours?.length) {
      return DAYS.map((day) => {
        const storedDay = branch.operatingHours.find((item) => item.day === day);
        return storedDay
          ? { ...storedDay, timeSlots: storedDay.timeSlots.map((slot) => ({ ...slot })) }
          : { day, isOpen: false, timeSlots: [] };
      });
    }

    return DAYS.map((day) => ({
      day,
      isOpen: !['Saturday', 'Sunday'].includes(day),
      timeSlots: !['Saturday', 'Sunday'].includes(day) ? [this.defaultTimeSlot(day)] : [],
    }));
  }

  private defaultTimeSlot(day: BranchWeekday): BranchTimeSlot {
    return ['Saturday', 'Sunday'].includes(day)
      ? { openingTime: '10:00', closingTime: '16:00' }
      : { openingTime: '09:00', closingTime: '18:00' };
  }

  private validateOperatingHours(): boolean {
    const openDays = this.operatingHours().filter((day) => day.isOpen);
    if (!openDays.length) {
      this.scheduleError.set('Open at least one day and add its operating hours.');
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>('.operating-hours-editor')?.focus(),
      );
      return false;
    }

    const errors: Partial<Record<BranchWeekday, string>> = {};
    for (const scheduleDay of openDays) {
      if (!scheduleDay.timeSlots.length) {
        errors[scheduleDay.day] = 'Add at least one time slot for this day.';
        continue;
      }

      if (scheduleDay.timeSlots.some((slot) => slot.closingTime <= slot.openingTime)) {
        errors[scheduleDay.day] = 'Every closing time must be later than its opening time.';
        continue;
      }

      const orderedSlots = [...scheduleDay.timeSlots].sort((left, right) =>
        left.openingTime.localeCompare(right.openingTime),
      );
      if (
        orderedSlots.some(
          (slot, index) => index > 0 && slot.openingTime < orderedSlots[index - 1].closingTime,
        )
      ) {
        errors[scheduleDay.day] = 'Time slots for the same day cannot overlap.';
      }
    }

    this.dayScheduleErrors.set(errors);
    const firstInvalidDay = DAYS.find((day) => !!errors[day]);
    if (firstInvalidDay) {
      this.scheduleError.set('Correct the highlighted operating hours before continuing.');
      requestAnimationFrame(() =>
        document
          .querySelector<HTMLElement>(`[data-schedule-day="${firstInvalidDay}"] select`)
          ?.focus(),
      );
      return false;
    }

    this.scheduleError.set('');
    return true;
  }

  private clearScheduleError(day: BranchWeekday): void {
    this.scheduleError.set('');
    this.dayScheduleErrors.update((errors) => {
      const updated = { ...errors };
      delete updated[day];
      return updated;
    });
  }

  private setDayScheduleError(day: BranchWeekday, message: string): void {
    this.dayScheduleErrors.update((errors) => ({ ...errors, [day]: message }));
  }

  private applyAddressScope(scope: BranchAddressScope, preserveValues: boolean): void {
    this.locationError.set('');
    const countryControl = this.branchForm.controls.country;
    const stateControl = this.branchForm.controls.state;
    const cityControl = this.branchForm.controls.city;

    if (scope === 'international') {
      if (!preserveValues) {
        countryControl.setValue('');
        stateControl.setValue('');
        cityControl.setValue('');
      }
    } else if (scope === 'national') {
      countryControl.setValue(this.contextStore.country);
      if (!preserveValues) {
        stateControl.setValue('');
        cityControl.setValue('');
      }
    } else {
      countryControl.setValue(this.contextStore.country);
      stateControl.setValue(this.contextStore.state ?? '');
      cityControl.setValue(this.contextStore.city);
    }

    this.states.set([]);
    this.cities.set([]);
    this.stateRequired.set(scope !== 'regional');
    this.configureLocationValidators();

    if (scope !== 'regional' && countryControl.value && this.countries().length) {
      this.populateStates(countryControl.value, preserveValues);
    }
  }

  private configureLocationValidators(): void {
    const scope = this.branchForm.controls.addressScope.value;
    const countryValidators =
      scope === 'international'
        ? [Validators.required, Validators.maxLength(80)]
        : [Validators.maxLength(80)];
    const stateValidators =
      scope && scope !== 'regional' && this.stateRequired()
        ? [Validators.required, Validators.maxLength(80)]
        : [Validators.maxLength(80)];
    const cityValidators =
      scope && scope !== 'regional'
        ? [Validators.required, Validators.maxLength(80)]
        : [Validators.maxLength(80)];

    this.branchForm.controls.country.setValidators(countryValidators);
    this.branchForm.controls.state.setValidators(stateValidators);
    this.branchForm.controls.city.setValidators(cityValidators);
    this.branchForm.controls.country.updateValueAndValidity({ emitEvent: false });
    this.branchForm.controls.state.updateValueAndValidity({ emitEvent: false });
    this.branchForm.controls.city.updateValueAndValidity({ emitEvent: false });
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
          const scope = this.branchForm.controls.addressScope.value;
          const country = this.branchForm.controls.country.value;
          if (scope && scope !== 'regional' && country) this.populateStates(country, true);
        },
        error: () => {
          this.isLoadingCountries.set(false);
          this.locationError.set('Location options could not be loaded.');
        },
      });
  }

  private populateStates(countryName: string, preserveCity: boolean): void {
    const country = this.countries().find(
      (option) => option.name.toLowerCase() === countryName.trim().toLowerCase(),
    );
    const currentState = this.branchForm.controls.state.value.trim();
    let states = country?.states ?? [];

    if (
      currentState &&
      !states.some((state) => state.name.toLowerCase() === currentState.toLowerCase())
    ) {
      states = [...states, { name: currentState, code: '' }].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
    }
    this.states.set(states);
    this.stateRequired.set(states.length > 0);
    this.configureLocationValidators();

    if (!states.length) {
      this.branchForm.controls.state.setValue('');
      this.loadCities(countryName, undefined, preserveCity);
      return;
    }

    if (currentState) {
      this.loadCities(countryName, currentState, preserveCity);
    } else {
      this.cities.set([]);
    }
  }

  private loadCities(country: string, state: string | undefined, preserveCity: boolean): void {
    const requestId = ++this.cityRequestId;
    const currentCity = this.branchForm.controls.city.value.trim();
    if (!preserveCity) this.branchForm.controls.city.setValue('');
    this.isLoadingCities.set(true);
    this.locationError.set('');

    this.locationService
      .getCities(country, state)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (cities) => {
          if (requestId !== this.cityRequestId) return;
          const options =
            currentCity && !cities.some((city) => city.toLowerCase() === currentCity.toLowerCase())
              ? [...cities, currentCity].sort((left, right) => left.localeCompare(right))
              : cities;
          this.cities.set(options);
          this.isLoadingCities.set(false);
        },
        error: () => {
          if (requestId !== this.cityRequestId) return;
          this.cities.set(currentCity ? [currentCity] : []);
          this.isLoadingCities.set(false);
          this.locationError.set('City options could not be loaded.');
        },
      });
  }

  private splitPhone(phone: string): { code: string; number: string } {
    const code =
      [...PHONE_CODES]
        .sort((a, b) => b.length - a.length)
        .find((item) => phone.trim().startsWith(item)) ?? '+92';
    const number = phone.trim().startsWith(code) ? phone.trim().slice(code.length) : phone.trim();
    return { code, number: number.replace(/^[\s()-]+/, '') };
  }
}
