import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../../auth/auth.service';
import { CommunityWallService, WallPost } from '../../community-wall.service';
import { MessagingService } from '../../messaging.service';
import { IncidentAnalytics } from '../admin/incident-analytics';

@Component({
  imports: [RouterLink, MatCardModule, MatIconModule, MatButtonModule, IncidentAnalytics],
  selector: 'app-dashboard',
  styleUrl: './dashboard.scss',
  templateUrl: './dashboard.html',
})
export class Dashboard {
  readonly auth = inject(AuthService);
  readonly wall = inject(CommunityWallService);
  readonly messaging = inject(MessagingService);

  get isSuperuser(): boolean {
    return this.auth.account()?.role === 'superuser';
  }

  get canViewIncidentAnalytics(): boolean {
    const role = this.auth.account()?.role;
    return role === 'officer' || role === 'captain' || role === 'superuser';
  }

  get graphIncidents(): WallPost[] {
    const account = this.auth.account();
    return this.wall.posts().filter((post) => post.type === 'incident')
      .filter((post) => account?.role === 'superuser' || post.barangayId === account?.barangayId);
  }

  get currentBarangayName(): string {
    const account = this.auth.account();
    return this.auth.getBarangay(account?.barangayId ?? null)?.name ?? 'all Quezon communities';
  }

  get posts(): WallPost[] {
    const account = this.auth.account();
    return this.wall.posts()
      .filter((post) => this.isSuperuser || post.barangayId === account?.barangayId)
      .sort((a, b) => b.id - a.id);
  }

  get openIncidents(): number {
    return this.posts.filter((post) => post.type === 'incident' && !post.resolved).length;
  }

  get announcementCount(): number {
    return this.posts.filter((post) => post.type === 'announcement').length;
  }

  get unreadMessages(): number {
    return this.messaging.unreadCount(this.auth.account()?.id);
  }

  get nearbyListings() {
    return this.wall.listings().filter((listing) => !listing.sold &&
      (this.isSuperuser || listing.barangayId === this.auth.account()?.barangayId));
  }

  get greeting(): string {
    const hour = new Date().getHours();
    return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  }
}
