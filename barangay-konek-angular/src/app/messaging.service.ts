import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from './auth/auth.service';
import { LocalStorageService } from './local-storage.service';
import { CommunityWallService } from './community-wall.service';
import { MessageCryptoService } from './message-crypto.service';
import { ToastService } from './toast.service';

export interface DirectMessage {
  id: string;
  threadId: string;
  senderId: string;
  recipientId: string;
  text: string;
  sentAt: number;
  readAt?: number;
}

export interface MessageThread {
  threadId: string;
  participantId: string;
  lastMessage: DirectMessage;
  unreadCount: number;
}

export interface MiniConversation {
  recipientId: string | null;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class MessagingService {
  readonly messages = signal<DirectMessage[]>([]);
  readonly error = signal<string | null>(null);
  readonly ready = signal(false);
  readonly miniConversation = signal<MiniConversation | null>(null);
  readonly miniMinimized = signal(false);
  readonly miniDraft = signal('');
  private readonly auth = inject(AuthService);
  private readonly storage = inject(LocalStorageService);
  private readonly wall = inject(CommunityWallService);
  private readonly crypto = inject(MessageCryptoService);
  private readonly toast = inject(ToastService);
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly encryptedKey = 'barangay-konek.messages.v2';
  private readonly legacyKey = 'barangay-konek.messages.v1';

  constructor() {
    void this.restore();
  }

  threadIdFor(firstUserId: string, secondUserId: string): string {
    return [firstUserId, secondUserId].sort().join(':');
  }

  openMiniConversation(recipientId: string | undefined, displayName: string): void {
    const normalizedName = displayName.trim().toLocaleLowerCase();
    const recipient = this.auth.accounts().find((account) => account.id === recipientId) ??
      this.auth.accounts().find((account) => account.name.trim().toLocaleLowerCase() === normalizedName);
    this.miniConversation.set({
      recipientId: recipient?.id ?? null,
      name: recipient?.name ?? displayName,
    });
    this.miniMinimized.set(false);
    this.miniDraft.set('');
    const currentUserId = this.auth.account()?.id;
    if (recipient && currentUserId && recipient.id !== currentUserId) {
      this.markThreadRead(this.threadIdFor(currentUserId, recipient.id), currentUserId);
    }
  }

  closeMiniConversation(): void {
    this.miniConversation.set(null);
    this.miniMinimized.set(false);
    this.miniDraft.set('');
  }

  minimizeMiniConversation(): void {
    this.miniMinimized.set(true);
  }

  restoreMiniConversation(): void {
    this.miniMinimized.set(false);
  }

  threadsFor(userId: string): MessageThread[] {
    const groups = new Map<string, DirectMessage[]>();
    for (const message of this.messages()) {
      if (message.senderId !== userId && message.recipientId !== userId) continue;
      const thread = groups.get(message.threadId) ?? [];
      thread.push(message);
      groups.set(message.threadId, thread);
    }

    return [...groups.entries()].map(([threadId, messages]) => {
      const lastMessage = messages.reduce((latest, message) => message.sentAt > latest.sentAt ? message : latest);
      return {
        threadId,
        participantId: lastMessage.senderId === userId ? lastMessage.recipientId : lastMessage.senderId,
        lastMessage,
        unreadCount: messages.filter((message) => message.recipientId === userId && !message.readAt).length,
      };
    }).sort((first, second) => second.lastMessage.sentAt - first.lastMessage.sentAt);
  }

  messagesFor(threadId: string): DirectMessage[] {
    return this.messages()
      .filter((message) => message.threadId === threadId)
      .sort((first, second) => first.sentAt - second.sentAt);
  }

  unreadCount(userId: string | undefined): number {
    if (!userId) return 0;
    return this.messages().filter((message) => message.recipientId === userId && !message.readAt).length;
  }

  markThreadRead(threadId: string, userId: string): void {
    const now = Date.now();
    const hasUnread = this.messages().some((message) =>
      message.threadId === threadId && message.recipientId === userId && !message.readAt);
    if (!hasUnread) return;
    this.messages.update((messages) => messages.map((message) =>
      message.threadId === threadId && message.recipientId === userId && !message.readAt
        ? { ...message, readAt: now }
        : message));
    void this.persistMessages();
  }

  async sendMessage(recipientId: string, value: string): Promise<boolean> {
    const sender = this.auth.account();
    const recipient = this.auth.accounts().find((account) => account.id === recipientId);
    if (!this.ready() || !sender || !recipient || sender.id === recipient.id || sender.banned || recipient.banned) {
      this.error.set('This conversation is not available.');
      this.toast.error('This conversation is not available.');
      return false;
    }

    const text = this.wall.sanitizeText(value);
    if (!text) {
      this.error.set('Write a message without HTML or hyperlinks.');
      this.toast.error('Write a message without HTML or hyperlinks.');
      return false;
    }

    const threadId = this.threadIdFor(sender.id, recipient.id);
    const message: DirectMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      threadId,
      senderId: sender.id,
      recipientId: recipient.id,
      text,
      sentAt: Date.now(),
    };
    this.messages.update((messages) => [...messages, message]);
    if (!await this.persistMessages()) {
      this.messages.update((messages) => messages.filter((item) => item.id !== message.id));
      this.error.set('Message could not be securely saved.');
      return false;
    }
    this.wall.pushNotification('New private message', `${sender.name} sent you a message.`, 'message', recipient.id, {
      type: 'message',
      id: threadId,
    });
    this.error.set(null);
    this.toast.success('Message sent.');
    return true;
  }

  private async restore(): Promise<void> {
    const encrypted = this.storage.read<string | null>(this.encryptedKey, null, isEncryptedMessageStore);
    try {
      if (encrypted) {
        const restored: unknown = JSON.parse(await this.crypto.decrypt(encrypted));
        if (!isMessages(restored)) throw new Error('Encrypted messages have an unexpected format.');
        this.messages.set(restored);
      } else {
        const legacy = this.storage.read<DirectMessage[]>(this.legacyKey, [], isMessages);
        this.messages.set(legacy);
        if (legacy.length && await this.persistMessages()) this.storage.remove(this.legacyKey);
      }
      this.ready.set(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to decrypt local messages.';
      this.error.set(message);
      this.storage.setError('message-encryption', `Local messages could not be decrypted: ${message}`);
    }
  }

  private async persistMessages(): Promise<boolean> {
    const serialized = JSON.stringify(this.messages());
    const task = this.writeQueue.then(async () => {
      try {
        const encrypted = await this.crypto.encrypt(serialized);
        const saved = this.storage.write(this.encryptedKey, encrypted);
        if (saved) this.storage.clearError('message-encryption');
        return saved;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Secure message storage is unavailable.';
        this.storage.setError('message-encryption', `Unable to encrypt local messages: ${message}`);
        return false;
      }
    });
    this.writeQueue = task.then(() => undefined);
    return task;
  }
}

function isMessages(value: unknown): value is DirectMessage[] {
  return Array.isArray(value) && value.every((item) =>
    !!item && typeof item === 'object' &&
    typeof item.id === 'string' &&
    typeof item.threadId === 'string' &&
    typeof item.senderId === 'string' &&
    typeof item.recipientId === 'string' &&
    typeof item.text === 'string' &&
    typeof item.sentAt === 'number');
}

function isEncryptedMessageStore(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.startsWith('v1.'));
}
