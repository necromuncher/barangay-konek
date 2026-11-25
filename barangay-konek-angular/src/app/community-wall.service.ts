import { effect, Injectable, inject, signal } from '@angular/core';
import { AuthService, BARANGAYS } from './auth/auth.service';
import { AccountRole } from './auth/auth.models';
import { LocalStorageService } from './local-storage.service';
import { ToastService } from './toast.service';

export type PostType = 'update' | 'incident' | 'announcement' | 'event';
export type Severity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'resolved' | 'active' | 'unresolved';

export interface WallComment {
  id: number;
  author: string;
  authorId?: string;
  text: string;
  photo?: string;
  timestamp: string;
  flagged?: boolean;
}

export interface WallPost {
  id: number;
  author: string;
  authorId?: string;
  initials: string;
  role: 'Resident' | 'Barangay Officer' | 'Barangay Captain' | 'Superuser';
  type: PostType;
  severity?: Severity;
  title: string;
  body: string;
  timestamp: string;
  likes: number;
  liked: boolean;
  photo?: string;
  photos?: string[];
  comments: WallComment[];
  barangayId?: string | null;
  purok?: string;
  flaggedCount?: number;
  flagged?: boolean;
  resolved?: boolean;
  createdAt?: number;
  resolvedAt?: number;
  resolutionComment?: string;
  resolutionPhoto?: string;
}

export interface AppNotification {
  id: number;
  title: string;
  detail: string;
  kind: 'community' | 'marketplace' | 'message' | 'violation';
  unread: boolean;
  timestamp: number;
  userId?: string;
  target?: { type: 'post' | 'listing' | 'message'; id: number | string };
}

export interface MarketplaceListing {
  id: number;
  title: string;
  category: string;
  description: string;
  barangayId: string | null;
  ownerId?: string;
  distanceKm: number;
  free: boolean;
  photo?: string;
  owner: string;
  sold: boolean;
  timestamp: number;
  demoSeed?: boolean;
}

export interface PurokDirectory {
  barangayId: string;
  puroks: string[];
}

export interface SystemLogEntry {
  id: string;
  actorId: string;
  actorName: string;
  action: string;
  barangayId: string;
  barangayName: string;
  timestamp: number;
}

interface CommunityAdminState {
  banners: Record<string, string>;
  logs: SystemLogEntry[];
}

const DEFAULT_QUEZON_COMMUNITY_BANNER = '/images/quezon-provincial-capitol-banner.jpg';

@Injectable({ providedIn: 'root' })
export class CommunityWallService {
  private readonly auth = inject(AuthService);
  private readonly storage = inject(LocalStorageService);
  private readonly toast = inject(ToastService);

  readonly bannedWords = signal([
    'profanity', 'shit', 'fuck', 'bitch', 'sex', 'nude', 'naked',
    'harass', 'harassment', 'kill', 'stupid', 'idiot',
  ]);

  readonly notifications = signal<AppNotification[]>([
    { id: 1, title: 'Community update', detail: 'Barangay Cotta posted a community clean-up drive.', kind: 'community', unread: true, timestamp: Date.now() - 2700000, target: { type: 'post', id: 1 } },
  ]);

  readonly listings = signal<MarketplaceListing[]>(createDemoListings(BARANGAYS));
  readonly communityBanners = signal<Record<string, string>>({});
  readonly systemLogs = signal<SystemLogEntry[]>([]);
  private readonly communityAdminStateKey = 'barangay-konek.community-admin.v1';
  private readonly legacyCommunityBannersKey = 'barangay-konek.community-banners.v1';

  readonly puroks = signal<PurokDirectory[]>(
    BARANGAYS.map((barangay) => ({
      barangayId: barangay.id,
      puroks: [
        ...Array.from({ length: 10 }, (_, index) => `Purok ${index + 1}`),
        ...Array.from({ length: 5 }, (_, index) => `Zone ${index + 1}`),
      ],
    })),
  );

  addBarangayDirectory(barangayId: string): void {
    if (this.puroks().some((directory) => directory.barangayId === barangayId)) return;
    this.puroks.update((entries) => [...entries, {
      barangayId,
      puroks: [
        ...Array.from({ length: 10 }, (_, index) => `Purok ${index + 1}`),
        ...Array.from({ length: 5 }, (_, index) => `Zone ${index + 1}`),
      ],
    }]);
    const barangay = this.auth.getBarangay(barangayId);
    if (barangay) {
      const index = this.auth.getBarangays().findIndex((item) => item.id === barangayId);
      this.listings.update((listings) => [...listings, createDemoListing(barangay, index)]);
    }
  }

  removeBarangayDirectory(barangayId: string): void {
    this.puroks.update((entries) => entries.filter((entry) => entry.barangayId !== barangayId));
    this.listings.update((listings) => listings.filter((listing) =>
      listing.barangayId !== barangayId || !listing.demoSeed));
  }

  readonly posts = signal<WallPost[]>([
    {
      id: 1, author: 'Barangay Cotta', initials: 'BC', role: 'Barangay Officer',
      type: 'announcement', title: 'Community Clean-up Drive',
      body: 'Join us this Saturday from 7:00 AM at the covered court. Gloves and sacks will be provided. Participants may register at the barangay hall.',
      timestamp: '45 min ago', likes: 24, liked: false,
      createdAt: Date.now() - 45 * 60 * 1000,
      barangayId: 'brgy_cotta', purok: 'Purok 2',
      comments: [
        { id: 11, author: 'Maria Lopez', text: 'We will join with our block group!', timestamp: '20 min ago' },
        { id: 12, author: 'Jon Ramirez', text: 'Thank you for organizing this.', timestamp: '12 min ago' },
      ],
    },
    {
      id: 2, author: 'Maria Lopez', initials: 'ML', role: 'Resident',
      type: 'incident', severity: 'high', title: 'Fallen branch blocking P. Gomez Street',
      body: 'A large branch is blocking the outer lane near the public market. Please use the alternate route until clearing teams arrive.',
      timestamp: '2 hr ago', likes: 11, liked: false,
      createdAt: Date.now() - 2 * 60 * 60 * 1000,
      barangayId: 'brgy_cotta', purok: 'Purok 1',
      comments: [
        { id: 21, author: 'Barangay Cotta', text: 'The incident has been forwarded to our field team.', timestamp: '1 hr ago' },
      ],
    },
    {
      id: 3, author: 'Amanda Santos', initials: 'AS', role: 'Resident',
      type: 'update', title: 'Brown wallet found near the public market',
      body: 'Found a brown wallet beside the waiting shed. It is now with the barangay hall for safekeeping.',
      timestamp: '3 hr ago', likes: 7, liked: false, comments: [],
      createdAt: Date.now() - 3 * 60 * 60 * 1000,
      barangayId: 'brgy_cotta', purok: 'Purok 3',
    },
    {
      id: 4, author: 'Barangay Cotta', initials: 'BC', role: 'Barangay Captain',
      type: 'event', title: 'Free Health and Wellness Check',
      body: 'Free blood pressure monitoring and basic consultation will be available on Sunday at the covered court, 8:00 AM to 12:00 PM.',
      timestamp: 'Yesterday', likes: 31, liked: false,
      createdAt: Date.now() - 24 * 60 * 60 * 1000,
      barangayId: 'brgy_cotta', purok: 'Purok 4',
      comments: [
        { id: 41, author: 'Alex Mendoza', text: 'Is the check-up open to all ages?', timestamp: 'Yesterday' },
      ],
    },
  ]);

  readonly incidentCount = signal(1);
  readonly notification = signal<string | null>(null);

  constructor() {
    const savedCommunityAdmin = this.storage.read<CommunityAdminState | null>(
      this.communityAdminStateKey,
      null,
      isCommunityAdminState,
    );
    if (savedCommunityAdmin) {
      this.communityBanners.set(savedCommunityAdmin.banners);
      this.systemLogs.set(savedCommunityAdmin.logs);
    } else {
      this.communityBanners.set(
        this.storage.read<Record<string, string>>(this.legacyCommunityBannersKey, {}, isCommunityBannerMap),
      );
    }
    const saved = this.storage.read<WallState | null>('barangay-konek.community.v1', null, isWallState);
    if (saved) {
      this.bannedWords.set(saved.bannedWords);
      this.notifications.set(saved.notifications.map((item) =>
        restoreNotificationTarget(item, saved.posts, saved.listings)));
      this.listings.set([
        ...createDemoListings(this.auth.getBarangays()),
        ...saved.listings
          .filter((listing) => !listing.demoSeed && ![101, 102, 103].includes(listing.id))
          .map((listing) => ({ ...listing, sold: listing.sold ?? false })),
      ]);
      this.puroks.set(saved.puroks);
      this.posts.set(saved.posts.map((post) => ({
        ...post,
        createdAt: this.incidentCreatedAt(post),
        resolvedAt: post.resolved ? post.resolvedAt ?? this.incidentCreatedAt(post) : post.resolvedAt,
      })));
      this.incidentCount.set(saved.incidentCount);
    }

    effect(() => {
      this.storage.write('barangay-konek.community.v1', {
        bannedWords: this.bannedWords(),
        notifications: this.notifications(),
        listings: this.listings(),
        puroks: this.puroks(),
        posts: this.posts(),
        incidentCount: this.incidentCount(),
      });
    });
  }

  communityBanner(barangayId: string | null | undefined): string | undefined {
    if (!barangayId) return undefined;
    const uploadedBanner = this.communityBanners()[barangayId];
    if (uploadedBanner) return uploadedBanner;
    return this.auth.getBarangay(barangayId)?.province.trim().toLocaleLowerCase() === 'quezon'
      ? DEFAULT_QUEZON_COMMUNITY_BANNER
      : undefined;
  }

  setCommunityBanner(barangayId: string, image: string): boolean {
    const account = this.auth.account();
    const barangay = this.auth.getBarangay(barangayId);
    const canManage = account?.role === 'superuser' ||
      (account?.role === 'captain' && account.barangayId === barangayId);
    if (!account || !canManage || !barangay) {
      this.toast.error('You are not allowed to update this community banner.');
      return false;
    }
    if (!image.startsWith('data:image/jpeg;base64,') || image.length > 640_000) {
      this.toast.error('Choose a valid, optimized community banner image.');
      return false;
    }

    const banners = { ...this.communityBanners(), [barangayId]: image };
    const log: SystemLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      actorId: account.id,
      actorName: account.name,
      action: this.communityBanners()[barangayId] ? 'Community banner updated' : 'Community banner uploaded',
      barangayId,
      barangayName: barangay.name,
      timestamp: Date.now(),
    };
    const logs = [log, ...this.systemLogs()].slice(0, 1000);
    if (!this.storage.write(this.communityAdminStateKey, { banners, logs })) {
      this.toast.error('The community banner could not be saved in this browser.');
      return false;
    }
    this.communityBanners.set(banners);
    this.systemLogs.set(logs);
    this.toast.success('Community banner updated.');
    return true;
  }

  toggleLike(postId: number): void {
    this.posts.update((posts) => posts.map((post) => post.id === postId
      ? { ...post, liked: !post.liked, likes: post.likes + (post.liked ? -1 : 1) }
      : post));
  }

  addComment(postId: number, text: string, photo?: string): boolean {
    if (this.isSuspended()) {
      this.notification.set('Your account is suspended from posting and commenting.');
      this.toast.error('Your account is suspended from posting and commenting.');
      return false;
    }
    const cleanText = this.sanitizeText(text);
    if (!cleanText && !photo) return false;
    if (!this.getPost(postId)) return false;
    this.checkTextForViolation(cleanText);

    const comment: WallComment = {
      id: Date.now(), author: this.auth.account()?.name ?? 'Alex Mendoza',
      authorId: this.auth.account()?.id, text: cleanText,
      photo, timestamp: 'Just now',
    };

    this.posts.update((posts) => posts.map((post) => post.id === postId
      ? { ...post, comments: [...post.comments, comment] }
      : post));
    this.toast.success('Comment posted.');
    return true;
  }

  createPost(input: { type: PostType; severity?: Severity; title: string; body: string; photo?: string }): boolean {
    const account = this.auth.account();
    if (this.isSuspended(account)) {
      this.notification.set('Your account is suspended from posting and commenting.');
      this.toast.error('Your account is suspended from posting and commenting.');
      return false;
    }
    if (['announcement', 'event'].includes(input.type) &&
        (!account || !['officer', 'captain', 'superuser'].includes(account.role))) {
      this.notification.set('Only barangay officials can publish announcements and events.');
      this.toast.error('Only barangay officials can publish announcements and events.');
      return false;
    }
    const title = this.sanitizeText(input.title);
    const body = this.sanitizeText(input.body);
    if (!title || !body) {
      this.toast.error('A title and details are required.');
      return false;
    }
    this.checkTextForViolation(`${title} ${body}`);

    const post: WallPost = {
      id: Date.now(), author: account?.name ?? 'Alex Mendoza', authorId: account?.id,
      initials: this.initials(account?.name ?? 'Alex Mendoza'), role: this.roleLabel(account?.role),
      type: input.type, severity: input.type === 'incident' ? input.severity : undefined,
      title, body, timestamp: 'Just now', createdAt: Date.now(),
      likes: 0, liked: false, photo: input.photo, photos: input.photo ? [input.photo] : [], comments: [],
      barangayId: account?.barangayId ?? null, purok: 'Purok 1',
      flaggedCount: 0, flagged: false, resolved: false,
    };

    this.posts.update((posts) => [post, ...posts]);
    this.pushNotification('New community post', `${post.author} posted: ${post.title}`, 'community', undefined, { type: 'post', id: post.id });
    this.toast.success('Post published.');

    if (post.type === 'incident') {
      this.notifyIncident(post);
    }
    return true;
  }

  private notifyIncident(post: WallPost): void {
    this.incidentCount.update((count) => count + 1);
    this.pushNotification('Community incident', post.title, 'violation', undefined, { type: 'post', id: post.id });
    this.notification.set(`${post.severity ?? 'New'} severity incident reported: ${post.title}`);
    window.setTimeout(() => this.notification.set(null), 6000);
  }

  createPostWithPhotos(input: { type: PostType; severity?: Severity; title: string; body: string; photos: string[]; purok?: string }): boolean {
    const account = this.auth.account();
    if (this.isSuspended(account)) {
      this.notification.set('Your account is suspended from posting and commenting.');
      this.toast.error('Your account is suspended from posting and commenting.');
      return false;
    }
    if (['announcement', 'event'].includes(input.type) &&
        (!account || !['officer', 'captain', 'superuser'].includes(account.role))) {
      this.notification.set('Only barangay officials can publish announcements and events.');
      this.toast.error('Only barangay officials can publish announcements and events.');
      return false;
    }
    const title = this.sanitizeText(input.title);
    const body = this.sanitizeText(input.body);
    if (!title || !body) {
      this.toast.error('A title and details are required.');
      return false;
    }
    this.checkTextForViolation(`${title} ${body}`);
    const photos = input.photos.slice(0, 4);
    const post: WallPost = {
      id: Date.now(), author: account?.name ?? 'Alex Mendoza', authorId: account?.id,
      initials: this.initials(account?.name ?? 'Alex Mendoza'), role: this.roleLabel(account?.role),
      type: input.type, severity: input.type === 'incident' ? input.severity : undefined,
      title, body, timestamp: 'Just now', createdAt: Date.now(), likes: 0, liked: false,
      photos, photo: photos[0], comments: [], barangayId: account?.barangayId ?? null,
      purok: input.purok ?? 'Purok 1', flaggedCount: 0, flagged: false, resolved: false,
    };
    this.posts.update((posts) => [post, ...posts]);
    this.pushNotification('New community post', `${post.author} posted: ${post.title}`, 'community', undefined, { type: 'post', id: post.id });
    this.toast.success('Post published.');
    if (post.type === 'incident') this.notifyIncident(post);
    return true;
  }

  reportPost(postId: number): void {
    const target = this.getPost(postId);
    this.posts.update((posts) => posts.map((post) => post.id === postId
      ? { ...post, flagged: true, flaggedCount: (post.flaggedCount ?? 0) + 1 }
      : post));
    if (target?.authorId) this.addViolation(target.authorId);
    this.pushNotification('Post reported', 'A community post was sent to the incident queue.', 'violation', undefined, { type: 'post', id: postId });
    this.toast.success('Post reported to the barangay team.');
  }

  reportComment(postId: number, commentId: number): void {
    const target = this.getPost(postId)?.comments.find((comment) => comment.id === commentId);
    this.posts.update((posts) => posts.map((post) => post.id === postId
      ? { ...post, comments: post.comments.map((comment) => comment.id === commentId ? { ...comment, flagged: true } : comment) }
      : post));
    if (target?.authorId) this.addViolation(target.authorId);
    this.pushNotification('Comment reported', 'A comment was sent for community review.', 'violation', undefined, { type: 'post', id: postId });
    this.toast.success('Comment reported to the barangay team.');
  }

  reportAuthor(authorId: string | undefined, authorName: string): void {
    const account = this.auth.accounts().find((item) => item.id === authorId);
    if (account) this.addViolation(account.id);
    this.pushNotification('Author reported', `${authorName}'s profile received a community report.`, 'violation');
    this.toast.success('User reported to the barangay team.');
  }

  addViolation(accountId: string): void {
    const account = this.auth.accounts().find((item) => item.id === accountId);
    if (!account) return;
    const violationCount = Math.min(100, (account.violationCount ?? 0) + 1);
    let suspendedUntil: number | null = null;
    if (violationCount >= 21) {
      const suspensionDays = violationCount >= 81 ? 30 : violationCount >= 61 ? 20 : violationCount >= 41 ? 10 : 5;
      suspendedUntil = Date.now() + suspensionDays * 86400000;
    }
    const updated = { ...account, violationCount, suspendedUntil };
    void this.auth.updateAccount(updated).catch((error: unknown) =>
      this.toast.error(error instanceof Error ? error.message : 'Unable to update the reported account.'));
    const status = this.violationStatus(violationCount);
    this.pushNotification('Community strike', `${account.name} received a report. Status: ${status.label}.`, 'violation');
  }

  permanentBan(accountId: string): void {
    const account = this.auth.accounts().find((item) => item.id === accountId);
    if (!account) return;
    void this.auth.updateAccount({ ...account, banned: true, suspendedUntil: null }).catch((error: unknown) =>
      this.toast.error(error instanceof Error ? error.message : 'Unable to update the banned account.'));
    this.toast.success(`${account.name} has been permanently banned.`);
  }

  violationStatus(count: number): { label: string; suspensionDays: number } {
    if (count <= 0) return { label: 'Healthy', suspensionDays: 0 };
    if (count <= 20) return { label: 'Mild', suspensionDays: 0 };
    if (count <= 40) return { label: 'Hot', suspensionDays: 5 };
    if (count <= 60) return { label: 'Very Hot', suspensionDays: 10 };
    if (count <= 80) return { label: 'Severe', suspensionDays: 20 };
    return { label: 'Danger Zone', suspensionDays: 30 };
  }

  resolveIncident(postId: number, comment: string, photo?: string): void {
    const evidence = this.sanitizeText(comment);
    if (!evidence && !photo) {
      this.toast.error('Add a resolution comment or evidence photo.');
      return;
    }
    const account = this.auth.account();
    const incident = this.getPost(postId);
    if (!account || !incident || !['officer', 'captain', 'superuser'].includes(account.role) ||
        (account.role !== 'superuser' && incident.barangayId !== account.barangayId)) {
      this.notification.set('Only the barangay team can resolve incidents in their assigned barangay.');
      this.toast.error('Only the barangay team can resolve incidents in their assigned barangay.');
      return;
    }
    this.posts.update((posts) => posts.map((post) => post.id === postId
      ? { ...post, resolved: true, resolvedAt: Date.now(), resolutionComment: evidence || undefined, resolutionPhoto: photo }
      : post));
    if (incident.type === 'incident' && !incident.resolved) {
      this.incidentCount.update((count) => Math.max(0, count - 1));
    }
    this.pushNotification('Incident resolved', 'A community incident was marked resolved.', 'community', undefined, { type: 'post', id: postId });
    this.toast.success('Incident marked as resolved.');
  }

  addListing(input: Omit<MarketplaceListing, 'id' | 'timestamp' | 'sold'>): boolean {
    if (this.isSuspended()) {
      this.notification.set('Your account is suspended from posting and commenting.');
      this.toast.error('Your account is suspended from posting and commenting.');
      return false;
    }
    const listing: MarketplaceListing = { ...input, sold: false, id: Date.now(), timestamp: Date.now() };
    this.listings.update((items) => [listing, ...items]);
    this.toast.success('Free listing published.');
    const account = this.auth.account();
    if (account?.marketplaceAlerts && listing.distanceKm <= (account.marketplaceRadiusKm ?? 25)) {
      this.pushNotification('Free listing near you', `${listing.title} is ${listing.distanceKm} km away.`, 'marketplace', undefined, { type: 'listing', id: listing.id });
    }
    return true;
  }

  markListingSold(listingId: number): boolean {
    const listing = this.listings().find((item) => item.id === listingId);
    const account = this.auth.account();
    const ownsListing = !!listing && !listing.demoSeed && !!account && (
      listing.ownerId ? listing.ownerId === account.id :
        listing.owner.trim().toLocaleLowerCase() === account.name.trim().toLocaleLowerCase()
    );
    if (!ownsListing) {
      this.toast.error('Only the person who posted this item can mark it as sold.');
      return false;
    }
    if (listing.sold) return true;
    this.listings.update((items) => items.map((item) =>
      item.id === listingId ? { ...item, sold: true } : item));
    this.toast.success('Listing marked as sold.');
    return true;
  }

  pushNotification(
    title: string,
    detail: string,
    kind: AppNotification['kind'],
    userId?: string,
    target?: AppNotification['target'],
  ): void {
    const account = userId
      ? this.auth.accounts().find((item) => item.id === userId)
      : this.auth.account();
    const preferences = account?.notifications;
    if (kind === 'marketplace' && (!account?.marketplaceAlerts || preferences?.marketplace === false)) return;
    if (kind === 'message' && preferences?.messages === false) return;
    if (kind === 'violation' && preferences?.incidents === false) return;
    if (kind === 'community' && preferences?.announcements === false) return;
    this.notifications.update((items) => [
      { id: Date.now(), title, detail, kind, unread: true, timestamp: Date.now(), userId, target },
      ...items,
    ].slice(0, 30));
  }

  notificationsFor(userId: string | undefined): AppNotification[] {
    return this.notifications().filter((item) => !item.userId || item.userId === userId);
  }

  markNotificationsRead(): void {
    const userId = this.auth.account()?.id;
    this.notifications.update((items) => items.map((item) =>
      !item.userId || item.userId === userId ? { ...item, unread: false } : item));
  }

  markNotificationRead(notificationId: number): void {
    const userId = this.auth.account()?.id;
    this.notifications.update((items) => items.map((item) =>
      item.id === notificationId && (!item.userId || item.userId === userId)
        ? { ...item, unread: false }
        : item));
  }

  addBannedWord(word: string): void {
    const clean = word.trim().toLowerCase();
    if (!clean) return;
    this.bannedWords.update((words) => words.includes(clean) ? words : [...words, clean]);
  }

  removeBannedWord(word: string): void {
    this.bannedWords.update((words) => words.filter((item) => item !== word));
  }

  checkTextForViolation(text: string): void {
    const normalized = text.toLowerCase();
    if (this.bannedWords().some((word) => normalized.includes(word))) {
      const account = this.auth.account();
      if (account) this.addViolation(account.id);
    }
  }

  sanitizeText(text: string): string {
    const withoutHtml = text.replace(/<[^>]*>/g, '');
    return withoutHtml
      .replace(/https?:\/\/\S+/gi, '[link removed]')
      .replace(/\bwww\.[^\s]+/gi, '[link removed]')
      .trim();
  }

  isSuspended(account = this.auth.account()): boolean {
    return !!account?.banned || (!!account?.suspendedUntil && account.suspendedUntil > Date.now());
  }

  private initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
  }

  private roleLabel(role: AccountRole | undefined): WallPost['role'] {
    if (role === 'officer') return 'Barangay Officer';
    if (role === 'captain') return 'Barangay Captain';
    if (role === 'superuser') return 'Superuser';
    return 'Resident';
  }

  getPost(id: number): WallPost | undefined {
    return this.posts().find((post) => post.id === id);
  }

  incidentCreatedAt(post: WallPost): number {
    if (typeof post.createdAt === 'number' && Number.isFinite(post.createdAt)) return post.createdAt;
    if (post.id > 1_000_000_000_000) return post.id;
    if (/yesterday/i.test(post.timestamp)) return Date.now() - 24 * 60 * 60 * 1000;
    const relative = post.timestamp.match(/^(\d+)\s*(min(?:ute)?s?|hr|hours?|days?)\s+ago$/i);
    if (!relative) return Date.now();
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    const multiplier = unit.startsWith('min') ? 60_000
      : unit.startsWith('hr') || unit.startsWith('hour') ? 60 * 60 * 1000
      : 24 * 60 * 60 * 1000;
    return Date.now() - amount * multiplier;
  }

  incidentStatus(post: WallPost, now = Date.now()): IncidentStatus {
    if (post.resolved) return 'resolved';
    return now - this.incidentCreatedAt(post) >= 30 * 24 * 60 * 60 * 1000 ? 'unresolved' : 'active';
  }

  incidentStatusLabel(post: WallPost): string {
    const status = this.incidentStatus(post);
    return status === 'resolved' ? 'Resolved' : status === 'unresolved' ? 'Unresolved' : 'Open / Active';
  }
}

interface WallState {
  bannedWords: string[];
  notifications: AppNotification[];
  listings: MarketplaceListing[];
  puroks: PurokDirectory[];
  posts: WallPost[];
  incidentCount: number;
}

function isWallState(value: unknown): value is WallState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<WallState>;
  return Array.isArray(state.bannedWords) && Array.isArray(state.notifications) &&
    Array.isArray(state.listings) && Array.isArray(state.puroks) &&
    Array.isArray(state.posts) && typeof state.incidentCount === 'number';
}

function isCommunityBannerMap(value: unknown): value is Record<string, string> {
  return !!value && typeof value === 'object' && !Array.isArray(value) &&
    Object.entries(value).every(([barangayId, image]) =>
      !!barangayId && typeof image === 'string' &&
      image.startsWith('data:image/jpeg;base64,') && image.length <= 640_000);
}

function isCommunityAdminState(value: unknown): value is CommunityAdminState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<CommunityAdminState>;
  return isCommunityBannerMap(state.banners) &&
    Array.isArray(state.logs) && state.logs.every(isSystemLogEntry);
}

function isSystemLogEntry(value: unknown): value is SystemLogEntry {
  if (!value || typeof value !== 'object') return false;
  const log = value as Partial<SystemLogEntry>;
  return typeof log.id === 'string' &&
    typeof log.actorId === 'string' &&
    typeof log.actorName === 'string' &&
    typeof log.action === 'string' &&
    typeof log.barangayId === 'string' &&
    typeof log.barangayName === 'string' &&
    typeof log.timestamp === 'number';
}

const DEMO_LISTINGS = [
  { title: 'Compact rice cooker', category: 'Appliances', description: 'Clean and working, suitable for a small household.' },
  { title: "Children's storybook set", category: 'Books', description: 'A small bundle of gently used storybooks for young readers.' },
  { title: 'Foldable study table', category: 'Furniture', description: 'Lightweight table with a few signs of use; still sturdy.' },
  { title: 'Reusable food containers', category: 'Other', description: 'A clean set of kitchen containers, free for pickup.' },
  { title: 'Electric desk fan', category: 'Appliances', description: 'Working fan with normal wear. Please arrange a daytime pickup.' },
  { title: 'Elementary notebooks', category: 'Books', description: 'Unused and partly used notebooks from the previous school year.' },
  { title: 'Plastic storage drawers', category: 'Furniture', description: 'Three-drawer organizer in good, usable condition.' },
  { title: 'Potted ornamental plant', category: 'Other', description: 'Healthy low-maintenance plant in a reusable pot.' },
  { title: 'Kitchen kettle', category: 'Appliances', description: 'Electric kettle in good working condition.' },
  { title: 'Paperback novels', category: 'Books', description: 'A few light-read novels; some covers show wear.' },
  { title: 'Wooden dining chairs', category: 'Furniture', description: 'Pair of sturdy chairs with ordinary household wear.' },
  { title: 'Laundry basket and hangers', category: 'Other', description: 'Clean laundry basket with a bundle of reusable hangers.' },
];

const DEMO_OWNERS = [
  'Mara Santos', 'Paolo Reyes', 'Liza Mendoza', 'Rico Dela Cruz',
  'Ana Bautista', 'Joel Navarro', 'Mila Ramos', 'Carlo Garcia',
];

function createDemoListings(barangays: Array<{ id: string; name: string; city: string; province: string }>): MarketplaceListing[] {
  return barangays.map((barangay, index) => createDemoListing(barangay, index));
}

function createDemoListing(
  barangay: { id: string; name: string; city: string; province: string },
  index: number,
): MarketplaceListing {
  const item = DEMO_LISTINGS[index % DEMO_LISTINGS.length];
  return {
    id: 10000 + index,
    title: item.title,
    category: item.category,
    description: `${item.description} Sample pickup area: ${barangay.name}, ${barangay.city}, ${barangay.province}. Coordinate a safe public pickup with the giver.`,
    barangayId: barangay.id,
    distanceKm: Math.round((0.3 + (index % 12) * 0.45) * 10) / 10,
    free: true,
    owner: DEMO_OWNERS[index % DEMO_OWNERS.length],
    sold: false,
    timestamp: Date.now() - (index % 24) * 60 * 60 * 1000,
    demoSeed: true,
  };
}

function restoreNotificationTarget(
  notification: AppNotification,
  posts: WallPost[],
  listings: MarketplaceListing[],
): AppNotification {
  if (notification.target) return notification;
  if (notification.title === 'Community update' && posts.some((post) => post.id === 1)) {
    return { ...notification, target: { type: 'post', id: 1 } };
  }
  if (notification.kind === 'marketplace') {
    const listing = listings.find((item) => notification.detail.includes(item.title));
    if (listing) return { ...notification, target: { type: 'listing', id: listing.id } };
  }
  const postTitle = notification.title === 'Community incident'
    ? notification.detail
    : notification.detail.split(' posted: ').at(-1);
  const post = posts.find((item) => item.title === postTitle);
  return post ? { ...notification, target: { type: 'post', id: post.id } } : notification;
}
