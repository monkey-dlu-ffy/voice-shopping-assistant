import type { ShoppingItem } from '@vsa/shared';
import type { PurchaseRecord, Repository } from './repository.js';

/**
 * In-process storage.
 *
 * Used for tests and whenever MONGODB_URI is unset, so `npm start` and
 * `docker run` both work with zero external services. Data is per-instance and
 * lost on restart, which `/api/health` reports honestly.
 */
export class MemoryRepository implements Repository {
  readonly kind = 'memory' as const;
  readonly durable = false;

  private lists = new Map<string, ShoppingItem[]>();
  private purchases = new Map<string, PurchaseRecord[]>();

  async getList(sessionId: string): Promise<ShoppingItem[]> {
    return structuredClone(this.lists.get(sessionId) ?? []);
  }

  async saveList(sessionId: string, items: ShoppingItem[]): Promise<void> {
    this.lists.set(sessionId, structuredClone(items));
  }

  async recordPurchases(sessionId: string, records: PurchaseRecord[]): Promise<void> {
    const existing = this.purchases.get(sessionId) ?? [];
    this.purchases.set(sessionId, [...existing, ...structuredClone(records)]);
  }

  async getPurchases(sessionId: string): Promise<PurchaseRecord[]> {
    return structuredClone(this.purchases.get(sessionId) ?? []);
  }

  async replacePurchases(sessionId: string, records: PurchaseRecord[]): Promise<void> {
    this.purchases.set(sessionId, structuredClone(records));
  }

  async close(): Promise<void> {
    this.lists.clear();
    this.purchases.clear();
  }
}
