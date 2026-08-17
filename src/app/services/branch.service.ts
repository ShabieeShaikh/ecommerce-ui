import { Injectable, inject, signal } from '@angular/core';
import { Branch, BranchOperatingDay, BranchUpsert, BranchWeekday } from '../models/admin.models';
import { LocalStorageService } from './local-storage.service';

const BRANCHES_STORAGE_KEY = 'digishop_branches_v1';
const WEEKDAYS: BranchWeekday[] = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

type StoredBranch = Omit<Branch, 'addressScope' | 'operatingHours'> & {
  addressScope?: Branch['addressScope'];
  operatingHours?: BranchOperatingDay[];
  openingTime?: string;
  closingTime?: string;
  workingDays?: string[];
  inventory?: number;
};

export interface BranchManagerRecord {
  key: string;
  name: string;
  email: string;
  phone: string;
  branches: Branch[];
}

const INITIAL_BRANCH_RECORDS: StoredBranch[] = [
  {
    id: 'branch-hg-001', storeId: 'store-003', name: 'DHA Store', code: 'BR-001',
    addressScope: 'international',
    description: 'Home and garden retail branch serving DHA.', country: 'Pakistan', state: 'Punjab', city: 'Lahore',
    address: 'DHA Phase 5', postalCode: '54000', managerName: 'Ali Khan', managerEmail: 'ali.khan@example.com',
    managerPhone: '+92 3001234567', openingTime: '09:00', closingTime: '21:00',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], status: 'active',
    createdAt: '2025-05-12T09:00:00.000Z', updatedAt: '2025-05-12T09:00:00.000Z'
  },
  {
    id: 'branch-hg-002', storeId: 'store-003', name: 'Johar Town Store', code: 'BR-002',
    addressScope: 'international',
    description: 'Johar Town retail and pickup location.', country: 'Pakistan', state: 'Punjab', city: 'Lahore',
    address: 'Main Boulevard, Johar Town', postalCode: '54782', managerName: 'Sara Ahmed', managerEmail: 'sara.ahmed@example.com',
    managerPhone: '+92 3017654321', openingTime: '09:00', closingTime: '21:00',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], status: 'active',
    createdAt: '2025-05-15T09:00:00.000Z', updatedAt: '2025-05-15T09:00:00.000Z'
  },
  {
    id: 'branch-hg-003', storeId: 'store-003', name: 'Satellite Town Store', code: 'BR-003',
    addressScope: 'international',
    description: 'Satellite Town branch for local fulfillment.', country: 'Pakistan', state: 'Punjab', city: 'Rawalpindi',
    address: 'Commercial Market, Satellite Town', postalCode: '46300', managerName: 'Usman Raza', managerEmail: 'usman.raza@example.com',
    managerPhone: '+92 3025550199', openingTime: '09:30', closingTime: '20:30',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], status: 'active',
    createdAt: '2025-05-18T09:00:00.000Z', updatedAt: '2025-05-18T09:00:00.000Z'
  },
  {
    id: 'branch-hg-004', storeId: 'store-003', name: 'Clifton Store', code: 'BR-004',
    addressScope: 'international',
    description: 'Karachi branch serving Clifton and nearby areas.', country: 'Pakistan', state: 'Sindh', city: 'Karachi',
    address: 'Block 5, Clifton', postalCode: '75600', managerName: 'Imran Ali', managerEmail: 'imran.ali@example.com',
    managerPhone: '+92 3032123456', openingTime: '10:00', closingTime: '22:00',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], status: 'active',
    createdAt: '2025-05-20T09:00:00.000Z', updatedAt: '2025-05-20T09:00:00.000Z'
  },
  {
    id: 'branch-hg-005', storeId: 'store-003', name: 'Gulberg Store', code: 'BR-005',
    addressScope: 'international',
    description: 'Seasonal Gulberg branch.', country: 'Pakistan', state: 'Punjab', city: 'Lahore',
    address: 'MM Alam Road, Gulberg', postalCode: '54660', managerName: 'Zainab Malik', managerEmail: 'zainab.malik@example.com',
    managerPhone: '+92 3049876543', openingTime: '10:00', closingTime: '20:00',
    workingDays: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'], status: 'inactive',
    createdAt: '2025-05-25T09:00:00.000Z', updatedAt: '2025-05-25T09:00:00.000Z'
  }
];

const INITIAL_BRANCHES = INITIAL_BRANCH_RECORDS.map(normalizeBranch);

function normalizeBranch(branch: StoredBranch): Branch {
  const { openingTime, closingTime, workingDays, operatingHours, inventory, ...branchData } = branch;
  return {
    ...branchData,
    addressScope: branch.addressScope ?? 'international',
    operatingHours: WEEKDAYS.map(day => {
      const storedDay = operatingHours?.find(option => option.day === day);
      const isOpen = storedDay?.isOpen ?? workingDays?.includes(day) ?? false;
      const timeSlots = storedDay?.timeSlots?.length
        ? storedDay.timeSlots.map(slot => ({ ...slot }))
        : isOpen
          ? [{ openingTime: openingTime ?? '09:00', closingTime: closingTime ?? '18:00' }]
          : [];
      return { day, isOpen, timeSlots: isOpen ? timeSlots : [] };
    })
  };
}

@Injectable({ providedIn: 'root' })
export class BranchService {
  private readonly storage = inject(LocalStorageService);
  private readonly branchesSignal = signal<Branch[]>(this.loadBranches());

  readonly branches = this.branchesSignal.asReadonly();

  getByStore(storeId: string): Branch[] {
    return this.branchesSignal().filter(branch => branch.storeId === storeId);
  }

  getById(id: string): Branch | undefined {
    return this.branchesSignal().find(branch => branch.id === id);
  }

  getManagersByStore(storeId: string): BranchManagerRecord[] {
    const records = new Map<string, BranchManagerRecord>();
    this.branchesSignal()
      .filter(branch => branch.storeId === storeId && branch.managerName.trim())
      .forEach(branch => {
        const key = this.managerIdentityKey(branch.managerName, branch.managerEmail, branch.managerPhone);
        const existing = records.get(key);
        if (existing) {
          existing.branches.push(branch);
          return;
        }
        records.set(key, {
          key,
          name: branch.managerName.trim(),
          email: branch.managerEmail.trim(),
          phone: branch.managerPhone.trim(),
          branches: [branch]
        });
      });
    return [...records.values()].sort((left, right) => left.name.localeCompare(right.name));
  }

  managerIdentityKey(name: string, email: string, phone: string): string {
    const normalizedEmail = email.trim().toLowerCase();
    if (normalizedEmail) return `email:${normalizedEmail}`;
    const normalizedPhone = phone.replace(/\D/g, '');
    if (normalizedPhone) return `phone:${normalizedPhone}`;
    return `name:${name.trim().toLowerCase()}`;
  }

  isCodeAvailable(storeId: string, code: string, excludeId?: string): boolean {
    const normalizedCode = code.trim().toLowerCase();
    return !this.branchesSignal().some(branch =>
      branch.storeId === storeId &&
      branch.id !== excludeId &&
      branch.code.toLowerCase() === normalizedCode
    );
  }

  create(data: BranchUpsert): Branch {
    const timestamp = new Date().toISOString();
    const branch: Branch = {
      ...data,
      id: this.createId(),
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.branchesSignal.update(branches => {
      const updated = [branch, ...branches];
      this.persist(updated);
      return updated;
    });
    return branch;
  }

  update(id: string, data: BranchUpsert): Branch | undefined {
    let updatedBranch: Branch | undefined;
    this.branchesSignal.update(branches => {
      const updated = branches.map(branch => {
        if (branch.id !== id) return branch;
        updatedBranch = { ...branch, ...data, updatedAt: new Date().toISOString() };
        return updatedBranch;
      });
      this.persist(updated);
      return updated;
    });
    return updatedBranch;
  }

  delete(id: string): void {
    this.branchesSignal.update(branches => {
      const updated = branches.filter(branch => branch.id !== id);
      this.persist(updated);
      return updated;
    });
  }

  toggleStatus(id: string): Branch | undefined {
    const branch = this.getById(id);
    if (!branch) return undefined;
    return this.update(id, { ...branch, status: branch.status === 'active' ? 'inactive' : 'active' });
  }

  private loadBranches(): Branch[] {
    const storedBranches = this.storage.getItem<StoredBranch[]>(BRANCHES_STORAGE_KEY);
    if (!storedBranches) return INITIAL_BRANCHES;

    const needsMigration = storedBranches.some(branch => !branch.addressScope || !branch.operatingHours || 'inventory' in branch);
    const migratedBranches = storedBranches.map(normalizeBranch);
    if (needsMigration) this.persist(migratedBranches);
    return migratedBranches;
  }

  private persist(branches: Branch[]): void {
    this.storage.setItem(BRANCHES_STORAGE_KEY, branches);
  }

  private createId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `branch-${crypto.randomUUID()}`;
    }
    return `branch-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  }
}
