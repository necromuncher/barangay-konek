import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-auth',
  imports: [FormsModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  templateUrl: './auth.html',
  styleUrl: './auth.scss',
})
export class AuthComponent {
  readonly auth = inject(AuthService);
  readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  get barangays() {
    return this.auth.getBarangays();
  }

  readonly mode = signal<'choose' | 'details' | 'otp' | 'login' | 'loginOtp' | 'passwordLogin' | 'forgotPassword' | 'updatePassword'>('choose');
  readonly name = signal('');
  readonly email = signal('');
  readonly mobile = signal('');
  readonly barangayId = signal(this.auth.getBarangays()[0]?.id ?? '');
  readonly address = signal('');
  readonly otp = signal('');
  readonly pendingEmail = signal('');
  readonly loginId = signal('');
  readonly password = signal('');
  readonly newPassword = signal('');
  readonly confirmPassword = signal('');
  readonly resetLinkSent = signal(false);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly retryAfterSeconds = signal(0);
  private cooldownEmail = '';
  private cooldownTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const query = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (query.get('mode') === 'update-password' || query.get('type') === 'recovery' || hash.get('type') === 'recovery') {
      this.mode.set('updatePassword');
    }
    this.destroyRef.onDestroy(() => {
      if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    });
    effect(() => {
      const error = this.error() || this.auth.authError();
      if (error) this.toast.error(error);
    });
  }

  async submitDetails(): Promise<void> {
    if (!this.name().trim() || !this.email().trim() || !this.mobile().trim()) {
      this.error.set('Please fill in your name, email, and mobile number.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (this.mobile().replace(/\D/g, '').length < 10) {
      this.error.set('Enter a valid mobile number (for example, 09XX XXX XXXX).');
      return;
    }
    if (!this.barangayId()) {
      this.error.set('Select your barangay.');
      return;
    }
    if (this.isCoolingDown(this.email())) return;

    await this.runAuthAction(async () => {
      const email = this.email().trim().toLowerCase();
      await this.auth.requestSignupCode({
        name: this.name().trim(),
        email,
        mobile: this.mobile().trim(),
        barangayId: this.barangayId(),
        address: this.address().trim(),
      });
      this.startCooldown(email);
      this.pendingEmail.set(email);
      this.otp.set('');
      this.mode.set('otp');
    });
  }

  async verifySignupOtp(): Promise<void> {
    await this.verifyCodeAndContinue();
  }

  async submitLogin(): Promise<void> {
    const email = this.loginId().trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (this.isCoolingDown(email)) return;
    await this.runAuthAction(async () => {
      await this.auth.requestLoginCode(email);
      this.startCooldown(email);
      this.pendingEmail.set(email);
      this.otp.set('');
      this.mode.set('loginOtp');
    });
  }

  async verifyLoginOtp(): Promise<void> {
    await this.verifyCodeAndContinue();
  }

  async submitPasswordLogin(): Promise<void> {
    const email = this.loginId().trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (!this.password()) {
      this.error.set('Enter your password.');
      return;
    }
    await this.runAuthAction(async () => {
      await this.auth.signInWithPassword(email, this.password());
      this.toast.success('You are signed in.');
      await this.router.navigate(['/dashboard']);
    });
  }

  async sendPasswordReset(): Promise<void> {
    const email = this.loginId().trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      this.error.set('Enter a valid email address.');
      return;
    }
    if (this.isCoolingDown(email)) return;
    await this.runAuthAction(async () => {
      await this.auth.requestPasswordReset(email);
      this.startCooldown(email);
      this.resetLinkSent.set(true);
    });
  }

  async saveNewPassword(): Promise<void> {
    if (this.newPassword().length < 8) {
      this.error.set('Use a password with at least 8 characters.');
      return;
    }
    if (this.newPassword() !== this.confirmPassword()) {
      this.error.set('The passwords do not match.');
      return;
    }
    await this.runAuthAction(async () => {
      await this.auth.updatePassword(this.newPassword());
      await this.auth.ready;
      if (!this.auth.account()) {
        throw new Error(this.auth.authError() ?? 'Your account profile could not be loaded. Apply the latest Supabase setup SQL and reload.');
      }
      this.toast.success('Password updated. You are signed in.');
      await this.router.navigate(['/dashboard']);
    });
  }

  isCoolingDown(email: string): boolean {
    return this.retryAfterSeconds() > 0 && this.cooldownEmail === email.trim().toLowerCase();
  }

  codeButtonLabel(email: string): string {
    if (this.busy()) return 'Sending code…';
    return this.isCoolingDown(email) ? `Try again in ${this.retryAfterSeconds()}s` : 'Send email link/code';
  }

  backToChoose(): void {
    this.error.set('');
    this.mode.set('choose');
  }

  private async verifyCodeAndContinue(): Promise<void> {
    if (!/^\d+$/.test(this.otp())) {
      this.error.set('Enter the numeric one-time code from your email.');
      return;
    }
    await this.runAuthAction(async () => {
      await this.auth.verifyEmailCode(this.pendingEmail(), this.otp());
      this.toast.success('Email verified. You are signed in.');
      await this.router.navigate(['/dashboard']);
    });
  }

  private async runAuthAction(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.auth.authError.set(null);
    try {
      await action();
    } catch (error) {
      if (isRateLimitError(error)) {
        const email = this.mode() === 'login' || this.mode() === 'passwordLogin' || this.mode() === 'forgotPassword'
          ? this.loginId()
          : this.mode() === 'loginOtp'
            ? this.pendingEmail()
            : this.email();
        this.startCooldown(email);
        this.error.set('Supabase or your SMTP provider is limiting email delivery. The app’s 60-second cooldown may be shorter than the provider’s limit. Avoid retrying until the send window resets; check Supabase Auth rate limits and your SMTP provider quota.');
      } else {
        this.error.set(error instanceof Error ? error.message : 'Unable to complete email verification.');
      }
    } finally {
      this.busy.set(false);
    }
  }

  private startCooldown(email: string): void {
    this.cooldownEmail = email.trim().toLowerCase();
    this.retryAfterSeconds.set(60);
    if (this.cooldownTimer) clearInterval(this.cooldownTimer);
    this.cooldownTimer = setInterval(() => {
      const remaining = this.retryAfterSeconds() - 1;
      this.retryAfterSeconds.set(Math.max(0, remaining));
      if (remaining <= 0) {
        if (this.cooldownTimer) clearInterval(this.cooldownTimer);
        this.cooldownTimer = null;
        if (this.error().startsWith('Supabase or your SMTP provider is limiting email delivery.')) this.error.set('');
      }
    }, 1000);
  }
}

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && /rate limit|too many requests/i.test(error.message);
}
