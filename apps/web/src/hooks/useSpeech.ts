import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Web Speech API bindings.
 *
 * TypeScript's DOM library still does not ship SpeechRecognition types, so the
 * minimum surface this app uses is declared here rather than pulling in a
 * dependency for it.
 */

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  readonly isFinal: boolean;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function recognitionConstructor(): SpeechRecognitionConstructor | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export const speechRecognitionSupported = (): boolean => Boolean(recognitionConstructor());

export type MicStatus = 'idle' | 'listening' | 'denied' | 'unsupported' | 'error';

export interface UseSpeechOptions {
  language: string;
  /** Called once per finalised utterance. */
  onFinal: (transcript: string) => void;
  /** Keep listening after each result, for hands-free mode. */
  continuous: boolean;
}

export interface UseSpeechResult {
  status: MicStatus;
  /** Text recognised so far in the current utterance, not yet final. */
  interim: string;
  errorMessage: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Drive speech recognition.
 *
 * Recognition instances are single-use in practice across browsers, so a fresh
 * one is created per session and torn down on stop. `continuous` is honoured by
 * restarting on `onend`, because Chrome ends the session after a pause
 * regardless of the flag.
 */
export function useSpeech({ language, onFinal, continuous }: UseSpeechOptions): UseSpeechResult {
  const [status, setStatus] = useState<MicStatus>(() =>
    speechRecognitionSupported() ? 'idle' : 'unsupported',
  );
  const [interim, setInterim] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  // Whether the user still wants to be listening. Distinguishes an intentional
  // stop from Chrome ending the session on its own.
  const wantsToListenRef = useRef(false);

  // Kept in refs so the recognition handlers never close over stale values.
  const onFinalRef = useRef(onFinal);
  const continuousRef = useRef(continuous);
  const languageRef = useRef(language);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => {
    continuousRef.current = continuous;
  }, [continuous]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  const teardown = useCallback(() => {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    recognition.onstart = null;
    try {
      recognition.abort();
    } catch {
      // Aborting an already-stopped recognition throws in some browsers.
    }
    recognitionRef.current = null;
  }, []);

  const start = useCallback(() => {
    const Constructor = recognitionConstructor();
    if (!Constructor) {
      setStatus('unsupported');
      return;
    }
    if (recognitionRef.current) return;

    const recognition = new Constructor();
    recognition.lang = languageRef.current;
    recognition.interimResults = true;
    // Always continuous at the browser level, regardless of hands-free mode.
    // With continuous=false, Chrome ends the session at the first short pause
    // it detects - often mid-sentence, well before the user finishes a
    // multi-word command like "add two bottles of water and milk". Running
    // continuous tolerates natural pauses within one utterance; single-shot
    // vs. hands-free is instead decided below, by when *we* choose to stop.
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setStatus('listening');
      setErrorMessage(null);
    };

    recognition.onresult = (event) => {
      let pending = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]!;
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          const finalText = text.trim();
          if (finalText) onFinalRef.current(finalText);
          // Single-shot (non-hands-free) mode: stop right after the first
          // complete phrase rather than waiting on the browser's own
          // end-of-session detection, so the mic reliably goes idle exactly
          // once the user's command has been captured.
          if (!continuousRef.current) {
            wantsToListenRef.current = false;
            recognition.stop();
          }
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };

    recognition.onerror = (event) => {
      if (event.error === 'aborted') return; // we caused this ourselves (stop/toggle)
      if (event.error === 'no-speech') {
        // A pause between commands in hands-free mode is normal and should not
        // interrupt with a banner. In single-shot mode, hitting this instead
        // of a final result is the most likely explanation for "I tapped the
        // mic and nothing happened" - the browser never detected any audio at
        // all - so it is worth surfacing there.
        if (!continuousRef.current) {
          setStatus('error');
          setErrorMessage('no-speech');
        }
        return;
      }
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        wantsToListenRef.current = false;
        setStatus('denied');
        return;
      }
      setStatus('error');
      setErrorMessage(event.error);
    };

    recognition.onend = () => {
      setInterim('');
      recognitionRef.current = null;
      // Chrome ends a session after a natural pause even when continuous is on,
      // so hands-free mode restarts it rather than silently going deaf.
      if (wantsToListenRef.current && continuousRef.current) {
        window.setTimeout(() => {
          if (wantsToListenRef.current) start();
        }, 250);
        return;
      }
      wantsToListenRef.current = false;
      setStatus((current) => (current === 'listening' ? 'idle' : current));
    };

    recognitionRef.current = recognition;
    wantsToListenRef.current = true;

    try {
      recognition.start();
    } catch {
      // start() throws if called while already running; treat as already on.
      setStatus('listening');
    }
  }, []);

  const stop = useCallback(() => {
    wantsToListenRef.current = false;
    const recognition = recognitionRef.current;
    setInterim('');
    setStatus((current) => (current === 'listening' ? 'idle' : current));
    if (!recognition) return;
    try {
      recognition.stop();
    } catch {
      teardown();
    }
  }, [teardown]);

  const toggle = useCallback(() => {
    if (wantsToListenRef.current) stop();
    else start();
  }, [start, stop]);

  // Restarting on a language change keeps recognition and the UI in sync.
  useEffect(() => {
    if (!wantsToListenRef.current) return;
    stop();
    const timer = window.setTimeout(start, 200);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  useEffect(() => teardown, [teardown]);

  return { status, interim, errorMessage, start, stop, toggle };
}

/**
 * Real microphone amplitude, sampled from the actual input stream.
 *
 * The waveform in the UI is drawn from this rather than from a canned
 * animation, so what the user sees is genuinely their own voice - which is the
 * difference between feedback and decoration.
 */
export function useMicLevel(active: boolean): { level: number; samples: Float32Array | null } {
  const [level, setLevel] = useState(0);
  const samplesRef = useRef<Float32Array | null>(null);
  const [, forceRender] = useState(0);

  useEffect(() => {
    if (!active) {
      setLevel(0);
      samplesRef.current = null;
      return;
    }

    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    let cancelled = false;

    const run = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        context = new AudioContext();
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.75;
        source.connect(analyser);

        const buffer = new Float32Array(analyser.fftSize);

        const tick = () => {
          analyser.getFloatTimeDomainData(buffer);

          let sumSquares = 0;
          for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i]! * buffer[i]!;
          const rms = Math.sqrt(sumSquares / buffer.length);

          samplesRef.current = buffer;
          // Speech RMS sits well below 1; scale so normal speaking fills the bar.
          setLevel(Math.min(1, rms * 7));
          forceRender((n) => (n + 1) % 1000);
          frame = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        // Permission denied or no device: the waveform simply stays flat, and
        // the recognition hook surfaces the permission problem to the user.
        setLevel(0);
      }
    };

    void run();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      void context?.close();
    };
  }, [active]);

  return { level, samples: samplesRef.current };
}

/** Spoken confirmations for hands-free use. */
export function useSpeechSynthesis(enabled: boolean) {
  const speak = useCallback(
    (text: string, language: string) => {
      if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      if (!text) return;

      // Cancel anything queued so confirmations never pile up behind each other.
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = language;
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    },
    [enabled],
  );

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  return speak;
}
