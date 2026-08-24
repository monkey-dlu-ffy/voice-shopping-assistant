import { useState, type FormEvent } from 'react';
import type { MicStatus } from '../hooks/useSpeech.js';
import type { Strings } from '../lib/i18n.js';

interface VoiceDockProps {
  status: MicStatus;
  /** 0..1 microphone amplitude, used to size the ring around the button. */
  level: number;
  strings: Strings;
  pending: boolean;
  onToggle: () => void;
  onSubmitText: (text: string) => void;
}

function MicIcon({ muted }: { muted: boolean }) {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {muted ? (
        <path d="M4 3l16 18" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

/**
 * The dock.
 *
 * Anchored to the bottom of the viewport rather than centred in the page,
 * because the primary posture for this app is one-handed with a phone in an
 * aisle. The text field is not a fallback bolted on for tests - it is the path
 * for anyone whose browser or permissions rule out the microphone, so it is
 * always present rather than hidden behind an error.
 */
export function VoiceDock({
  status,
  level,
  strings,
  pending,
  onToggle,
  onSubmitText,
}: VoiceDockProps) {
  const [draft, setDraft] = useState('');

  const listening = status === 'listening';
  const micUnavailable = status === 'unsupported' || status === 'denied';

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || pending) return;
    onSubmitText(text);
    setDraft('');
  };

  return (
    <div className="dock">
      <p className="dock-hint">
        {listening ? strings.listeningHint : micUnavailable ? '' : strings.idleHint}
      </p>

      <div className="dock-row">
        <button
          type="button"
          className={`mic${listening ? ' is-listening' : ''}`}
          onClick={onToggle}
          disabled={micUnavailable}
          aria-pressed={listening}
          aria-label={listening ? strings.listeningHint : strings.idleHint}
        >
          {/* Ring scales with real amplitude, so it only moves when you speak. */}
          <span
            className="mic-ring"
            style={
              {
                '--ring-scale': 1 + level * 0.28,
                '--ring-opacity': listening ? 0.25 + level * 0.75 : 0,
              } as React.CSSProperties
            }
          />
          <MicIcon muted={micUnavailable} />
        </button>
      </div>

      <form className="text-fallback" onSubmit={submit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={strings.typeInstead}
          aria-label={strings.typeInstead}
          enterKeyHint="send"
        />
        <button type="submit" disabled={pending || draft.trim().length === 0}>
          {strings.send}
        </button>
      </form>
    </div>
  );
}
