import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '../../auth/auth.service';
import { CommunityWallService } from '../../community-wall.service';
import { ImageOptimizerService } from '../../image-optimizer.service';
import { ToastService } from '../../toast.service';

@Component({
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatSelectModule,
    FormsModule,
  ],
  selector: 'app-profile',
  styleUrl: './profile.scss',
  templateUrl: './profile.html',
})
export class Profile {
  readonly auth = inject(AuthService);
  readonly wall = inject(CommunityWallService);
  private readonly imageOptimizer = inject(ImageOptimizerService);
  private readonly toast = inject(ToastService);
  readonly saved = signal(false);
  readonly name = signal(this.auth.account()?.name ?? 'Alex Mendoza');
  readonly marketplaceAlerts = signal(this.auth.account()?.marketplaceAlerts ?? true);
  readonly marketplaceRadius = signal(this.auth.account()?.marketplaceRadiusKm ?? 25);
  readonly barangayId = signal(this.auth.account()?.barangayId ?? '');
  readonly notifications = signal(this.auth.account()?.notifications ?? {
    incidents: true, announcements: true, messages: true, marketplace: true,
  });
  readonly photoUrl = signal(this.auth.account()?.photoUrl ?? '');
  readonly photoError = signal<string | null>(null);

  get barangays() {
    return this.auth.getBarangays();
  }

  get initials(): string {
    return this.name().trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
  }

  get accountStatus(): { label: string; suspensionDays: number } {
    return this.wall.violationStatus(this.auth.account()?.violationCount ?? 0);
  }

  async save(): Promise<void> {
    const account = this.auth.account();
    if (!account) return;
    try {
      await this.auth.updateAccount({
        ...account,
        name: this.name().trim() || account.name,
        barangayId: this.barangayId() || null,
        photoUrl: this.photoUrl() || undefined,
        marketplaceAlerts: this.marketplaceAlerts(),
        marketplaceRadiusKm: this.marketplaceRadius(),
        notifications: this.notifications(),
      });
      this.saved.set(true);
      this.toast.success('Profile changes saved.');
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to save profile changes.');
    }
  }

  async onPhotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    this.photoError.set(null);
    this.saved.set(false);
    if (!file) return;
    try {
      this.photoUrl.set(await this.imageOptimizer.optimize(file, {
        maxDimension: 512,
        maxInputBytes: 5 * 1024 * 1024,
        maxOutputBytes: 200 * 1024,
        quality: 0.8,
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The selected image could not be processed.';
      this.photoError.set(message);
      this.toast.error(message);
    }
  }
}
