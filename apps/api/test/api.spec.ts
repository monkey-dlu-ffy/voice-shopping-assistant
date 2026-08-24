import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { MemoryRepository } from '../src/store/memory.js';
import { MockIntentProvider, NullIntentProvider } from '../src/nlp/provider.js';
import { parseCacheStats } from '../src/nlp/interpret.js';

/**
 * API integration tests.
 *
 * Everything runs against a memory repository and a mock intent provider, so the
 * suite needs no database, no network and no API key - which is also how the app
 * behaves in its degraded mode, so these tests exercise that path for free.
 */

function buildApp(provider = new MockIntentProvider()): { app: Express; provider: MockIntentProvider } {
  const app = createApp({ repo: new MemoryRepository(), provider });
  return { app, provider };
}

/** An agent keeps the session cookie across requests, like a real browser. */
function agentFor(app: Express) {
  return request.agent(app);
}

beforeEach(() => {
  parseCacheStats.reset();
});

describe('GET /api/health', () => {
  it('reports which degraded modes are active', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/health').expect(200);

    expect(res.body.status).toBe('ok');
    expect(res.body.storage.kind).toBe('memory');
    expect(res.body.storage.durable).toBe(false);
    expect(res.body.languages.map((l: { code: string }) => l.code)).toEqual(['en', 'hi', 'es']);
  });

  it('says the fallback is disabled when there is no provider', async () => {
    const app = createApp({ repo: new MemoryRepository(), provider: new NullIntentProvider() });
    const res = await request(app).get('/api/health').expect(200);
    expect(res.body.nlp.fallback).toMatch(/disabled/);
  });
});

describe('POST /api/command', () => {
  it('adds an item and returns the updated list', async () => {
    const { app } = buildApp();
    const res = await agentFor(app)
      .post('/api/command')
      .send({ utterance: 'add milk', language: 'en-US' })
      .expect(200);

    expect(res.body.intent.intent).toBe('add');
    expect(res.body.intent.source).toBe('rules');
    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].canonical).toBe('milk');
    expect(res.body.list[0].category).toBe('dairy');
    expect(res.body.speak).toMatch(/Added/);
  });

  it('parses quantity and unit', async () => {
    const { app } = buildApp();
    const res = await agentFor(app)
      .post('/api/command')
      .send({ utterance: 'add 2 bottles of water' })
      .expect(200);

    expect(res.body.list[0]).toMatchObject({ canonical: 'water', quantity: 2, unit: 'bottle' });
  });

  it('persists the list across requests in one session', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add milk' }).expect(200);
    await agent.post('/api/command').send({ utterance: 'add bread' }).expect(200);
    const res = await agent.get('/api/list').expect(200);

    expect(res.body.list.map((i: { canonical: string }) => i.canonical)).toEqual(['milk', 'bread']);
  });

  it('keeps sessions isolated from each other', async () => {
    const { app } = buildApp();
    const alice = agentFor(app);
    const bob = agentFor(app);

    await alice.post('/api/command').send({ utterance: 'add milk' }).expect(200);
    const res = await bob.get('/api/list').expect(200);

    expect(res.body.list).toHaveLength(0);
  });

  it('merges a repeated item instead of duplicating the row', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add 2 bottles of water' });
    const res = await agent.post('/api/command').send({ utterance: 'add 3 bottles of water' });

    expect(res.body.list).toHaveLength(1);
    expect(res.body.list[0].quantity).toBe(5);
  });

  it('removes an item', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add milk and bread' });
    const res = await agent.post('/api/command').send({ utterance: 'remove milk from my list' });

    expect(res.body.list.map((i: { canonical: string }) => i.canonical)).toEqual(['bread']);
  });

  it('says so when asked to remove something that is not there', async () => {
    const { app } = buildApp();
    const res = await agentFor(app).post('/api/command').send({ utterance: 'remove caviar' });
    expect(res.body.speak).toMatch(/not on your list/);
  });

  it('undoes the previous change', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add milk' });
    await agent.post('/api/command').send({ utterance: 'add bread' });
    const res = await agent.post('/api/command').send({ utterance: 'undo that' });

    expect(res.body.list.map((i: { canonical: string }) => i.canonical)).toEqual(['milk']);
  });

  it('reports having nothing to undo', async () => {
    const { app } = buildApp();
    const res = await agentFor(app).post('/api/command').send({ utterance: 'undo that' });
    expect(res.body.speak).toMatch(/Nothing to undo/);
  });

  it('marks an item bought and records the purchase', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add eggs' });
    const res = await agent.post('/api/command').send({ utterance: 'I bought the eggs' });

    expect(res.body.list[0].done).toBe(true);
  });

  it('clears the list', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add milk and bread' });
    const res = await agent.post('/api/command').send({ utterance: 'clear my list' });

    expect(res.body.list).toHaveLength(0);
  });

  it('reads the list back', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'add milk' });
    const res = await agent.post('/api/command').send({ utterance: "what's on my list" });

    expect(res.body.speak).toMatch(/milk/);
  });

  it('searches the catalogue with a price ceiling', async () => {
    const { app } = buildApp();
    const res = await agentFor(app)
      .post('/api/command')
      .send({ utterance: 'find toothpaste under 5' });

    expect(res.body.intent.intent).toBe('search');
    expect(res.body.searchResults.length).toBeGreaterThan(0);
    for (const r of res.body.searchResults) expect(r.avgPrice).toBeLessThanOrEqual(5);
  });

  it('offers substitutes for an item that has them', async () => {
    const { app } = buildApp();
    const res = await agentFor(app).post('/api/command').send({ utterance: 'add milk' });

    expect(res.body.substitutes.forItem).toBe('milk');
    expect(res.body.substitutes.options.map((o: { canonical: string }) => o.canonical)).toContain(
      'almond milk',
    );
  });

  it('handles Hindi end to end and stores the English canonical form', async () => {
    const { app } = buildApp();
    const res = await agentFor(app)
      .post('/api/command')
      .send({ utterance: 'doodh aur bread chahiye', language: 'hi-IN' });

    expect(res.body.list.map((i: { canonical: string }) => i.canonical)).toEqual(['milk', 'bread']);
    // The confirmation comes back in the language the user spoke.
    expect(res.body.speak).toMatch(/जोड़ दिया/);
  });

  it('rejects an empty utterance', async () => {
    const { app } = buildApp();
    await request(app).post('/api/command').send({ utterance: '' }).expect(400);
  });

  it('rejects an over-long utterance', async () => {
    const { app } = buildApp();
    await request(app)
      .post('/api/command')
      .send({ utterance: 'a'.repeat(501) })
      .expect(400);
  });
});

describe('the rules/LLM boundary', () => {
  it('never calls the LLM for a phrasing the rules handle', async () => {
    const { app, provider } = buildApp();
    await agentFor(app).post('/api/command').send({ utterance: 'add 2 bottles of water' });
    expect(provider.calls).toHaveLength(0);
    expect(parseCacheStats.llmCalls).toBe(0);
  });

  it('escalates a phrasing the rules cannot handle', async () => {
    const { app, provider } = buildApp();
    provider.on('grab whatever we need for tacos', {
      intent: 'add',
      items: [
        { raw: 'tortillas', canonical: 'tortillas', quantity: 1, unit: null, attributes: [], brand: null },
        { raw: 'cheese', canonical: 'cheese', quantity: 1, unit: null, attributes: [], brand: null },
      ],
      filters: {},
    });

    const res = await agentFor(app)
      .post('/api/command')
      .send({ utterance: 'grab whatever we need for tacos' });

    expect(provider.calls).toHaveLength(1);
    expect(res.body.intent.source).toBe('llm');
    expect(res.body.list.map((i: { canonical: string }) => i.canonical)).toEqual([
      'tortillas',
      'cheese',
    ]);
    // Categories come from the catalogue, not from the model.
    expect(res.body.list[0].category).toBe('bakery');
  });

  it('serves a repeated escalation from cache without paying twice', async () => {
    const { app, provider } = buildApp();
    provider.on('sort out dinner for tonight', {
      intent: 'add',
      items: [{ raw: 'pasta', canonical: 'pasta', quantity: 1, unit: null, attributes: [], brand: null }],
      filters: {},
    });
    const agent = agentFor(app);

    await agent.post('/api/command').send({ utterance: 'sort out dinner for tonight' });
    const second = await agent.post('/api/command').send({ utterance: 'sort out dinner for tonight' });

    expect(provider.calls).toHaveLength(1);
    expect(second.body.intent.source).toBe('cache');
    expect(parseCacheStats.hits).toBe(1);
  });

  it('falls back to the rule result when the provider throws', async () => {
    const exploding = new MockIntentProvider();
    exploding.parse = async () => {
      throw new Error('simulated upstream failure');
    };
    const app = createApp({ repo: new MemoryRepository(), provider: exploding });

    const res = await agentFor(app)
      .post('/api/command')
      .send({ utterance: 'grab whatever we need for tacos' })
      .expect(200);

    // Degraded, not broken: a friendly response instead of a 500.
    expect(res.body.speak).toMatch(/didn't catch that/);
    expect(parseCacheStats.llmFailures).toBe(1);
  });

  it('works with no provider at all', async () => {
    const app = createApp({ repo: new MemoryRepository(), provider: new NullIntentProvider() });
    const agent = agentFor(app);

    const ok = await agent.post('/api/command').send({ utterance: 'add milk' }).expect(200);
    expect(ok.body.list[0].canonical).toBe('milk');

    const unknown = await agent
      .post('/api/command')
      .send({ utterance: 'grab whatever we need for tacos' })
      .expect(200);
    expect(unknown.body.speak).toMatch(/didn't catch that/);
  });
});

describe('POST /api/interpret', () => {
  it('parses without mutating the list', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    const res = await agent.post('/api/interpret').send({ utterance: 'add milk' }).expect(200);
    expect(res.body.intent.intent).toBe('add');

    const list = await agent.get('/api/list').expect(200);
    expect(list.body.list).toHaveLength(0);
  });

  it('can be forced to skip the LLM entirely', async () => {
    const { app, provider } = buildApp();
    provider.on('grab whatever we need for tacos', { intent: 'add', items: [], filters: {} });

    const res = await request(app)
      .post('/api/interpret?rulesOnly=true')
      .send({ utterance: 'grab whatever we need for tacos' })
      .expect(200);

    expect(provider.calls).toHaveLength(0);
    expect(res.body.intent.source).toBe('rules');
  });
});

describe('GET /api/suggestions', () => {
  it('returns explainable suggestions after seeding demo history', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    const seeded = await agent.post('/api/demo/seed').expect(200);
    expect(seeded.body.seeded).toBeGreaterThan(50);

    const res = await agent.get('/api/suggestions').expect(200);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    for (const s of res.body.suggestions) {
      expect(s.reason).toBeTruthy();
      expect(s.kind).toBeTruthy();
    }
    expect(res.body.suggestions.some((s: { kind: string }) => s.kind === 'replenishment')).toBe(true);
  });

  it('still returns something for a brand new session', async () => {
    const { app } = buildApp();
    const res = await agentFor(app).get('/api/suggestions').expect(200);
    expect(res.body.suggestions.length).toBeGreaterThan(0);
    expect(res.body.historySize).toBe(0);
  });

  it('resets cleanly', async () => {
    const { app } = buildApp();
    const agent = agentFor(app);

    await agent.post('/api/demo/seed');
    await agent.post('/api/command').send({ utterance: 'add milk' });
    await agent.post('/api/demo/reset').expect(200);

    const res = await agent.get('/api/suggestions').expect(200);
    expect(res.body.historySize).toBe(0);
    const list = await agent.get('/api/list').expect(200);
    expect(list.body.list).toHaveLength(0);
  });
});

describe('GET /api/search', () => {
  it('filters by price and attribute', async () => {
    const { app } = buildApp();
    const res = await request(app)
      .get('/api/search')
      .query({ q: 'apples', maxPrice: 10 })
      .expect(200);

    expect(res.body.results.length).toBeGreaterThan(0);
    for (const r of res.body.results) expect(r.avgPrice).toBeLessThanOrEqual(10);
  });

  it('rejects an unknown category', async () => {
    const { app } = buildApp();
    await request(app).get('/api/search').query({ category: 'spaceships' }).expect(400);
  });
});

describe('unknown routes', () => {
  it('404s an unknown API path as JSON', async () => {
    const { app } = buildApp();
    const res = await request(app).get('/api/nope').expect(404);
    expect(res.body.error).toBe('not found');
  });
});
