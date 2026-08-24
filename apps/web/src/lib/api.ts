import type {
  CatalogEntry,
  CommandResult,
  Intent,
  ShoppingItem,
  Suggestion,
} from '@vsa/shared';

/**
 * API client.
 *
 * Same origin in production (Express serves the built app), proxied by Vite in
 * development. Every call sends credentials so the anonymous session cookie
 * follows the user.
 */

const BASE = '/api';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      ...init,
    });
  } catch {
    // Distinguish "server said no" from "could not reach the server" so the UI
    // can offer the right advice.
    throw new ApiError('offline', 0);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new ApiError(body?.error ?? `request failed (${response.status})`, response.status);
  }
  return (await response.json()) as T;
}

export interface HealthResponse {
  status: string;
  storage: { kind: string; durable: boolean };
  nlp: {
    rules: string;
    fallback: string;
    cache: { size: number; hits: number; misses: number; llmCalls: number; llmFailures: number };
  };
  languages: { code: string; label: string; speechTag: string }[];
}

export const api = {
  health: () => request<HealthResponse>('/health'),

  getList: () => request<{ list: ShoppingItem[] }>('/list'),

  command: (utterance: string, language: string) =>
    request<CommandResult>('/command', {
      method: 'POST',
      body: JSON.stringify({ utterance, language }),
    }),

  interpret: (utterance: string, language: string) =>
    request<{ intent: Intent }>('/interpret', {
      method: 'POST',
      body: JSON.stringify({ utterance, language }),
    }),

  suggestions: (language: string) =>
    request<{ suggestions: Suggestion[]; historySize: number }>(
      `/suggestions?language=${encodeURIComponent(language)}`,
    ),

  search: (params: { q?: string; maxPrice?: number }) => {
    const query = new URLSearchParams();
    if (params.q) query.set('q', params.q);
    if (params.maxPrice !== undefined) query.set('maxPrice', String(params.maxPrice));
    return request<{ results: CatalogEntry[] }>(`/search?${query.toString()}`);
  },

  seedDemo: () =>
    request<{ seeded: number; suggestions: Suggestion[] }>('/demo/seed', { method: 'POST' }),

  resetDemo: () => request<{ ok: boolean }>('/demo/reset', { method: 'POST' }),
};
