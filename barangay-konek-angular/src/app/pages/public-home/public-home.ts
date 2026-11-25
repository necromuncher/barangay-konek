import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../auth/auth.service';
import { CommunityWallService } from '../../community-wall.service';

@Component({
  imports: [RouterLink, MatButtonModule, MatIconModule],
  selector: 'app-public-home',
  styles: [`
    .preview-link { display: block; color: inherit; text-decoration: none; transition: border-color .16s ease, transform .16s ease; }
    .preview-link:hover { border-color: #b6d2bf; transform: translateY(-2px); }
    .post-photo { display: block; width: 100%; height: 130px; margin-bottom: 12px; border-radius: 7px; object-fit: cover; }
    .listing-card .listing-photo { margin: -1px -1px 0; width: calc(100% + 2px); }
    .preview-open { display: flex; align-items: center; gap: 5px; margin-top: 13px; color: #287449; font-size: 10px; font-weight: 800; }
    .preview-open mat-icon { width: 15px; height: 15px; font-size: 15px; }
  `],
  styleUrl: './public-home.scss',
  templateUrl: './public-home.html',
})
export class PublicHome {
  private readonly router = inject(Router);
  readonly auth = inject(AuthService);
  readonly wall = inject(CommunityWallService);
  readonly posts = computed(() => this.wall.posts().slice(0, 3));
  readonly listings = computed(() => this.wall.listings().filter((listing) => !listing.sold).slice(0, 3));

  constructor() {
    void this.auth.ready.then(() => {
      if (this.auth.account()) {
        void this.router.navigateByUrl('/dashboard', { replaceUrl: true });
      }
    });
  }
}
