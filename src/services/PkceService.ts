import crypto from 'crypto';

type StoredVerifier = {
  codeVerifier: string;
  expiresAt: number;
};

class PkceService {
  private store = new Map<string, StoredVerifier>();
  private readonly ttlMs = 10 * 60 * 1000; // 10 minutes

  generateState(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  generateCodeVerifier(length = 64): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    let out = '';
    for (let i = 0; i < length; i++) {
      const idx = crypto.randomInt(0, chars.length);
      out += chars[idx];
    }
    return out;
  }

  toBase64Url(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }

  createChallenge(verifier: string): string {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return this.toBase64Url(hash);
  }

  saveVerifier(state: string, codeVerifier: string): void {
    const expiresAt = Date.now() + this.ttlMs;
    this.store.set(state, { codeVerifier, expiresAt });
    // Opportunistic cleanup
    this.cleanup();
  }

  consumeVerifier(state: string): string | null {
    const entry = this.store.get(state);
    if (!entry) return null;
    this.store.delete(state);
    if (entry.expiresAt < Date.now()) return null;
    return entry.codeVerifier;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [k, v] of this.store.entries()) {
      if (v.expiresAt < now) this.store.delete(k);
    }
  }
}

export const pkceService = new PkceService();


