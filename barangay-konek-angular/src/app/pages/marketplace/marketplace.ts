import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { RouterLink } from '@angular/router';
import { CommunityWallService, MarketplaceListing } from '../../community-wall.service';
import { AuthService } from '../../auth/auth.service';
import { ImageOptimizerService } from '../../image-optimizer.service';
import { ToastService } from '../../toast.service';

@Component({
  imports: [
    MatCardModule,
    MatIconModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    RouterLink,
    FormsModule,
  ],
  selector: 'app-marketplace',
  styleUrl: './marketplace.scss',
  templateUrl: './marketplace.html',
})
export class Marketplace {
  readonly wall = inject(CommunityWallService);
  readonly auth = inject(AuthService);
  private readonly imageOptimizer = inject(ImageOptimizerService);
  private readonly toast = inject(ToastService);
  readonly creating = signal(false);
  readonly search = signal('');
  readonly title = signal('');
  readonly category = signal('Furniture');
  readonly description = signal('');
  readonly photo = signal<string | undefined>(undefined);
  readonly categoryFilter = signal('All categories');
  readonly sortBy = signal<'newest' | 'alphabetical' | 'distance'>('newest');
  readonly viewMode = signal<'grid' | 'list' | 'text'>('grid');
  readonly currentLocation = signal<{ latitude: number; longitude: number } | null>(null);
  readonly locationMessage = signal('');

  get listings(): Array<MarketplaceListing & { displayDistance: number }> {
    const term = this.search().trim().toLowerCase();
    const results = this.wall.listings().map((listing) => ({
      ...listing,
      displayDistance: this.distanceToListing(listing),
    })).filter((listing) =>
      (!term || `${listing.title} ${listing.category} ${listing.description}`.toLowerCase().includes(term)) &&
      (this.categoryFilter() === 'All categories' || listing.category === this.categoryFilter()) &&
      (!this.auth.account()?.marketplaceAlerts || listing.displayDistance <= (this.auth.account()?.marketplaceRadiusKm ?? 100))
    );
    if (this.sortBy() === 'alphabetical') return results.sort((a, b) => a.title.localeCompare(b.title));
    if (this.sortBy() === 'distance') return results.sort((a, b) => a.displayDistance - b.displayDistance);
    return results.sort((a, b) => b.timestamp - a.timestamp);
  }

  requestLocation(): void {
    if (!navigator.geolocation) {
      this.locationMessage.set('Location is unavailable in this browser.');
      this.toast.error('Location is unavailable in this browser.');
      return;
    }
    this.locationMessage.set('Getting your location…');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        this.currentLocation.set({ latitude: coords.latitude, longitude: coords.longitude });
        this.locationMessage.set('Using your current location.');
      },
      () => {
        this.locationMessage.set('Location permission was denied. Using your barangay location.');
        this.toast.error('Location permission was denied. Using your barangay location.');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  private distanceToListing(listing: MarketplaceListing): number {
    const origin = this.currentLocation() ?? this.accountCoordinates();
    const barangay = this.auth.getBarangays().find((item) => item.id === listing.barangayId);
    if (!origin || !barangay?.latitude || !barangay.longitude) return listing.distanceKm;
    return Math.round(this.haversine(origin.latitude, origin.longitude, barangay.latitude, barangay.longitude) * 10) / 10;
  }

  private accountCoordinates(): { latitude: number; longitude: number } | null {
    const barangay = this.auth.getBarangay(this.auth.account()?.barangayId ?? null);
    return barangay?.latitude && barangay.longitude
      ? { latitude: barangay.latitude, longitude: barangay.longitude }
      : null;
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const radians = (degrees: number) => degrees * Math.PI / 180;
    const latitudeDelta = radians(lat2 - lat1);
    const longitudeDelta = radians(lon2 - lon1);
    const a = Math.sin(latitudeDelta / 2) ** 2 +
      Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(longitudeDelta / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async onPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.photo.set(await this.imageOptimizer.optimize(file, { maxDimension: 1280, maxOutputBytes: 400 * 1024 }));
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to optimize the listing photo.');
    }
  }

  submit(): void {
    const title = this.wall.sanitizeText(this.title());
    const description = this.wall.sanitizeText(this.description());
    if (!title || !description) {
      this.toast.error('An item title and description are required.');
      return;
    }
    this.wall.checkTextForViolation(`${title} ${description}`);
    const added = this.wall.addListing({
      title, description, category: this.category(),
      barangayId: this.auth.account()?.barangayId ?? null,
      distanceKm: 0, free: true,
      ownerId: this.auth.account()?.id,
      owner: this.auth.account()?.name ?? 'Resident', photo: this.photo(),
    });
    if (!added) return;
    this.title.set(''); this.description.set(''); this.photo.set(undefined); this.creating.set(false);
  }
}
