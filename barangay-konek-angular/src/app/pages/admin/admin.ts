import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { Account, AccountRole, Barangay } from '../../auth/auth.models';
import { CommunityWallService, WallPost } from '../../community-wall.service';
import { ToastService } from '../../toast.service';
import { IncidentAnalytics } from './incident-analytics';

@Component({
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule,
    MatTableModule, MatInputModule, MatFormFieldModule, IncidentAnalytics,
  ],
  selector: 'app-admin',
  styleUrl: './admin.scss',
  templateUrl: './admin.html',
})
export class Admin {
  readonly auth = inject(AuthService);
  readonly wall = inject(CommunityWallService);
  readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly selectedPurok = signal<string | null>(null);
  readonly selectedPurokBarangayId = signal<string | null>(null);
  readonly selectedUserId = signal<string | null>(null);
  readonly bannedWord = signal('');
  readonly editingBarangayId = signal<string | null>(null);
  readonly barangayName = signal('');
  readonly barangayCity = signal('');
  readonly barangayProvince = signal('Quezon');
  readonly barangayLatitude = signal('');
  readonly barangayLongitude = signal('');
  readonly directoryError = signal('');
  readonly roleCity = signal('');
  readonly roleBarangayId = signal('');
  readonly roleSearch = signal('');
  readonly roleSaving = signal(false);
  readonly roleDrafts = signal<Record<string, Exclude<AccountRole, 'superuser'>>>({});

  get incidents(): WallPost[] {
    const selected = this.selectedPurok();
    const account = this.auth.account();
    return this.wall.posts().filter((post) => post.type === 'incident' || post.flagged)
      .filter((post) => account?.role === 'superuser' || post.barangayId === account?.barangayId)
      .filter((post) => !selected || (post.purok === selected && post.barangayId === this.selectedPurokBarangayId()));
  }

  get canViewIncidentGraphs(): boolean {
    const role = this.auth.account()?.role;
    return role === 'captain' || role === 'superuser';
  }

  get graphIncidents(): WallPost[] {
    const account = this.auth.account();
    return this.wall.posts().filter((post) => post.type === 'incident')
      .filter((post) => account?.role === 'superuser' || post.barangayId === account?.barangayId);
  }

  get violatedAccounts() {
    const current = this.auth.account();
    return this.auth.accounts().filter((account) =>
      (account.violationCount ?? 0) > 0 &&
      (current?.role === 'superuser' || account.barangayId === current?.barangayId));
  }

  get selectedUser() {
    return this.auth.accounts().find((account) => account.id === this.selectedUserId());
  }

  get directoryEntries() {
    const account = this.auth.account();
    if (account?.role === 'superuser') return this.auth.getBarangays();
    return this.auth.getBarangays().filter((barangay) => barangay.id === account?.barangayId);
  }

  get canManageDirectory(): boolean {
    return this.auth.account()?.role === 'superuser';
  }

  get roleAssignmentCities(): string[] {
    return [...new Set(this.auth.getBarangays().map((barangay) => barangay.city))].sort((a, b) => a.localeCompare(b));
  }

  get roleAssignmentBarangays(): Barangay[] {
    return this.auth.getBarangays()
      .filter((barangay) => !this.roleCity() || barangay.city === this.roleCity())
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get roleAssignmentUsers(): Account[] {
    const search = this.roleSearch().trim().toLocaleLowerCase();
    const barangays = this.auth.getBarangays();
    return this.auth.accounts()
      .filter((account) => account.role !== 'superuser' && !account.banned)
      .filter((account) => {
        const barangay = barangays.find((item) => item.id === account.barangayId);
        return !!barangay &&
          (!this.roleCity() || barangay.city === this.roleCity()) &&
          (!this.roleBarangayId() || barangay.id === this.roleBarangayId()) &&
          (!search || account.name.toLocaleLowerCase().includes(search));
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get roleChangesCount(): number {
    return Object.entries(this.roleDrafts()).filter(([accountId, role]) =>
      this.auth.accounts().some((account) => account.id === accountId && account.role !== role)).length;
  }

  severityCounts(): Record<string, number> {
    const counts: Record<string, number> = { Healthy: 0, Mild: 0, Hot: 0, 'Very Hot': 0, Severe: 0, 'Danger Zone': 0 };
    const current = this.auth.account();
    this.auth.accounts().filter((account) => current?.role === 'superuser' || account.barangayId === current?.barangayId).forEach((account) => {
      counts[this.wall.violationStatus(account.violationCount ?? 0).label]++;
    });
    return counts;
  }

  severityBarWidth(count: number): number {
    const values = Object.values(this.severityCounts());
    const maximum = Math.max(1, ...values);
    return count / maximum * 100;
  }

  setRoleCity(event: Event): void {
    this.roleCity.set((event.target as HTMLSelectElement).value);
    this.roleBarangayId.set('');
  }

  setRoleBarangay(event: Event): void {
    this.roleBarangayId.set((event.target as HTMLSelectElement).value);
  }

  setRoleSearch(value: string): void {
    this.roleSearch.set(value);
  }

  setRoleDraft(account: Account, role: Exclude<AccountRole, 'superuser'>, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const currentRole = this.roleDrafts()[account.id] ?? account.role;
    const nextRole = checked ? role : currentRole === role ? 'resident' : currentRole;
    this.roleDrafts.update((drafts) => ({ ...drafts, [account.id]: nextRole }));
  }

  roleForAssignment(account: Account): AccountRole {
    return this.roleDrafts()[account.id] ?? account.role;
  }

  async saveRoleAssignments(): Promise<void> {
    const drafts = this.roleDrafts();
    const updates = this.auth.accounts().flatMap((account) => {
      const role = drafts[account.id];
      return role && role !== account.role ? [{ accountId: account.id, role }] : [];
    });
    if (!updates.length) return;

    this.roleSaving.set(true);
    try {
      await this.auth.assignUserRoles(updates);
      this.roleDrafts.set({});
      this.toast.success('Role assignments saved.');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to save role assignments.');
    } finally {
      this.roleSaving.set(false);
    }
  }

  selectPurok(purok: string, barangayId: string): void {
    this.selectedPurok.set(purok);
    this.selectedPurokBarangayId.set(barangayId);
  }

  clearPurok(): void {
    this.selectedPurok.set(null);
    this.selectedPurokBarangayId.set(null);
  }

  openIncident(postId: number): void {
    void this.router.navigate(['/community'], { queryParams: { post: postId } });
  }

  addBannedWord(): void {
    const word = this.bannedWord().trim().toLowerCase();
    const alreadyExists = this.wall.bannedWords().includes(word);
    this.wall.addBannedWord(word);
    this.bannedWord.set('');
    if (word && !alreadyExists) this.toast.success('Moderation word added.');
    else if (alreadyExists) this.toast.error('That moderation word is already listed.');
  }

  removeBannedWord(word: string): void {
    this.wall.removeBannedWord(word);
    this.toast.success('Moderation word removed.');
  }

  banSelectedUser(): void {
    const user = this.selectedUser;
    if (user) this.wall.permanentBan(user.id);
  }

  statusLabel(accountId: string): string {
    const account = this.auth.accounts().find((item) => item.id === accountId);
    return this.wall.violationStatus(account?.violationCount ?? 0).label;
  }

  editBarangay(barangay?: Barangay): void {
    this.directoryError.set('');
    this.editingBarangayId.set(barangay?.id ?? '');
    this.barangayName.set(barangay?.name ?? '');
    this.barangayCity.set(barangay?.city ?? '');
    this.barangayProvince.set(barangay?.province ?? 'Quezon');
    this.barangayLatitude.set(barangay?.latitude?.toString() ?? '');
    this.barangayLongitude.set(barangay?.longitude?.toString() ?? '');
  }

  saveBarangay(): void {
    const name = this.barangayName().trim();
    const city = this.barangayCity().trim();
    const province = this.barangayProvince().trim();
    if (!name || !city || !province) {
      this.setDirectoryError('Barangay name, city, and province are required.');
      return;
    }
    const latitude = Number(this.barangayLatitude());
    const longitude = Number(this.barangayLongitude());
    if (!!this.barangayLatitude() !== !!this.barangayLongitude()) {
      this.setDirectoryError('Enter both coordinates, or leave both coordinate fields blank.');
      return;
    }
    if ((this.barangayLatitude() && (!Number.isFinite(latitude) || latitude < -90 || latitude > 90)) ||
        (this.barangayLongitude() && (!Number.isFinite(longitude) || longitude < -180 || longitude > 180))) {
      this.setDirectoryError('Enter valid coordinates, or leave both coordinate fields blank.');
      return;
    }
    const entry: Omit<Barangay, 'id'> = {
      name, city, province,
      ...(this.barangayLatitude() && this.barangayLongitude() ? { latitude, longitude } : {}),
    };
    const id = this.editingBarangayId();
    const duplicate = this.auth.getBarangays().some((barangay) =>
      barangay.id !== id && barangay.name.trim().toLowerCase() === name.toLowerCase() &&
      barangay.city.trim().toLowerCase() === city.toLowerCase());
    if (duplicate) {
      this.setDirectoryError('That barangay already exists in this city or municipality.');
      return;
    }
    if (id) this.auth.updateBarangay({ ...entry, id });
    else {
      const created = this.auth.addBarangay(entry);
      this.wall.addBarangayDirectory(created.id);
    }
    this.editBarangay();
    this.toast.success('Barangay directory changes saved.');
  }

  deleteBarangay(barangay: Barangay): void {
    this.directoryError.set('');
    if (this.wall.posts().some((post) => post.barangayId === barangay.id) ||
        this.wall.listings().some((listing) => listing.barangayId === barangay.id && !listing.demoSeed)) {
      this.setDirectoryError('This barangay has community records and cannot be removed.');
      return;
    }
    try {
      this.auth.deleteBarangay(barangay.id);
      this.wall.removeBarangayDirectory(barangay.id);
      this.toast.success(`${barangay.name} removed from the directory.`);
    } catch (error) {
      this.setDirectoryError(error instanceof Error ? error.message : 'Unable to remove barangay.');
    }
  }

  private setDirectoryError(message: string): void {
    this.directoryError.set(message);
    this.toast.error(message);
  }
}
