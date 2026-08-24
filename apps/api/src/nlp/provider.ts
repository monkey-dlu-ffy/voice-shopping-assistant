import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI, Type as GeminiType, ApiError as GeminiApiError } from '@google/genai';
import { z } from 'zod';
import { CATEGORIES, INTENT_KINDS, type Intent } from '@vsa/shared';
import { config } from '../config.js';

/**
 * The LLM half of the hybrid parser.
 *
 * Only reached when the rule parser is not confident, so the vast majority of
 * commands never touch this path. Four implementations exist behind one
 * interface: Gemini and Claude for production (Gemini preferred - it is the
 * genuinely free option, no billing account required), a mock for tests, and a
 * null object for when neither key is configured - which is what lets the app
 * run fully offline. createIntentProvider() at the bottom of this file is the
 * only place that chooses between them.
 */
export interface IntentProvider {
  readonly name: string;
  /** False for the null provider, so callers can skip the round trip entirely. */
  readonly available: boolean;
  parse(utterance: string, language: string): Promise<ParsedIntentPayload | null>;
}

/** What the model returns. Converted into a full `Intent` by `interpret()`. */
export interface ParsedIntentPayload {
  intent: Intent['intent'];
  items: {
    raw: string;
    canonical: string;
    quantity: number | null;
    unit: string | null;
    attributes: string[];
    brand: string | null;
  }[];
  filters: {
    maxPrice?: number;
    minPrice?: number;
    brand?: string;
    attributes?: string[];
  };
}

/**
 * Runtime validation of the model's output.
 *
 * The tool schema is declared `strict`, so the API already guarantees the shape.
 * This is defence in depth: a schema change, a model swap or a partial response
 * fails here as a clean rejection rather than as a corrupt shopping list.
 */
/** `null` -> `undefined` so a model that sends null for an unset optional field still validates. */
const optionalNumber = z
  .number()
  .nullable()
  .optional()
  .transform((v) => v ?? undefined);
const optionalString = z
  .string()
  .nullable()
  .optional()
  .transform((v) => v ?? undefined);

const payloadSchema = z.object({
  intent: z.enum(INTENT_KINDS),
  items: z
    .array(
      z.object({
        raw: z.string(),
        canonical: z.string(),
        quantity: z.number().nullable(),
        unit: z.string().nullable(),
        attributes: z.array(z.string()),
        brand: z.string().nullable(),
      }),
    )
    .default([]),
  filters: z
    .object({
      maxPrice: optionalNumber,
      minPrice: optionalNumber,
      brand: optionalString,
      attributes: z.array(z.string()).optional(),
    })
    .default({}),
});

const TOOL_NAME = 'record_shopping_intent';

/** JSON Schema for the tool. `strict` requires `additionalProperties: false` plus `required`. */
const toolInputSchema = {
  type: 'object' as const,
  properties: {
    intent: {
      type: 'string',
      enum: [...INTENT_KINDS],
      description: 'What the user wants to do.',
    },
    items: {
      type: 'array',
      description: 'Items the command refers to. Empty for list-level commands.',
      items: {
        type: 'object',
        properties: {
          raw: { type: 'string', description: 'The item exactly as the user said it.' },
          canonical: {
            type: 'string',
            description:
              'The item normalised to a lowercase singular-or-plural English grocery name, ' +
              'e.g. "milk", "chicken breast", "toilet paper". Translate from the spoken language.',
          },
          quantity: { type: ['number', 'null'], description: 'Count, or null if unstated.' },
          unit: {
            type: ['string', 'null'],
            description: 'Unit such as bottle, kg, g, litre, dozen, pack. Null if unstated.',
          },
          attributes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Modifiers such as organic, low-fat, gluten-free.',
          },
          brand: { type: ['string', 'null'], description: 'Brand name, or null.' },
        },
        required: ['raw', 'canonical', 'quantity', 'unit', 'attributes', 'brand'],
        additionalProperties: false,
      },
    },
    filters: {
      type: 'object',
      description: 'Search constraints. Only meaningful for the search intent.',
      properties: {
        maxPrice: { type: 'number' },
        minPrice: { type: 'number' },
        brand: { type: 'string' },
        attributes: { type: 'array', items: { type: 'string' } },
      },
      required: [],
      additionalProperties: false,
    },
  },
  required: ['intent', 'items', 'filters'],
  additionalProperties: false,
};

/** The instructions both providers share; each appends its own closing line. */
const PROMPT_RULES = [
  'You convert a single spoken shopping-list command into structured data.',
  '',
  'Rules:',
  `- Choose exactly one intent from: ${INTENT_KINDS.join(', ')}.`,
  '- Use "unknown" when the utterance is not a shopping command at all. Do not guess.',
  '- Always translate item names into English for the `canonical` field, and keep the',
  '  user\'s original wording in `raw`. The list is stored in English so that',
  '  categorisation and history work across languages.',
  `- Categories available downstream: ${CATEGORIES.join(', ')}.`,
  '- When the user names a meal or occasion rather than products ("something for tacos"),',
  '  expand it into the specific grocery items a shopper would buy.',
  '- Only populate `filters` for search commands.',
].join('\n');

const SYSTEM_PROMPT = `${PROMPT_RULES}\n\nAlways respond by calling the ${TOOL_NAME} tool.`;

/**
 * The same schema, expressed in Gemini's dialect.
 *
 * Gemini's structured-output schema is a restricted OpenAPI subset: types come
 * from the `Type` enum rather than JSON Schema strings, and "nullable" is its
 * own boolean rather than a `type: [x, "null"]` union - JSON Schema unions are
 * not supported here, so each nullable field keeps one `type` and adds
 * `nullable: true` alongside it.
 */
const geminiResponseSchema = {
  type: GeminiType.OBJECT,
  properties: {
    intent: {
      type: GeminiType.STRING,
      enum: [...INTENT_KINDS],
      description: 'What the user wants to do.',
    },
    items: {
      type: GeminiType.ARRAY,
      description: 'Items the command refers to. Empty for list-level commands.',
      items: {
        type: GeminiType.OBJECT,
        properties: {
          raw: { type: GeminiType.STRING, description: 'The item exactly as the user said it.' },
          canonical: {
            type: GeminiType.STRING,
            description:
              'The item normalised to a lowercase singular-or-plural English grocery name, ' +
              'e.g. "milk", "chicken breast", "toilet paper". Translate from the spoken language.',
          },
          quantity: {
            type: GeminiType.NUMBER,
            nullable: true,
            description: 'Count, or null if unstated.',
          },
          unit: {
            type: GeminiType.STRING,
            nullable: true,
            description: 'Unit such as bottle, kg, g, litre, dozen, pack. Null if unstated.',
          },
          attributes: {
            type: GeminiType.ARRAY,
            items: { type: GeminiType.STRING },
            description: 'Modifiers such as organic, low-fat, gluten-free.',
          },
          brand: { type: GeminiType.STRING, nullable: true, description: 'Brand name, or null.' },
        },
        required: ['raw', 'canonical', 'quantity', 'unit', 'attributes', 'brand'],
      },
    },
    filters: {
      type: GeminiType.OBJECT,
      description:
        'Search constraints. Only meaningful for the search intent. Omit any field that ' +
        'does not apply - do not include it as null.',
      properties: {
        maxPrice: { type: GeminiType.NUMBER },
        minPrice: { type: GeminiType.NUMBER },
        brand: { type: GeminiType.STRING },
        attributes: { type: GeminiType.ARRAY, items: { type: GeminiType.STRING } },
      },
    },
  },
  required: ['intent', 'items', 'filters'],
};

/** Production provider: Claude via the Anthropic SDK. */
export class ClaudeIntentProvider implements IntentProvider {
  readonly name: string;
  readonly available = true;
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model = config.anthropicModel) {
    this.client = new Anthropic({ apiKey });
    this.name = `claude:${model}`;
  }

  async parse(utterance: string, language: string): Promise<ParsedIntentPayload | null> {
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description: 'Record the structured interpretation of the shopping command.',
          input_schema: toolInputSchema as Anthropic.Tool['input_schema'],
          strict: true,
        } as Anthropic.Tool,
      ],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: `Spoken language: ${language}\nUtterance: ${utterance}`,
        },
      ],
    });

    const block = response.content.find((c) => c.type === 'tool_use');
    if (!block || block.type !== 'tool_use') return null;

    // Tool inputs are parsed objects, never string-matched - escaping differs
    // between models and raw matching silently breaks.
    const validated = payloadSchema.safeParse(block.input);
    if (!validated.success) {
      console.warn('[nlp] model returned an unexpected shape:', validated.error.message);
      return null;
    }
    return validated.data;
  }
}

/**
 * Free-tier provider: Gemini Flash via Google AI Studio.
 *
 * The preferred default - no billing account required to get a key, unlike
 * Anthropic or Google Cloud. `responseSchema` plays the same role Claude's
 * strict tool use does: the API is constrained to return exactly this shape,
 * and `payloadSchema.safeParse` below is still the defence-in-depth layer for
 * a schema change, a model swap, or a model that doesn't fully honour it.
 */
export class GeminiIntentProvider implements IntentProvider {
  readonly name: string;
  readonly available = true;
  private readonly client: GoogleGenAI;

  constructor(apiKey: string, private readonly model = config.geminiModel) {
    this.client = new GoogleGenAI({ apiKey });
    this.name = `gemini:${model}`;
  }

  async parse(utterance: string, language: string): Promise<ParsedIntentPayload | null> {
    const response = await this.client.models.generateContent({
      model: this.model,
      contents: [
        { role: 'user', parts: [{ text: `Spoken language: ${language}\nUtterance: ${utterance}` }] },
      ],
      config: {
        systemInstruction: `${PROMPT_RULES}\n\nRespond with only the JSON object - no other text.`,
        responseMimeType: 'application/json',
        responseSchema: geminiResponseSchema,
        // Deterministic parsing, not creative writing.
        temperature: 0,
      },
    });

    const text = response.text;
    if (!text) return null;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.warn('[nlp] Gemini response was not valid JSON:', (error as Error).message);
      return null;
    }

    const validated = payloadSchema.safeParse(parsed);
    if (!validated.success) {
      console.warn('[nlp] model returned an unexpected shape:', validated.error.message);
      return null;
    }
    return validated.data;
  }
}

/** Deterministic provider for tests: no network, scripted responses. */
export class MockIntentProvider implements IntentProvider {
  readonly name = 'mock';
  readonly available = true;
  /** Utterances seen, so tests can assert the rules did not escalate needlessly. */
  readonly calls: { utterance: string; language: string }[] = [];

  constructor(private readonly responses: Map<string, ParsedIntentPayload> = new Map()) {}

  on(utterance: string, payload: ParsedIntentPayload): this {
    this.responses.set(utterance.toLowerCase().trim(), payload);
    return this;
  }

  async parse(utterance: string, language: string): Promise<ParsedIntentPayload | null> {
    this.calls.push({ utterance, language });
    return this.responses.get(utterance.toLowerCase().trim()) ?? null;
  }
}

/**
 * Null object used when no API key is configured.
 *
 * The app stays fully usable: the rule parser handles everything it recognises
 * and anything else gets an honest "I didn't catch that" instead of an error.
 */
export class NullIntentProvider implements IntentProvider {
  readonly name = 'disabled';
  readonly available = false;

  async parse(): Promise<null> {
    return null;
  }
}

/**
 * Choose a provider. Gemini first - it needs no billing account to obtain a
 * key, which is what makes it the honest default for a project meant to run
 * on a free tier. The Anthropic key stays supported for anyone who does have
 * Claude billing configured, and both can be set at once without conflict.
 */
export function createIntentProvider(): IntentProvider {
  if (config.geminiApiKey) {
    return new GeminiIntentProvider(config.geminiApiKey);
  }
  if (config.anthropicApiKey) {
    return new ClaudeIntentProvider(config.anthropicApiKey);
  }
  console.warn(
    '[nlp] Neither GEMINI_API_KEY nor ANTHROPIC_API_KEY is set - running rules-only. ' +
      'Unrecognised phrasings will ask the user to rephrase.',
  );
  return new NullIntentProvider();
}

/**
 * Map a provider failure onto a decision: retryable or not.
 * Most-specific-first for each SDK's own error hierarchy, so a 404 is never
 * mistaken for a rate limit; a final generic branch covers whichever provider
 * is not the one actually in use.
 */
export function describeProviderError(error: unknown): { message: string; retryable: boolean } {
  if (error instanceof Anthropic.NotFoundError) {
    return { message: `model not found: ${config.anthropicModel}`, retryable: false };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return { message: 'invalid Anthropic API key', retryable: false };
  }
  if (error instanceof Anthropic.RateLimitError) {
    return { message: 'rate limited', retryable: true };
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return { message: 'network error reaching Anthropic', retryable: true };
  }
  // Base class last: it is the parent of every Anthropic case above.
  if (error instanceof Anthropic.APIError) {
    const status = error.status ?? 0;
    return { message: `API error ${status || 'unknown'}`, retryable: status >= 500 };
  }

  if (error instanceof GeminiApiError) {
    const status = error.status ?? 0;
    if (status === 401 || status === 403) {
      return { message: 'invalid Gemini API key', retryable: false };
    }
    if (status === 404) {
      return { message: `model not found: ${config.geminiModel}`, retryable: false };
    }
    if (status === 429) {
      return { message: 'rate limited', retryable: true };
    }
    return { message: `API error ${status || 'unknown'}`, retryable: status >= 500 };
  }

  return { message: error instanceof Error ? error.message : 'unknown error', retryable: false };
}
