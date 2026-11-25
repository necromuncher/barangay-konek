import { Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatExpansionModule } from '@angular/material/expansion';
import { ActivatedRoute, Router } from '@angular/router';
import { CommunityWallService, PostType, Severity, WallPost } from '../../community-wall.service';
import { AuthService } from '../../auth/auth.service';
import { MessagingService } from '../../messaging.service';
import { ImageOptimizerService } from '../../image-optimizer.service';
import { ToastService } from '../../toast.service';
import { PostPhotoGallery } from './post-photo-gallery';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  imports: [
    CommonModule, FormsModule, MatCardModule, MatIconModule, MatButtonModule, MatChipsModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatExpansionModule, PostPhotoGallery,
  ],
  selector: 'app-community',
  styleUrl: './community.scss',
  templateUrl: './community.html',
})
export class Community {
  readonly wall = inject(CommunityWallService);
  readonly auth = inject(AuthService);
  readonly messaging = inject(MessagingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly imageOptimizer = inject(ImageOptimizerService);
  private readonly toast = inject(ToastService);

  readonly filter = signal<'all' | PostType>('all');
  readonly severityFilter = signal<Severity | null>(null);
  readonly creating = signal(false);
  readonly selectedPostId = signal<number | null>(null);
  readonly expandedComments = signal<Set<number>>(new Set());
  readonly commentText = signal<Record<number, string>>({});
  readonly commentPhoto = signal<Record<number, string | undefined>>({});
  readonly postPhotos = signal<string[]>([]);
  readonly resolutionText = signal<Record<number, string>>({});
  readonly resolutionPhoto = signal<Record<number, string | undefined>>({});
  readonly imagesProcessing = signal(false);

  readonly postType = signal<PostType>('update');
  readonly severity = signal<Severity>('medium');
  readonly postTitle = signal('');
  readonly postBody = signal('');
  readonly postPurok = signal('Purok 1');
  readonly postPhoto = signal<string | undefined>(undefined);
  readonly bannerLocationSelection = signal<string | null>(null);
  readonly bannerProcessing = signal(false);

  get communityName(): string {
    const account = this.auth.account();
    return this.auth.getBarangay(account?.barangayId ?? null)?.name ?? 'Quezon Province';
  }

  get canManageBanner(): boolean {
    const role = this.auth.account()?.role;
    return role === 'captain' || role === 'superuser';
  }

  get bannerBarangayId(): string | null {
    const account = this.auth.account();
    if (account?.role === 'superuser') {
      return this.bannerLocationSelection() ?? this.auth.getBarangays()[0]?.id ?? null;
    }
    return account?.barangayId ?? null;
  }

  get bannerLocationName(): string {
    return this.auth.getBarangay(this.bannerBarangayId)?.name ?? this.communityName;
  }

  get communityBanner(): string | undefined {
    return this.wall.communityBanner(this.bannerBarangayId);
  }

  get availablePuroks(): string[] {
    const barangayId = this.auth.account()?.barangayId;
    return this.wall.puroks().find((directory) => directory.barangayId === barangayId)?.puroks ?? [];
  }

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      const postId = Number(params.get('post'));
      this.selectedPostId.set(Number.isInteger(postId) && postId > 0 ? postId : null);
      const type = params.get('type');
      if (type === 'update' || type === 'incident' || type === 'announcement' || type === 'event') {
        this.filter.set(type);
      }
      const severity = params.get('severity');
      this.severityFilter.set(isSeverity(severity) ? severity : null);
      if (isSeverity(severity)) this.filter.set('incident');
    });
  }

  get filteredPosts(): WallPost[] {
    const filter = this.filter();
    const severity = this.severityFilter();
    return this.wall.posts().filter((post) =>
      (filter === 'all' || post.type === filter) &&
      (!severity || (post.type === 'incident' && post.severity === severity)));
  }

  get selectedPost(): WallPost | undefined {
    const id = this.selectedPostId();
    return id === null ? undefined : this.wall.getPost(id);
  }

  setFilter(filter: 'all' | PostType): void {
    this.filter.set(filter);
    this.severityFilter.set(null);
  }

  clearSeverityFilter(): void {
    this.severityFilter.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { severity: null },
      queryParamsHandling: 'merge',
    });
  }

  openPost(postId: number): void {
    this.selectedPostId.set(postId);
    this.expandedComments.update((ids) => {
      const next = new Set(ids);
      next.add(postId);
      return next;
    });
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { post: postId },
      queryParamsHandling: 'merge',
    });
  }

  closePost(): void {
    this.selectedPostId.set(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { post: null },
      queryParamsHandling: 'merge',
    });
  }

  toggleComments(postId: number): void {
    this.expandedComments.update((ids) => {
      const next = new Set(ids);
      next.has(postId) ? next.delete(postId) : next.add(postId);
      return next;
    });
  }

  commentsExpanded(postId: number): boolean {
    return this.expandedComments().has(postId);
  }

  setCommentText(postId: number, text: string): void {
    this.commentText.update((values) => ({ ...values, [postId]: text }));
  }

  submitComment(postId: number): void {
    if (!this.wall.addComment(postId, this.commentText()[postId] ?? '', this.commentPhoto()[postId])) return;
    this.commentText.update((values) => ({ ...values, [postId]: '' }));
    this.commentPhoto.update((values) => ({ ...values, [postId]: undefined }));
  }

  async onCommentPhoto(event: Event, postId: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const photo = await this.optimizeImage(file);
    if (photo) this.commentPhoto.update((values) => ({ ...values, [postId]: photo }));
  }

  async onPostPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length) return;
    if (this.imagesProcessing()) {
      this.toast.error('Wait for the current image optimization to finish.');
      return;
    }
    if (files.length > 4) {
      this.toast.error('A community post can include up to 4 photos.');
      return;
    }
    this.imagesProcessing.set(true);
    try {
      this.postPhotos.set(await Promise.all(files.map((file) => this.imageOptimizer.optimize(file, { maxDimension: 1440 }))));
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to optimize the selected photos.');
    } finally {
      this.imagesProcessing.set(false);
    }
  }

  async onBannerUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (this.bannerProcessing()) {
      this.toast.error('Wait for the current banner optimization to finish.');
      return;
    }
    const barangayId = this.bannerBarangayId;
    if (!barangayId) {
      this.toast.error('Select a barangay before uploading its banner.');
      return;
    }

    this.bannerProcessing.set(true);
    try {
      const image = await this.imageOptimizer.optimize(file, {
        maxDimension: 1600,
        maxOutputBytes: 450 * 1024,
      });
      this.wall.setCommunityBanner(barangayId, image);
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to optimize the community banner.');
    } finally {
      this.bannerProcessing.set(false);
    }
  }

  removePostPhoto(index: number): void {
    this.postPhotos.update((photos) => photos.filter((_, photoIndex) => photoIndex !== index));
  }

  submitPost(): void {
    const title = this.postTitle().trim();
    const body = this.postBody().trim();
    if (!title || !body) return;

    const posted = this.wall.createPostWithPhotos({
      type: this.postType(),
      severity: this.postType() === 'incident' ? this.severity() : undefined,
      title,
      body,
      photos: this.postPhotos(),
      purok: this.postPurok(),
    });
    if (!posted) return;

    this.postTitle.set('');
    this.postBody.set('');
    this.postPhoto.set(undefined);
    this.postPhotos.set([]);
    this.postType.set('update');
    this.severity.set('medium');
    this.postPurok.set('Purok 1');
    this.creating.set(false);
  }

  typeLabel(type: PostType): string {
    return type.charAt(0).toUpperCase() + type.slice(1);
  }

  authorInitials(name: string): string {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase();
  }

  profilePhoto(authorId: string | undefined, authorName: string): string | undefined {
    const normalizedName = authorName.trim().toLocaleLowerCase();
    return this.auth.accounts().find((account) => account.id === authorId)?.photoUrl ??
      this.auth.accounts().find((account) => account.name.trim().toLocaleLowerCase() === normalizedName)?.photoUrl;
  }

  messageAuthor(authorId: string | undefined, authorName: string): void {
    this.messaging.openMiniConversation(authorId, authorName);
  }

  reportPost(postId: number): void {
    this.wall.reportPost(postId);
  }

  reportComment(postId: number, commentId: number): void {
    this.wall.reportComment(postId, commentId);
  }

  reportAuthor(authorId: string | undefined, authorName: string): void {
    this.wall.reportAuthor(authorId, authorName);
  }

  canResolve(post: WallPost): boolean {
    const account = this.auth.account();
    return !!account && (post.type === 'incident' || post.flagged === true) &&
      ['officer', 'captain', 'superuser'].includes(account.role) &&
      (account.role === 'superuser' || post.barangayId === account.barangayId);
  }

  setResolutionText(postId: number, text: string): void {
    this.resolutionText.update((values) => ({ ...values, [postId]: text }));
  }

  async onResolutionPhoto(event: Event, postId: number): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const photo = await this.optimizeImage(file);
    if (photo) this.resolutionPhoto.update((values) => ({ ...values, [postId]: photo }));
  }

  resolveIncident(postId: number): void {
    this.wall.resolveIncident(postId, this.resolutionText()[postId] ?? '', this.resolutionPhoto()[postId]);
  }

  private async optimizeImage(file: File): Promise<string | null> {
    try {
      return await this.imageOptimizer.optimize(file, { maxDimension: 1280 });
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Unable to optimize the selected image.');
      return null;
    }
  }

}

function isSeverity(value: string | null): value is Severity {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical';
}
