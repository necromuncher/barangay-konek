import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../auth/auth.service';
import { Account } from '../../auth/auth.models';
import { MessagingService } from '../../messaging.service';

@Component({
  imports: [DatePipe, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule],
  selector: 'app-messages',
  styleUrl: './messages.scss',
  templateUrl: './messages.html',
})
export class Messages {
  readonly auth = inject(AuthService);
  readonly messaging = inject(MessagingService);
  readonly activeUserId = signal<string | null>(null);
  readonly showingContacts = signal(false);
  readonly draft = signal('');
  readonly threads = computed(() => this.messaging.threadsFor(this.auth.account()?.id ?? ''));
  readonly contacts = computed(() => {
    const currentId = this.auth.account()?.id;
    return this.auth.accounts().filter((account) => account.id !== currentId && !account.banned);
  });
  readonly activeUser = computed(() =>
    this.auth.accounts().find((account) => account.id === this.activeUserId()) ?? null);
  readonly activeThreadId = computed(() => {
    const currentId = this.auth.account()?.id;
    const recipientId = this.activeUserId();
    return currentId && recipientId ? this.messaging.threadIdFor(currentId, recipientId) : null;
  });
  readonly activeMessages = computed(() => {
    const threadId = this.activeThreadId();
    return threadId ? this.messaging.messagesFor(threadId) : [];
  });

  openConversation(account: Account): void {
    this.activeUserId.set(account.id);
    this.showingContacts.set(false);
    const userId = this.auth.account()?.id;
    const threadId = userId ? this.messaging.threadIdFor(userId, account.id) : null;
    if (threadId && userId) this.messaging.markThreadRead(threadId, userId);
  }

  openNewMessage(): void {
    this.activeUserId.set(null);
    this.showingContacts.set(true);
    this.messaging.error.set(null);
  }

  async send(): Promise<void> {
    const recipientId = this.activeUserId();
    if (recipientId && await this.messaging.sendMessage(recipientId, this.draft())) {
      this.draft.set('');
    }
  }

  participantFor(threadId: string): Account | undefined {
    const summary = this.threads().find((thread) => thread.threadId === threadId);
    return summary ? this.auth.accounts().find((account) => account.id === summary.participantId) : undefined;
  }
}
