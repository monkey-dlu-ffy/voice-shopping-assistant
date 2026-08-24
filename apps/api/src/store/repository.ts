import type { ShoppingItem } from '@vsa/shared';

/** One recorded purchase, the raw material for replenishment predictions. */
export interface PurchaseRecord {
  canonical: string;
  quantity: number;
  purchasedAt: Date;
}

/**
 * Storage contract.
 *
 * Two implementations exist: MongoDB for real deployments and an in-process map
 * for local runs, tests, and any environment where no database is configured.
 * The app therefore never hard-fails on a missing database - it degrades to
 * per-instance memory and says so at `/api/health`.
 */
export interface Repository {
  /** Human-readable backend name, surfaced in the health endpoint. */
  readonly kind: 'mongodb' | 'memory';
  /** False when data is lost on restart. */
  readonly durable: boolean;

  getList(sessionId: string): Promise<ShoppingItem[]>;
  saveList(sessionId: string, items: ShoppingItem[]): Promise<void>;

  recordPurchases(sessionId: string, records: PurchaseRecord[]): Promise<void>;
  getPurchases(sessionId: string): Promise<PurchaseRecord[]>;
  replacePurchases(sessionId: string, records: PurchaseRecord[]): Promise<void>;

  close(): Promise<void>;
}

/**
 * Undo history.
 *
 * Deliberately in-process and capped: undo is a within-session convenience, not
 * durable state, and keeping it out of the database avoids writing a snapshot on
 * every single voice command.
 */
const UNDO_DEPTH = 20;
const undoStacks = new Map<string, ShoppingItem[][]>();

export function pushUndo(sessionId: string, snapshot: ShoppingItem[]): void {
  const stack = undoStacks.get(sessionId) ?? [];
  stack.push(structuredClone(snapshot));
  if (stack.length > UNDO_DEPTH) stack.shift();
  undoStacks.set(sessionId, stack);
}

export function popUndo(sessionId: string): ShoppingItem[] | null {
  const stack = undoStacks.get(sessionId);
  if (!stack || stack.length === 0) return null;
  return stack.pop() ?? null;
}

export function clearUndo(sessionId: string): void {
  undoStacks.delete(sessionId);
}
