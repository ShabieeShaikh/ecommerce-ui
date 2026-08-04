import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { finalize } from 'rxjs';
import { SocialLinks, UserProfile } from '../../../models/admin.models';
import { ProfileService } from '../../../services/profile.service';
import { StoreService } from '../../../services/store.service';

type EditableSection = 'personal' | 'address';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrl: './profile.css'
})
export class Profile implements OnInit {
  private readonly profileService = inject(ProfileService);
  private readonly storeService = inject(StoreService);

  readonly profile = this.profileService.profile;
  readonly fullName = this.profileService.fullName;
  readonly initials = computed(() => this.fullName()
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join(''));
  readonly editingSection = signal<EditableSection | null>(null);
  readonly isSaving = signal(false);

  readonly personalForm = new FormGroup({
    firstName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    lastName: new FormControl('', { nonNullable: true }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    phone: new FormControl('', { nonNullable: true }),
    jobTitle: new FormControl('', { nonNullable: true }),
    bio: new FormControl('', { nonNullable: true }),
    facebook: new FormControl('', { nonNullable: true }),
    x: new FormControl('', { nonNullable: true }),
    linkedIn: new FormControl('', { nonNullable: true }),
    instagram: new FormControl('', { nonNullable: true })
  });

  readonly addressForm = new FormGroup({
    country: new FormControl('', { nonNullable: true }),
    city: new FormControl('', { nonNullable: true }),
    state: new FormControl('', { nonNullable: true }),
    postalCode: new FormControl('', { nonNullable: true }),
    taxId: new FormControl('', { nonNullable: true })
  });

  ngOnInit(): void {
    this.profileService.getProfile().subscribe(profile => this.populateForms(profile));
  }

  beginEdit(section: EditableSection): void {
    this.populateForms(this.profile());
    this.editingSection.set(section);
  }

  cancelEdit(): void {
    this.populateForms(this.profile());
    this.editingSection.set(null);
  }

  savePersonal(): void {
    if (this.personalForm.invalid) {
      this.personalForm.markAllAsTouched();
      return;
    }

    const value = this.personalForm.getRawValue();
    const socialLinks: SocialLinks = {
      facebook: value.facebook,
      x: value.x,
      linkedIn: value.linkedIn,
      instagram: value.instagram
    };

    this.save({
      firstName: value.firstName,
      lastName: value.lastName,
      email: value.email,
      phone: value.phone,
      jobTitle: value.jobTitle,
      bio: value.bio,
      socialLinks
    }, 'Profile updated successfully.');
  }

  saveAddress(): void {
    const value = this.addressForm.getRawValue();
    this.save(value, 'Address updated successfully.');
  }

  onAvatarSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';

    if (!file) {
      return;
    }

    if (!file.type.startsWith('image/')) {
      this.storeService.showToast('Please select an image file.', 'warning');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      this.storeService.showToast('Please select an image smaller than 2 MB.', 'warning');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const avatarUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!avatarUrl) {
        this.storeService.showToast('Unable to read the selected image.', 'danger');
        return;
      }

      this.profileService.updateAvatar(avatarUrl).subscribe(() => {
        this.storeService.showToast('Profile photo updated successfully.', 'success');
      });
    };
    reader.onerror = () => this.storeService.showToast('Unable to read the selected image.', 'danger');
    reader.readAsDataURL(file);
  }

  socialUrl(value: string): string | null {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      return null;
    }

    return /^https?:\/\//i.test(trimmedValue) ? trimmedValue : `https://${trimmedValue}`;
  }

  locationLabel(): string {
    return [this.profile().city, this.profile().state, this.profile().country]
      .filter(Boolean)
      .join(', ');
  }

  private save(changes: Partial<UserProfile>, successMessage: string): void {
    this.isSaving.set(true);
    this.profileService.updateProfile(changes)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: profile => {
          this.populateForms(profile);
          this.editingSection.set(null);
          this.storeService.showToast(successMessage, 'success');
        },
        error: () => this.storeService.showToast('We could not save your changes. Please try again.', 'danger')
      });
  }

  private populateForms(profile: UserProfile): void {
    this.personalForm.reset({
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      jobTitle: profile.jobTitle,
      bio: profile.bio,
      facebook: profile.socialLinks.facebook,
      x: profile.socialLinks.x,
      linkedIn: profile.socialLinks.linkedIn,
      instagram: profile.socialLinks.instagram
    });
    this.addressForm.reset({
      country: profile.country,
      city: profile.city,
      state: profile.state,
      postalCode: profile.postalCode,
      taxId: profile.taxId
    });
  }
}
