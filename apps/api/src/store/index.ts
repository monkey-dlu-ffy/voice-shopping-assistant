import { config } from '../config.js';
import type { Repository } from './repository.js';
import { MemoryRepository } from './memory.js';
import { MongoRepository } from './mongo.js';

export type { PurchaseRecord, Repository } from './repository.js';
export { pushUndo, popUndo, clearUndo } from './repository.js';
export { MemoryRepository } from './memory.js';

/**
 * Build the repository for this process.
 *
 * A configured-but-unreachable database is a deployment problem, not a reason to
 * refuse to serve: the app logs loudly, falls back to memory, and reports the
 * degraded state at `/api/health`.
 */
export async function createRepository(): Promise<Repository> {
  if (!config.mongoUri) {
    console.warn(
      '[store] MONGODB_URI is not set - using in-memory storage. ' +
        'Lists will not survive a restart.',
    );
    return new MemoryRepository();
  }

  try {
    const repo = await MongoRepository.connect(config.mongoUri);
    console.log('[store] connected to MongoDB');
    return repo;
  } catch (error) {
    console.error(
      '[store] MongoDB connection failed, falling back to in-memory storage:',
      error instanceof Error ? error.message : error,
    );
    return new MemoryRepository();
  }
}
