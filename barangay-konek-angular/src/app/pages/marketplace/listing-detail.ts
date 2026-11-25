import { DatePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { AuthService } from '../../auth/auth.service';
import { CommunityWallService } from '../../community-wall.service';
import { MessagingService } from '../../messaging.service';

@Component({
  imports: [DatePipe, MatButtonModule, MatCardModule, MatIconModule, RouterLink],
  selector: 'app-listing-detail',
  styleUrl: './listing-detail.scss',
  templateUrl: './listing-detail.html',
})
export class ListingDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly wall = inject(CommunityWallService);
  readonly auth = inject(AuthService);
  private readonly messaging = inject(MessagingService);
  readonly listingId = toSignal(this.route.paramMap.pipe(map((params) => Number(params.get('id')))), {
    initialValue: Number(this.route.snapshot.paramMap.get('id')),
  });

  get listing() {
    return this.wall.listings().find((item) => item.id === this.listingId());
  }

  get location() {
    return this.auth.getBarangay(this.listing?.barangayId ?? null);
  }

  get isOwner(): boolean {
    const item = this.listing;
    const account = this.auth.account();
    if (!item || !account || item.demoSeed) return false;
    return item.ownerId
      ? item.ownerId === account.id
      : item.owner.trim().toLocaleLowerCase() === account.name.trim().toLocaleLowerCase();
  }

  messageOwner(): void {
    const item = this.listing;
    if (item) this.messaging.openMiniConversation(item.ownerId, item.owner);
  }

  markAsSold(): void {
    const item = this.listing;
    if (item) this.wall.markListingSold(item.id);
  }
}
