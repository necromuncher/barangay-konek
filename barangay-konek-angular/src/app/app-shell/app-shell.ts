import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../auth/auth.service';
import { AppNotification, CommunityWallService } from '../community-wall.service';
import { MessagingService } from '../messaging.service';
import { LocalStorageService } from '../local-storage.service';
import { ToastService } from '../toast.service';
import { MiniMessenger } from '../messaging/mini-messenger';

@Component({
  imports: [
    MiniMessenger, RouterOutlet, RouterLink, RouterLinkActive, FormsModule,
    MatToolbarModule, MatSidenavModule,
    MatIconModule, MatButtonModule, MatBadgeModule,
    MatMenuModule, MatSnackBarModule,
  ],
  selector: 'app-app-shell',
  styleUrl: './app-shell.scss',
  templateUrl: './app-shell.html',
  host: {
    '[class.sidebar-collapsed]': 'sidebarCollapsed()',
  },
})
export class AppShell {
  readonly sidebarCollapsed = signal(false);
  readonly auth = inject(AuthService);
  readonly wall = inject(CommunityWallService);
  readonly messaging = inject(MessagingService);
  readonly storage = inject(LocalStorageService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);
  readonly searchOpen = signal(false);
  readonly searchTerm = signal('');
  readonly searchPosts = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return [];
    return this.wall.posts().filter((post) =>
      `${post.title} ${post.body} ${post.author} ${post.type}`.toLowerCase().includes(term)).slice(0, 5);
  });
  readonly searchListings = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return [];
    return this.wall.listings().filter((listing) => {
      const location = this.auth.getBarangay(listing.barangayId);
      return `${listing.title} ${listing.description} ${listing.category} ${listing.owner} ${location?.name ?? ''} ${location?.city ?? ''}`
        .toLowerCase().includes(term);
    }).slice(0, 5);
  });
  readonly unreadNotificationCount = computed(() =>
    this.wall.notificationsFor(this.auth.account()?.id).filter((item) => item.unread).length);
  constructor() {
    effect(() => {
      const error = this.storage.error();
      if (error) this.toast.error(error);
    });
  }

  toggleSidebar(): void {
    this.sidebarCollapsed.update((collapsed) => !collapsed);
  }

  toggleSearch(): void {
    this.searchOpen.update((open) => !open);
    this.searchTerm.set('');
  }

  openSearchPost(postId: number): void {
    this.searchOpen.set(false);
    void this.router.navigate(['/community'], { queryParams: { post: postId } });
  }

  openSearchListing(listingId: number): void {
    this.searchOpen.set(false);
    void this.router.navigate(['/marketplace', listingId]);
  }

  openNotification(notification: AppNotification): void {
    if (notification.target?.type === 'post') {
      void this.router.navigate(['/community'], { queryParams: { post: notification.target.id } });
    } else if (notification.target?.type === 'listing') {
      void this.router.navigate(['/marketplace', notification.target.id]);
    } else if (notification.kind === 'message') {
      void this.router.navigate(['/messages']);
    } else if (notification.kind === 'marketplace') {
      void this.router.navigate(['/marketplace']);
    } else if (notification.kind === 'violation') {
      void this.router.navigate(['/admin']);
    } else {
      void this.router.navigate(['/community']);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
      await this.router.navigate(['/']);
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to log out.');
    }
  }
}
