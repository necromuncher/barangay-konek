import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LocalStorageService {
  private readonly errors = signal<Record<string, string>>({});
  readonly error = computed(() => Object.values(this.errors()).join(' '));

  read<T>(key: string, fallback: T, isValid: (value: unknown) => value is T): T {
    if (typeof localStorage === 'undefined') return fallback;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      const value: unknown = JSON.parse(raw);
      if (!isValid(value)) throw new Error('Stored data has an unexpected format.');
      return value;
    } catch (error) {
      this.errors.update((errors) => ({
        ...errors,
        [key]: `Unable to load local test data (${key}): ${this.errorMessage(error)}`,
      }));
      return fallback;
    }
  }

  write(key: string, value: unknown): boolean {
    if (typeof localStorage === 'undefined') return true;
    try {
      localStorage.setItem(key, JSON.stringify(value));
      this.errors.update((errors) => {
        const { [key]: _savedError, ...remaining } = errors;
        return remaining;
      });
      return true;
    } catch (error) {
      this.errors.update((errors) => ({
        ...errors,
        [key]: `Unable to save local test data (${key}): ${this.errorMessage(error)}`,
      }));
      return false;
    }
  }

  remove(key: string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.removeItem(key);
      this.errors.update((errors) => {
        const { [key]: _removedError, ...remaining } = errors;
        return remaining;
      });
    } catch (error) {
      this.errors.update((errors) => ({
        ...errors,
        [key]: `Unable to remove local test data (${key}): ${this.errorMessage(error)}`,
      }));
    }
  }

  setError(key: string, message: string): void {
    this.errors.update((errors) => ({ ...errors, [key]: message }));
  }

  clearError(key: string): void {
    this.errors.update((errors) => {
      const { [key]: _clearedError, ...remaining } = errors;
      return remaining;
    });
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Browser storage is unavailable.';
  }
}
