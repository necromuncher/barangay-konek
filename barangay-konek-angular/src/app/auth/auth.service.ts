import { effect, inject, Injectable, signal } from '@angular/core';
import { Session, User } from '@supabase/supabase-js';
import { Account, AccountRole, Barangay } from './auth.models';
import { SEED_BARANGAYS } from './barangays.data';
import { LocalStorageService } from '../local-storage.service';
import { supabase } from './supabase.client';

export const BARANGAYS: Barangay[] = [...SEED_BARANGAYS];

interface ProfileRow {
  id: string;
  address: string;
  violation_count: number;
  banned: boolean;
  suspended_until: string | null;
  marketplace_alerts: boolean;
  marketplace_radius_km: number;
  notification_preferences: Account['notifications'];
}

interface DirectoryRow {
  id: string;
  full_name: string;
  role: AccountRole;
  barangay_id: string | null;
  created_at: string;
}

type AccountOverride = Pick<Account, 'photoUrl' | 'violationCount' | 'banned' | 'suspendedUntil'>;
type AccountOverrides = Record<string, AccountOverride>;

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly account = signal<Account | null>(null);
  readonly authError = signal<string | null>(null);
  private readonly accountsState = signal<Account[]>([]);
  private readonly barangaysState = signal<Barangay[]>([...BARANGAYS]);
  private readonly accountOverrides = signal<AccountOverrides>({});
  private readonly storage = inject(LocalStorageService);
  private activeUser: User | null = null;
  private claimedUserId: string | null = null;
  readonly ready: Promise<void>;
  private readonly directoryKey = 'barangay-konek.directory.v1';
  private readonly overridesKey = 'barangay-konek.account-overrides.v1';

  constructor() {
    const legacy = this.storage.read<AuthState | null>(
      'barangay-konek.auth.v1',
      null,
      isAuthState,
    );
    this.barangaysState.set(this.storage.read<Barangay[]>(
      this.directoryKey,
      legacy?.barangays ?? [...BARANGAYS],
      isBarangayList,
    ));
    this.accountOverrides.set(this.storage.read<AccountOverrides>(
      this.overridesKey,
      {},
      isAccountOverrides,
    ));

    effect(() => this.storage.write(this.directoryKey, this.barangaysState()));
    this.ready = this.initialize();
    void this.ready.then(() => {
      supabase.auth.onAuthStateChange((_event, session) => {
        queueMicrotask(() => {
          void this.applySession(session).catch((error: unknown) => this.handleAuthError(error));
        });
      });
    });
  }

  accounts(): Account[] {
    return this.accountsState();
  }

  getBarangays(): Barangay[] {
    return this.barangaysState();
  }

  addBarangay(barangay: Omit<Barangay, 'id'>): Barangay {
    const created = { ...barangay, id: this.uid() };
    this.barangaysState.update((items) => [...items, created]);
    return created;
  }

  updateBarangay(updated: Barangay): void {
    this.barangaysState.update((items) => items.map((item) => item.id === updated.id ? updated : item));
  }

  deleteBarangay(id: string): void {
    if (this.account()?.barangayId === id) {
      throw new Error('You cannot remove your currently assigned barangay.');
    }
    if (this.accounts().some((account) => account.barangayId === id)) {
      throw new Error('This barangay is assigned to registered accounts and cannot be removed.');
    }
    this.barangaysState.update((items) => items.filter((item) => item.id !== id));
  }

  async requestSignupCode(input: {
    name: string;
    email: string;
    mobile: string;
    barangayId: string;
    address: string;
  }): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(input.email),
      options: {
        shouldCreateUser: true,
        data: {
          full_name: input.name.trim(),
          mobile: input.mobile.trim(),
          barangay_id: input.barangayId,
          address: input.address.trim(),
        },
      },
    });
    if (error) throw new Error(error.message);
  }

  async requestLoginCode(email: string): Promise<void> {
    const { error } = await supabase.auth.signInWithOtp({
      email: normalizeEmail(email),
      options: { shouldCreateUser: false },
    });
    if (error) throw new Error(error.message);
  }

  async signInWithPassword(email: string, password: string): Promise<void> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizeEmail(email),
      password,
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Password sign-in did not create an authenticated session.');
    await this.applySession(data.session);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
      redirectTo: `${window.location.origin}/auth?mode=update-password`,
    });
    if (error) throw new Error(error.message);
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new Error(error.message);
  }

  async verifyEmailCode(email: string, token: string): Promise<void> {
    this.authError.set(null);
    const { data, error } = await supabase.auth.verifyOtp({
      email: normalizeEmail(email),
      token: token.trim(),
      type: 'email',
    });
    if (error) throw new Error(error.message);
    if (!data.session) throw new Error('Email verification did not create an authenticated session.');

    try {
      await this.applySession(data.session);
    } catch (error) {
      const { error: signOutError } = await supabase.auth.signOut();
      this.activeUser = null;
      this.claimedUserId = null;
      this.account.set(null);
      this.accountsState.set([]);
      if (signOutError) {
        const message = error instanceof Error ? error.message : 'Account setup failed.';
        throw new Error(`${message} The incomplete session could not be cleared: ${signOutError.message}`);
      }
      throw error;
    }
  }

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
    this.activeUser = null;
    this.claimedUserId = null;
    this.account.set(null);
    this.accountsState.set([]);
  }

  async updateAccount(updated: Account): Promise<void> {
    const existing = this.accountsState().find((account) => account.id === updated.id);
    if (!existing) return;

    const protectedUpdate: Account = {
      ...existing,
      ...updated,
      id: existing.id,
      email: existing.email,
      mobile: existing.mobile,
      provider: 'email',
      role: existing.role,
      verified: existing.verified,
      createdAt: existing.createdAt,
    };

    if (updated.id === this.account()?.id) {
      const { error } = await supabase.from('profiles').update({
        full_name: protectedUpdate.name,
        barangay_id: protectedUpdate.barangayId,
        address: protectedUpdate.address,
        marketplace_alerts: protectedUpdate.marketplaceAlerts,
        marketplace_radius_km: protectedUpdate.marketplaceRadiusKm,
        notification_preferences: protectedUpdate.notifications,
        updated_at: new Date().toISOString(),
      }).eq('id', updated.id);
      if (error) throw new Error(error.message);
    }

    this.saveLocalOverrides(protectedUpdate);
    this.accountsState.update((accounts) => accounts.map((account) =>
      account.id === updated.id ? protectedUpdate : account));
    if (this.account()?.id === updated.id) this.account.set(protectedUpdate);
  }

  async assignUserRoles(updates: Array<{ accountId: string; role: Exclude<AccountRole, 'superuser'> }>): Promise<void> {
    if (this.account()?.role !== 'superuser') {
      throw new Error('Only a Superuser can assign community roles.');
    }
    if (!updates.length) return;

    const { error } = await supabase.rpc('assign_user_roles', { assignments: updates });
    if (error) throw new Error(error.message);
    await this.refreshAccounts();
  }

  getBarangay(id: string | null): Barangay | undefined {
    return this.barangaysState().find((barangay) => barangay.id === id);
  }

  private async initialize(): Promise<void> {
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      await this.applySession(data.session);
    } catch (error) {
      this.handleAuthError(error);
    }
  }

  private async applySession(session: Session | null): Promise<void> {
    if (!session) {
      this.activeUser = null;
      this.claimedUserId = null;
      this.account.set(null);
      this.accountsState.set([]);
      return;
    }
    this.activeUser = session.user;
    if (this.claimedUserId !== session.user.id) {
      const { error } = await supabase.rpc('claim_reserved_superuser');
      if (error) {
        throw new Error(`Account setup is incomplete. Apply supabase-auth-hardening.sql in Supabase: ${error.message}`);
      }
      this.claimedUserId = session.user.id;
    }
    await this.refreshAccounts();
  }

  private async refreshAccounts(): Promise<void> {
    const user = this.activeUser;
    if (!user) return;
    const [directoryResult, profileResult] = await Promise.all([
      supabase.from('member_directory').select('*').order('full_name'),
      supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    ]);
    if (directoryResult.error) {
      if (directoryResult.error.code === 'PGRST205' || directoryResult.error.message.includes('member_directory')) {
        throw new Error('Supabase setup is incomplete: apply supabase-auth-hardening.sql in the SQL Editor, then reload the app.');
      }
      throw new Error(directoryResult.error.message);
    }
    if (profileResult.error) throw new Error(profileResult.error.message);
    const profile = profileResult.data as ProfileRow | null;
    if (!profile) {
      throw new Error('Your Supabase profile is missing. Rerun supabase-auth-hardening.sql in the SQL Editor, then reload this page.');
    }
    const accounts = (directoryResult.data as DirectoryRow[]).map((directory) =>
      this.accountFromDirectory(directory, directory.id === user.id ? profile : null, directory.id === user.id ? user : null));
    this.accountsState.set(accounts);
    const current = accounts.find((account) => account.id === user.id);
    if (!current) throw new Error('Your verified account is missing from the member directory.');
    this.account.set(current);
  }

  private accountFromDirectory(directory: DirectoryRow, profile: ProfileRow | null, user: User | null): Account {
    const override = this.accountOverrides()[directory.id];
    return {
      id: directory.id,
      name: directory.full_name,
      email: user?.email ?? '',
      mobile: typeof user?.user_metadata['mobile'] === 'string' ? user.user_metadata['mobile'] : '',
      provider: 'email',
      role: directory.role,
      barangayId: directory.barangay_id,
      address: profile?.address ?? '',
      photoUrl: override?.photoUrl,
      verified: !!user?.email_confirmed_at,
      createdAt: Date.parse(directory.created_at),
      violationCount: override?.violationCount ?? profile?.violation_count ?? 0,
      banned: override?.banned ?? profile?.banned ?? false,
      suspendedUntil: override?.suspendedUntil ?? (profile?.suspended_until ? Date.parse(profile.suspended_until) : null),
      marketplaceAlerts: profile?.marketplace_alerts ?? true,
      marketplaceRadiusKm: profile?.marketplace_radius_km ?? 25,
      notifications: profile?.notification_preferences ?? {
        incidents: true, announcements: true, messages: true, marketplace: true,
      },
    };
  }

  private saveLocalOverrides(account: Account): void {
    const next = {
      ...this.accountOverrides(),
      [account.id]: {
        photoUrl: account.photoUrl,
        violationCount: account.violationCount,
        banned: account.banned,
        suspendedUntil: account.suspendedUntil,
      },
    };
    this.accountOverrides.set(next);
    this.storage.write(this.overridesKey, next);
  }

  private handleAuthError(error: unknown): void {
    this.activeUser = null;
    this.account.set(null);
    this.accountsState.set([]);
    this.authError.set(error instanceof Error ? error.message : 'Unable to initialize Supabase authentication.');
  }

  private uid(): string {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  }
}

interface AuthState {
  accounts: Account[];
  currentAccountId: string | null;
  barangays: Barangay[];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAuthState(value: unknown): value is AuthState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<AuthState>;
  return Array.isArray(state.accounts) &&
    (state.currentAccountId === null || typeof state.currentAccountId === 'string') &&
    Array.isArray(state.barangays);
}

function isBarangayList(value: unknown): value is Barangay[] {
  return Array.isArray(value) && value.every((item) =>
    !!item && typeof item === 'object' &&
    typeof item.id === 'string' && typeof item.name === 'string' &&
    typeof item.city === 'string' && typeof item.province === 'string');
}

function isAccountOverrides(value: unknown): value is AccountOverrides {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((override) =>
    !!override && typeof override === 'object' &&
    (override.photoUrl === undefined || typeof override.photoUrl === 'string') &&
    (override.violationCount === undefined || typeof override.violationCount === 'number') &&
    (override.banned === undefined || typeof override.banned === 'boolean') &&
    (override.suspendedUntil === undefined || typeof override.suspendedUntil === 'number' || override.suspendedUntil === null));
}
