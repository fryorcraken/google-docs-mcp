import { Firestore } from '@google-cloud/firestore';
import type { TokenStorage } from 'fastmcp/auth';

const COLLECTION = 'mcp-oauth-tokens';

/**
 * Firestore-backed TokenStorage for FastMCP's OAuth proxy.
 * Tokens survive container restarts and redeployments.
 * On Cloud Run, authentication is automatic via the service account.
 */
export class FirestoreTokenStorage implements TokenStorage {
  private db: Firestore;

  constructor(projectId?: string) {
    this.db = new Firestore({ projectId });
  }

  async save(key: string, value: unknown, _ttl?: number): Promise<void> {
    const doc = this.db.collection(COLLECTION).doc(encodeKey(key));
    await doc.set({ value, createdAt: Date.now() });
  }

  async get(key: string): Promise<unknown | null> {
    const doc = await this.db.collection(COLLECTION).doc(encodeKey(key)).get();
    if (!doc.exists) return null;
    return doc.data()!.value;
  }

  async delete(key: string): Promise<void> {
    await this.db.collection(COLLECTION).doc(encodeKey(key)).delete();
  }

  async cleanup(): Promise<void> {
    // FastMCP handles token expiry internally via delete() calls.
  }
}

function encodeKey(key: string): string {
  return key.replace(/\//g, '__');
}
