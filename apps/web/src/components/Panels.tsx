import { labelFor, type CatalogEntry, type Suggestion } from '@vsa/shared';
import type { Strings } from '../lib/i18n.js';

/**
 * Suggestions.
 *
 * Every card leads with why it is here. The reason is the feature - a
 * recommendation a shopper cannot interrogate is one they will not trust - so it
 * is never truncated and never replaced by a generic label.
 */
export function Suggestions({
  suggestions,
  language,
  strings,
  onAdd,
}: {
  suggestions: Suggestion[];
  language: string;
  strings: Strings;
  onAdd: (canonical: string) => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section aria-label={strings.suggested}>
      <h2 className="section-title">{strings.suggested}</h2>
      <div className="cards">
        {suggestions.map((suggestion) => (
          <button
            type="button"
            key={suggestion.canonical}
            className={`card kind-${suggestion.kind}`}
            onClick={() => onAdd(suggestion.canonical)}
            aria-label={`${strings.addItem}: ${suggestion.canonical}`}
          >
            <span>
              <span className="card-kind">
                {strings.kinds[suggestion.kind] ?? suggestion.kind}
              </span>
              <span className="card-name">{labelFor(suggestion.canonical, language)}</span>
              <span className="card-reason">{suggestion.reason}</span>
            </span>
            <span className="card-add" aria-hidden="true">
              +
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Voice search results, with the price that satisfied the filter. */
export function SearchResults({
  results,
  language,
  strings,
  onAdd,
}: {
  results: CatalogEntry[];
  language: string;
  strings: Strings;
  onAdd: (canonical: string) => void;
}) {
  if (results.length === 0) return null;

  return (
    <section aria-label={strings.results}>
      <h2 className="section-title">{strings.results}</h2>
      <div className="results">
        {results.map((entry) => (
          <button
            type="button"
            key={entry.canonical}
            className="result"
            onClick={() => onAdd(entry.canonical)}
            aria-label={`${strings.addItem}: ${entry.canonical}`}
          >
            <span className="result-name">
              {labelFor(entry.canonical, language)}
              {entry.brands.length > 0 ? <span>{entry.brands.slice(0, 2).join(' · ')}</span> : null}
            </span>
            <span className="result-price">${entry.avgPrice.toFixed(2)}</span>
            <span className="card-add" aria-hidden="true">
              +
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Alternatives offered right after an item is added. */
export function Substitutes({
  forItem,
  options,
  language,
  strings,
  onAdd,
}: {
  forItem: string;
  options: CatalogEntry[];
  language: string;
  strings: Strings;
  onAdd: (canonical: string) => void;
}) {
  if (options.length === 0) return null;

  return (
    <section aria-label={strings.instead}>
      <h2 className="section-title">
        {strings.instead} — {labelFor(forItem, language)}
      </h2>
      <div className="chips">
        {options.map((entry) => (
          <button
            type="button"
            key={entry.canonical}
            className="chip"
            onClick={() => onAdd(entry.canonical)}
          >
            {labelFor(entry.canonical, language)}
            <span className="chip-price">${entry.avgPrice.toFixed(2)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

export interface ToastMessage {
  id: number;
  text: string;
  tone: 'info' | 'error';
}

export function Toasts({ messages }: { messages: ToastMessage[] }) {
  if (messages.length === 0) return null;

  return (
    <div className="toasts" role="status" aria-live="polite">
      {messages.map((message) => (
        <div key={message.id} className={`toast${message.tone === 'error' ? ' is-error' : ''}`}>
          {message.text}
        </div>
      ))}
    </div>
  );
}

/** Degraded-mode notices: no microphone, unsupported browser, server offline. */
export function Banner({ title, body }: { title: string; body: string }) {
  return (
    <div className="banner col-span" role="alert">
      <div className="banner-body">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  );
}
