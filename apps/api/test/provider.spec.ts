import { describe, it, expect } from 'vitest';
import { ApiError as GeminiApiError } from '@google/genai';
import {
  GeminiIntentProvider,
  MockIntentProvider,
  NullIntentProvider,
  describeProviderError,
} from '../src/nlp/provider.js';

/**
 * Provider identity and error classification.
 *
 * These are the parts of provider.ts that are pure enough to test without a
 * network call: which name/availability each provider reports, and how a
 * thrown SDK error maps onto a retryable/permanent decision. The actual
 * `parse()` network call is exercised indirectly through api.spec.ts via
 * MockIntentProvider, and manually against the real API (see README).
 */

describe('provider identity', () => {
  it('Gemini reports its model in its name', () => {
    const provider = new GeminiIntentProvider('fake-key', 'gemini-2.5-flash-lite');
    expect(provider.name).toBe('gemini:gemini-2.5-flash-lite');
    expect(provider.available).toBe(true);
  });

  it('the null provider is honest about being unavailable', () => {
    const provider = new NullIntentProvider();
    expect(provider.available).toBe(false);
  });

  it('the mock provider records what it was asked', async () => {
    const provider = new MockIntentProvider();
    await provider.parse('add milk', 'en-US');
    expect(provider.calls).toEqual([{ utterance: 'add milk', language: 'en-US' }]);
  });
});

describe('describeProviderError - Gemini', () => {
  it('classifies an auth failure as permanent', () => {
    const error = new GeminiApiError({ status: 401, message: 'bad key' });
    const result = describeProviderError(error);
    expect(result.retryable).toBe(false);
    expect(result.message).toMatch(/invalid Gemini API key/);
  });

  it('classifies a 404 as permanent and names the model', () => {
    const error = new GeminiApiError({ status: 404, message: 'not found' });
    const result = describeProviderError(error);
    expect(result.retryable).toBe(false);
    expect(result.message).toMatch(/model not found/);
  });

  it('classifies a rate limit as retryable', () => {
    const error = new GeminiApiError({ status: 429, message: 'slow down' });
    expect(describeProviderError(error).retryable).toBe(true);
  });

  it('classifies a 500 as retryable', () => {
    const error = new GeminiApiError({ status: 500, message: 'oops' });
    expect(describeProviderError(error).retryable).toBe(true);
  });

  it('classifies a 400 as permanent', () => {
    const error = new GeminiApiError({ status: 400, message: 'bad request' });
    expect(describeProviderError(error).retryable).toBe(false);
  });
});

describe('describeProviderError - anything else', () => {
  it('falls back to the error message for a plain Error', () => {
    const result = describeProviderError(new Error('socket hang up'));
    expect(result.message).toBe('socket hang up');
    expect(result.retryable).toBe(false);
  });

  it('never throws on a non-Error value', () => {
    expect(() => describeProviderError('a plain string')).not.toThrow();
    expect(() => describeProviderError(undefined)).not.toThrow();
  });
});
