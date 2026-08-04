import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SocialLinks, UserProfile, UserProfileUpdate } from '../models/admin.models';
import { AuthService } from './auth';
import { LocalStorageService } from './local-storage.service';

@Injectable({
  providedIn: 'root'
})
export class ProfileService {
  private readonly storage = inject(LocalStorageService);
  private readonly authService = inject(AuthService);
  private readonly profileSignal = signal<UserProfile>(this.loadProfile());

  readonly profile = this.profileSignal.asReadonly();
  readonly fullName = computed(() => {
    const { firstName, lastName } = this.profileSignal();
    return `${firstName} ${lastName}`.trim();
  });

  getProfile(): Observable<UserProfile> {
    return of(this.profileSignal());
  }

  updateProfile(changes: UserProfileUpdate): Observable<UserProfile> {
    const updatedProfile: UserProfile = {
      ...this.profileSignal(),
      ...changes,
      socialLinks: changes.socialLinks
        ? { ...this.profileSignal().socialLinks, ...changes.socialLinks }
        : this.profileSignal().socialLinks
    };

    this.profileSignal.set(updatedProfile);
    this.storage.setItem(this.profileStorageKey(updatedProfile.userId), updatedProfile);

    return of(updatedProfile);
  }

  updateAvatar(avatarUrl: string): Observable<UserProfile> {
    return this.updateProfile({ avatarUrl });
  }

  private loadProfile(): UserProfile {
    const user = this.authService.getCurrentUser();
    const userId = user?.id ?? 'store-admin-profile';
    const storedProfile = this.storage.getItem<UserProfile>(this.profileStorageKey(userId));

    return storedProfile ?? this.createProfileFromUser(userId, user?.name ?? 'Store Administrator', user?.email ?? 'admin@digishop.local', user?.role ?? 'StoreAdmin');
  }

  private createProfileFromUser(userId: string, name: string, email: string, role: string): UserProfile {
    const [firstName = 'Store', ...lastNameParts] = name.trim().split(/\s+/);

    return {
      userId,
      firstName,
      lastName: lastNameParts.join(' '),
      email,
      phone: '',
      role: role.replace(/([a-z])([A-Z])/g, '$1 $2'),
      jobTitle: 'Store Administrator',
      bio: '',
      avatarUrl: '',
      country: '',
      city: '',
      state: '',
      postalCode: '',
      taxId: '',
      socialLinks: this.defaultSocialLinks()
    };
  }

  private profileStorageKey(userId: string): string {
    return `digishop.profile.${userId}`;
  }

  private defaultSocialLinks(): SocialLinks {
    return {
      facebook: '',
      x: '',
      linkedIn: '',
      instagram: ''
    };
  }
}
