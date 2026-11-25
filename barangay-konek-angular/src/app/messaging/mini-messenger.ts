import { DatePipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../auth/auth.service';
import { MessagingService } from '../messaging.service';

@Component({
  imports: [DatePipe, FormsModule, MatButtonModule, MatIconModule],
  selector: 'app-mini-messenger',
  styleUrl: './mini-messenger.scss',
  templateUrl: './mini-messenger.html',
})
export class MiniMessenger {
  readonly auth = inject(AuthService);
  readonly messaging = inject(MessagingService);
  readonly recipient = computed(() => {
    const recipientId = this.messaging.miniConversation()?.recipientId;
    return recipientId ? this.auth.accounts().find((account) => account.id === recipientId) ?? null : null;
  });
  readonly messages = computed(() => {
    const currentUserId = this.auth.account()?.id;
    const recipientId = this.messaging.miniConversation()?.recipientId;
    if (!currentUserId || !recipientId || currentUserId === recipientId) return [];
    return this.messaging.messagesFor(this.messaging.threadIdFor(currentUserId, recipientId)).slice(-40);
  });

  unavailableMessage(): string | null {
    const conversation = this.messaging.miniConversation();
    if (!conversation) return null;
    const currentUserId = this.auth.account()?.id;
    if (!conversation.recipientId) return 'This profile is not linked to a registered local account.';
    if (conversation.recipientId === currentUserId) return 'You cannot send a private message to your own profile.';
    if (!this.recipient()) return 'This account is no longer available.';
    if (this.recipient()?.banned) return 'This account is unavailable for private messages.';
    return null;
  }

  async send(): Promise<void> {
    const recipientId = this.messaging.miniConversation()?.recipientId;
    if (recipientId && await this.messaging.sendMessage(recipientId, this.messaging.miniDraft())) {
      this.messaging.miniDraft.set('');
    }
  }
}
