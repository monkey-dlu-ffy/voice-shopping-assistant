import mongoose, { Schema, type Model } from 'mongoose';
import type { ShoppingItem } from '@vsa/shared';
import type { PurchaseRecord, Repository } from './repository.js';

interface ListDoc {
  sessionId: string;
  items: ShoppingItem[];
  updatedAt: Date;
}

interface PurchaseDoc {
  sessionId: string;
  canonical: string;
  quantity: number;
  purchasedAt: Date;
}

const itemSchema = new Schema<ShoppingItem>(
  {
    id: { type: String, required: true },
    canonical: { type: String, required: true },
    raw: { type: String, required: true },
    quantity: { type: Number, required: true, default: 1 },
    unit: { type: String, default: null },
    category: { type: String, required: true },
    done: { type: Boolean, required: true, default: false },
    addedAt: { type: String, required: true },
  },
  { _id: false },
);

const listSchema = new Schema<ListDoc>({
  sessionId: { type: String, required: true, unique: true, index: true },
  items: { type: [itemSchema], default: [] },
  updatedAt: { type: Date, default: () => new Date() },
});

const purchaseSchema = new Schema<PurchaseDoc>({
  sessionId: { type: String, required: true, index: true },
  canonical: { type: String, required: true },
  quantity: { type: Number, required: true, default: 1 },
  purchasedAt: { type: Date, required: true },
});

// Replenishment always reads a session's history newest-first.
purchaseSchema.index({ sessionId: 1, purchasedAt: -1 });

/** MongoDB-backed storage. Used whenever MONGODB_URI is configured. */
export class MongoRepository implements Repository {
  readonly kind = 'mongodb' as const;
  readonly durable = true;

  private constructor(
    private readonly lists: Model<ListDoc>,
    private readonly purchases: Model<PurchaseDoc>,
  ) {}

  /**
   * Connect and build the repository.
   *
   * Throws if the connection fails; `createRepository` catches that and falls
   * back to memory rather than taking the whole process down.
   */
  static async connect(uri: string): Promise<MongoRepository> {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const lists = (mongoose.models.List as Model<ListDoc>) ?? mongoose.model<ListDoc>('List', listSchema);
    const purchases =
      (mongoose.models.Purchase as Model<PurchaseDoc>) ??
      mongoose.model<PurchaseDoc>('Purchase', purchaseSchema);
    return new MongoRepository(lists, purchases);
  }

  async getList(sessionId: string): Promise<ShoppingItem[]> {
    const doc = await this.lists.findOne({ sessionId }).lean().exec();
    return (doc?.items ?? []) as ShoppingItem[];
  }

  async saveList(sessionId: string, items: ShoppingItem[]): Promise<void> {
    await this.lists
      .updateOne(
        { sessionId },
        { $set: { items, updatedAt: new Date() } },
        { upsert: true },
      )
      .exec();
  }

  async recordPurchases(sessionId: string, records: PurchaseRecord[]): Promise<void> {
    if (records.length === 0) return;
    await this.purchases.insertMany(records.map((r) => ({ ...r, sessionId })));
  }

  async getPurchases(sessionId: string): Promise<PurchaseRecord[]> {
    const docs = await this.purchases
      .find({ sessionId })
      .sort({ purchasedAt: -1 })
      .limit(2000)
      .lean()
      .exec();
    return docs.map((d) => ({
      canonical: d.canonical,
      quantity: d.quantity,
      purchasedAt: new Date(d.purchasedAt),
    }));
  }

  async replacePurchases(sessionId: string, records: PurchaseRecord[]): Promise<void> {
    await this.purchases.deleteMany({ sessionId }).exec();
    await this.recordPurchases(sessionId, records);
  }

  async close(): Promise<void> {
    await mongoose.disconnect();
  }
}
