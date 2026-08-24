import type { Intent } from '@vsa/shared';
import type { Strings } from '../lib/i18n.js';
import { Waveform } from './Waveform.js';

interface TranscriptCardProps {
  /** The last finalised utterance. */
  final: string;
  /** Words recognised so far in the utterance still being spoken. */
  interim: string;
  listening: boolean;
  pending: boolean;
  samples: Float32Array | null;
  intent: Intent | null;
  speak: string | null;
  strings: Strings;
}

/**
 * Which engine answered, and how long it took.
 *
 * This is the hybrid architecture made visible. A reviewer who never opens the
 * repository can watch simple commands resolve in the rules in single-digit
 * milliseconds, an unusual phrasing go to the model, and the same phrasing come
 * back from cache the second time.
 */
function ParseBadge({ intent }: { intent: Intent }) {
  const label =
    intent.source === 'rules' ? 'rules' : intent.source === 'cache' ? 'cache' : 'ai';
  const title =
    intent.source === 'rules'
      ? 'Parsed on-device by the rule engine - no network, no cost'
      : intent.source === 'cache'
        ? 'Served from the parse cache - this phrasing was resolved before'
        : 'Parsed by Claude Haiku because the rules were not confident';

  return (
    <span className={`badge badge-${intent.source}`} title={title}>
      <span className="badge-dot" />
      {label} · {intent.latencyMs < 1 ? '<1' : Math.round(intent.latencyMs)}ms
    </span>
  );
}

export function TranscriptCard({
  final,
  interim,
  listening,
  pending,
  samples,
  intent,
  speak,
  strings,
}: TranscriptCardProps) {
  const hasText = Boolean(final || interim);

  return (
    <section className="transcript" aria-label="Recognised speech">
      <div className="transcript-body">
        {hasText ? (
          <p className="transcript-text">
            {final}
            {final && interim ? ' ' : ''}
            {interim ? <span className="interim">{interim}</span> : null}
          </p>
        ) : (
          <p className="transcript-text transcript-idle">{strings.idlePrompt}</p>
        )}
      </div>

      <Waveform samples={samples} active={listening} />

      <div className="transcript-meta">
        {pending ? (
          <span className="badge badge-cache">
            <span className="spinner" />
            {strings.thinking}
          </span>
        ) : intent ? (
          <ParseBadge intent={intent} />
        ) : (
          <span className="badge badge-rules" title="Commands are parsed on-device first">
            <span className="badge-dot" />
            ready
          </span>
        )}

        {intent && !pending ? (
          <span className="badge badge-rules" title="Recognised intent">
            {intent.intent.replace('_', ' ')}
          </span>
        ) : null}

        {speak && !pending ? <span className="transcript-speak">{speak}</span> : null}
      </div>

      {/* Screen readers get the confirmation without watching the waveform. */}
      <p className="visually-hidden" role="status" aria-live="polite">
        {speak ?? ''}
      </p>
    </section>
  );
}
