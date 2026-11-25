import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class MessageCryptoService {
  private keyPromise?: Promise<CryptoKey>;
  private static readonly databaseName = 'barangay-konek-crypto';
  private static readonly storeName = 'keys';
  private static readonly keyId = 'local-message-aes-gcm-v1';

  async encrypt(value: string): Promise<string> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await this.getKey(),
      new TextEncoder().encode(value),
    );
    return `v1.${toBase64(iv)}.${toBase64(new Uint8Array(encrypted))}`;
  }

  async decrypt(value: string): Promise<string> {
    const [version, encodedIv, encodedData] = value.split('.');
    if (version !== 'v1' || !encodedIv || !encodedData) throw new Error('Encrypted message has an invalid format.');
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(encodedIv) },
      await this.getKey(),
      fromBase64(encodedData),
    );
    return new TextDecoder().decode(decrypted);
  }

  private getKey(): Promise<CryptoKey> {
    if (!globalThis.crypto?.subtle || !globalThis.indexedDB) {
      return Promise.reject(new Error('Secure browser encryption is unavailable.'));
    }
    this.keyPromise ??= this.loadOrCreateKey();
    return this.keyPromise;
  }

  private async loadOrCreateKey(): Promise<CryptoKey> {
    const database = await this.openDatabase();
    const existing = await this.readKey(database);
    if (existing) return existing;

    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await this.writeKey(database, key);
    return key;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(MessageCryptoService.databaseName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(MessageCryptoService.storeName)) {
          request.result.createObjectStore(MessageCryptoService.storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Could not open the local encryption key store.'));
      request.onblocked = () => reject(new Error('The local encryption key store is blocked by another tab.'));
    });
  }

  private readKey(database: IDBDatabase): Promise<CryptoKey | null> {
    return new Promise((resolve, reject) => {
      const request = database.transaction(MessageCryptoService.storeName, 'readonly')
        .objectStore(MessageCryptoService.storeName).get(MessageCryptoService.keyId);
      request.onsuccess = () => resolve(request.result ?? null);
      request.onerror = () => reject(request.error ?? new Error('Could not read the local encryption key.'));
    });
  }

  private writeKey(database: IDBDatabase, key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(MessageCryptoService.storeName, 'readwrite');
      transaction.objectStore(MessageCryptoService.storeName).put(key, MessageCryptoService.keyId);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not save the local encryption key.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Saving the local encryption key was aborted.'));
    });
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return bytes;
}
