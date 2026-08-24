import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  CATEGORIES,
  SUPPORTED_LANGUAGES,
  parseWithRules,
  searchCatalog,
  type Category,
} from '@vsa/shared';
import { config } from '../config.js';
import { execute } from '../executor.js';
import { interpret, parseCacheStats } from '../nlp/interpret.js';
import type { IntentProvider } from '../nlp/provider.js';
import { buildSuggestions } from '../suggestions/engine.js';
import { clearUndo, type Repository } from '../store/index.js';
import { buildDemoHistory } from './demo.js';

const SESSION_COOKIE = 'vsa_session';

/**
 * Anonymous sessions.
 *
 * No sign-up, no login: a reviewer opening the hosted URL gets a working list
 * immediately. The cookie is the only identity in the system.
 */
function sessionIdFor(req: Request, res: Response): string {
  const existing = req.cookies?.[SESSION_COOKIE];
  if (typeof existing === 'string' && existing.length > 0) return existing;

  const fresh = randomUUID();
  res.cookie(SESSION_COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: 365 * 24 * 60 * 60 * 1000,
  });
  return fresh;
}

const commandBody = z.object({
  utterance: z.string().min(1, 'utterance is required').max(500),
  language: z.string().max(20).optional(),
});

const searchQuery = z.object({
  q: z.string().max(200).optional(),
  maxPrice: z.coerce.number().positive().optional(),
  minPrice: z.coerce.number().positive().optional(),
  brand: z.string().max(80).optional(),
  category: z.enum(CATEGORIES).optional(),
});

export interface ApiDeps {
  repo: Repository;
  provider: IntentProvider;
}

/** Wrap an async handler so rejections reach the error middleware. */
function handle(fn: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: (err?: unknown) => void) => {
    fn(req, res).catch(next);
  };
}

export function createApiRouter({ repo, provider }: ApiDeps): Router {
  const router = Router();

  router.get(
    '/health',
    handle(async (_req, res) => {
      // Reports which degraded modes are active rather than hiding them.
      res.json({
        status: 'ok',
        storage: { kind: repo.kind, durable: repo.durable },
        nlp: {
          rules: 'always on',
          fallback: provider.available ? provider.name : 'disabled (no API key)',
          cache: {
            size: parseCacheStats.size,
            hits: parseCacheStats.hits,
            misses: parseCacheStats.misses,
            llmCalls: parseCacheStats.llmCalls,
            llmFailures: parseCacheStats.llmFailures,
          },
        },
        languages: SUPPORTED_LANGUAGES,
      });
    }),
  );

  router.get(
    '/list',
    handle(async (req, res) => {
      const sessionId = sessionIdFor(req, res);
      res.json({ list: await repo.getList(sessionId) });
    }),
  );

  /**
   * The single entry point for every voice command.
   *
   * Parse (rules, then cache, then LLM) and execute in one round trip, so the
   * client makes one request per utterance.
   */
  router.post(
    '/command',
    handle(async (req, res) => {
      const parsed = commandBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
        return;
      }

      const sessionId = sessionIdFor(req, res);
      const language = parsed.data.language ?? 'en-US';

      const intent = await interpret({ utterance: parsed.data.utterance, language, provider });
      const result = await execute({ intent, sessionId, repo });
      res.json(result);
    }),
  );

  /**
   * Parse without executing.
   * Used by the client to show a live interpretation while the user is still
   * speaking, and useful on its own for inspecting the parser.
   */
  router.post(
    '/interpret',
    handle(async (req, res) => {
      const parsed = commandBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid request' });
        return;
      }
      const language = parsed.data.language ?? 'en-US';
      const useRulesOnly = req.query.rulesOnly === 'true';

      const intent = useRulesOnly
        ? parseWithRules(parsed.data.utterance, language)
        : await interpret({ utterance: parsed.data.utterance, language, provider });

      res.json({ intent });
    }),
  );

  router.get(
    '/suggestions',
    handle(async (req, res) => {
      const sessionId = sessionIdFor(req, res);
      const language = typeof req.query.language === 'string' ? req.query.language : 'en-US';
      const [list, purchases] = await Promise.all([
        repo.getList(sessionId),
        repo.getPurchases(sessionId),
      ]);

      res.json({
        suggestions: buildSuggestions({ list, purchases, language }),
        historySize: purchases.length,
      });
    }),
  );

  router.get(
    '/search',
    handle(async (req, res) => {
      const parsed = searchQuery.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: parsed.error.issues[0]?.message ?? 'invalid query' });
        return;
      }
      const { q, maxPrice, minPrice, brand, category } = parsed.data;
      res.json({
        results: searchCatalog({
          text: q,
          maxPrice,
          minPrice,
          brand,
          category: category as Category | undefined,
          limit: 12,
        }),
      });
    }),
  );

  /** Load synthetic history so recommendations are visible on a cold open. */
  router.post(
    '/demo/seed',
    handle(async (req, res) => {
      const sessionId = sessionIdFor(req, res);
      const history = buildDemoHistory();
      await repo.replacePurchases(sessionId, history);
      const list = await repo.getList(sessionId);

      res.json({
        seeded: history.length,
        suggestions: buildSuggestions({ list, purchases: history }),
      });
    }),
  );

  router.post(
    '/demo/reset',
    handle(async (req, res) => {
      const sessionId = sessionIdFor(req, res);
      await Promise.all([repo.replacePurchases(sessionId, []), repo.saveList(sessionId, [])]);
      clearUndo(sessionId);
      res.json({ ok: true });
    }),
  );

  return router;
}
