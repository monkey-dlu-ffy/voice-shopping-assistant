import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SUPPORTED_LANGUAGES,
  isConfident,
  parseWithRules,
  type CatalogEntry,
  type CommandResult,
  type Intent,
  type ShoppingItem,
  type Suggestion,
} from '@vsa/shared';
import { ApiError, api } from './lib/api.js';
import { stringsFor } from './lib/i18n.js';
import { useMicLevel, useSpeech, useSpeechSynthesis } from './hooks/useSpeech.js';
import { TranscriptCard } from './components/TranscriptCard.js';
import { ShoppingList } from './components/ShoppingList.js';
import { VoiceDock } from './components/VoiceDock.js';
import { Banner, SearchResults, Substitutes, Suggestions, type ToastMessage } from './components/Panels.js';

const LANGUAGE_KEY = 'vsa.language';
const HANDS_FREE_KEY = 'vsa.handsFree';

/** localStorage throws in private modes and embedded webviews; never let it break boot. */
function readStored(key: string, fallback: string): string {
  try {
    return window.localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Preference simply does not persist. Not worth surfacing.
  }
}

export default function App() {
  const [language, setLanguage] = useState(() => readStored(LANGUAGE_KEY, 'en-US'));
  const [handsFree, setHandsFree] = useState(() => readStored(HANDS_FREE_KEY, '0') === '1');

  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [searchResults, setSearchResults] = useState<CatalogEntry[]>([]);
  const [substitutes, setSubstitutes] = useState<CommandResult['substitutes'] | null>(null);

  const [finalTranscript, setFinalTranscript] = useState('');
  const [intent, setIntent] = useState<Intent | null>(null);
  const [speak, setSpeak] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [offline, setOffline] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

  const strings = useMemo(() => stringsFor(language), [language]);
  const speakAloud = useSpeechSynthesis(handsFree);
  const toastSeq = useRef(0);

  const notify = useCallback((text: string, tone: ToastMessage['tone'] = 'info') => {
    const id = ++toastSeq.current;
    setToasts((current) => [...current, { id, text, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 3200);
  }, []);

  /** Highlight rows introduced by the latest command, then let them settle. */
  const markFresh = useCallback((before: ShoppingItem[], after: ShoppingItem[]) => {
    const known = new Set(before.map((i) => i.id));
    const added = new Set(after.filter((i) => !known.has(i.id)).map((i) => i.id));
    if (added.size === 0) return;
    setFreshIds(added);
    window.setTimeout(() => setFreshIds(new Set()), 700);
  }, []);

  const refreshSuggestions = useCallback(async () => {
    try {
      const { suggestions: next } = await api.suggestions(language);
      setSuggestions(next);
    } catch {
      // Suggestions are an enhancement; failing to load them is not worth a toast.
    }
  }, [language]);

  useEffect(() => {
    let cancelled = false;

    const boot = async () => {
      try {
        const { list } = await api.getList();
        if (cancelled) return;
        setItems(list);
        setOffline(false);
        await refreshSuggestions();
      } catch (error) {
        if (cancelled) return;
        if (error instanceof ApiError && error.status === 0) setOffline(true);
      }
    };

    void boot();
    return () => {
      cancelled = true;
    };
  }, [refreshSuggestions]);

  /**
   * Send an utterance to the server and apply the result.
   *
   * The list is rendered from the server's response rather than patched locally,
   * because one command can touch several rows in ways the client would have to
   * duplicate the executor to predict. The interpretation shown while the
   * request is in flight comes from running the same rule parser in the browser
   * - the shared package earning its keep.
   */
  const send = useCallback(
    async (utterance: string) => {
      setFinalTranscript(utterance);
      setPending(true);
      setSearchResults([]);
      setSubstitutes(null);

      // Instant local read of the command, so the UI reacts before the network does.
      const local = parseWithRules(utterance, language);
      if (isConfident(local)) setIntent(local);
      else setIntent(null);

      const before = items;

      try {
        const result = await api.command(utterance, language);
        setOffline(false);
        setIntent(result.intent);
        setSpeak(result.speak);
        setItems(result.list);
        markFresh(before, result.list);

        if (result.searchResults) setSearchResults(result.searchResults);
        if (result.substitutes) setSubstitutes(result.substitutes);

        speakAloud(result.speak, language);

        if (result.intent.intent === 'unknown') {
          notify(result.speak, 'error');
        } else if (
          result.intent.intent === 'mark_bought' ||
          result.intent.intent === 'clear_list'
        ) {
          // Completing items changes the replenishment picture.
          void refreshSuggestions();
        }
      } catch (error) {
        const message =
          error instanceof ApiError && error.status === 0
            ? strings.offlineTitle
            : error instanceof Error
              ? error.message
              : 'Something went wrong.';
        setOffline(error instanceof ApiError && error.status === 0);
        notify(message, 'error');
        setIntent(null);
      } finally {
        setPending(false);
      }
    },
    [items, language, markFresh, notify, refreshSuggestions, speakAloud, strings.offlineTitle],
  );

  const speech = useSpeech({
    language,
    continuous: handsFree,
    onFinal: (transcript) => {
      void send(transcript);
    },
  });

  const { level, samples } = useMicLevel(speech.status === 'listening');

  const addByName = useCallback(
    (canonical: string) => {
      void send(`add ${canonical}`);
    },
    [send],
  );

  const toggleDone = useCallback(
    (item: ShoppingItem) => {
      void send(item.done ? `add ${item.canonical}` : `bought ${item.canonical}`);
    },
    [send],
  );

  const removeItem = useCallback(
    (item: ShoppingItem) => {
      void send(`remove ${item.canonical}`);
    },
    [send],
  );

  const changeLanguage = useCallback((next: string) => {
    setLanguage(next);
    writeStored(LANGUAGE_KEY, next);
  }, []);

  const toggleHandsFree = useCallback(() => {
    setHandsFree((current) => {
      const next = !current;
      writeStored(HANDS_FREE_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  const loadDemo = useCallback(async () => {
    try {
      const { seeded, suggestions: next } = await api.seedDemo();
      setSuggestions(next);
      notify(`Loaded ${seeded} past purchases`);
    } catch {
      notify('Could not load the demo history.', 'error');
    }
  }, [notify]);

  const resetAll = useCallback(async () => {
    try {
      await api.resetDemo();
      setItems([]);
      setSearchResults([]);
      setSubstitutes(null);
      setIntent(null);
      setSpeak(null);
      setFinalTranscript('');
      await refreshSuggestions();
      notify('Cleared');
    } catch {
      notify('Could not reset.', 'error');
    }
  }, [notify, refreshSuggestions]);

  return (
    <div className="app">
      <header className="masthead">
        <div className="wordmark">
          <span className="wordmark-bars" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          Voice List
          <span className="masthead-tag">{strings.tagline}</span>
        </div>

        <label className="visually-hidden" htmlFor="language">
          {strings.language}
        </label>
        <select
          id="language"
          className="control"
          value={language}
          onChange={(event) => changeLanguage(event.target.value)}
        >
          {SUPPORTED_LANGUAGES.map((option) => (
            <option key={option.speechTag} value={option.speechTag}>
              {option.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className="control"
          onClick={toggleHandsFree}
          aria-pressed={handsFree}
          title="Keep listening and read confirmations aloud"
        >
          {handsFree ? strings.handsFreeOn : strings.handsFree}
        </button>
      </header>

      <main className="main">
        {offline ? <Banner title={strings.offlineTitle} body={strings.offlineBody} /> : null}
        {speech.status === 'denied' ? (
          <Banner title={strings.micBlockedTitle} body={strings.micBlockedBody} />
        ) : null}
        {speech.status === 'unsupported' ? (
          <Banner title={strings.unsupportedTitle} body={strings.unsupportedBody} />
        ) : null}

        <div className="col-span">
          <TranscriptCard
            final={finalTranscript}
            interim={speech.interim}
            listening={speech.status === 'listening'}
            pending={pending}
            samples={samples}
            intent={intent}
            speak={speak}
            strings={strings}
          />
        </div>

        <section aria-label={strings.yourList}>
          <h2 className="section-title">{strings.yourList}</h2>
          <ShoppingList
            items={items}
            language={language}
            strings={strings}
            freshIds={freshIds}
            onToggleDone={toggleDone}
            onRemove={removeItem}
          />

          <div className="toolbar" style={{ marginTop: 16 }}>
            <button type="button" className="link-button" onClick={loadDemo}>
              {strings.loadDemo}
            </button>
            <button type="button" className="link-button" onClick={resetAll}>
              {strings.clearDemo}
            </button>
          </div>
        </section>

        <div style={{ display: 'grid', gap: 22 }}>
          {substitutes ? (
            <Substitutes
              forItem={substitutes.forItem}
              options={substitutes.options}
              language={language}
              strings={strings}
              onAdd={addByName}
            />
          ) : null}

          <SearchResults
            results={searchResults}
            language={language}
            strings={strings}
            onAdd={addByName}
          />

          <Suggestions
            suggestions={suggestions}
            language={language}
            strings={strings}
            onAdd={addByName}
          />

          <p className="footnote">
            Commands are parsed on-device first. Only phrasings the rules cannot resolve are
            sent to a language model, and each one is cached so it is never paid for twice.
          </p>
        </div>
      </main>

      <VoiceDock
        status={speech.status}
        level={level}
        strings={strings}
        pending={pending}
        onToggle={speech.toggle}
        onSubmitText={(text) => void send(text)}
      />

      {toasts.length > 0 ? (
        <div className="toasts" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast${toast.tone === 'error' ? ' is-error' : ''}`}>
              {toast.text}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
