import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Injectable interface over the browser's SpeechRecognition API — same
 * pattern as EngineClient in core/src/intent-parser.ts: hooks depend on this
 * narrow interface, not the global directly, so useSpeechToText is
 * unit-testable without a real browser speech API, and callers never touch
 * `window.SpeechRecognition` themselves.
 */
export interface SpeechRecognizer {
  start(): void;
  stop(): void;
  onresult: ((transcript: string, isFinal: boolean) => void) | null;
  onerror: ((error: string) => void) | null;
  onend: (() => void) | null;
}

/** Minimal shape of the browser's real SpeechRecognition constructor/instance. */
interface BrowserSpeechRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface BrowserSpeechRecognitionErrorEvent {
  error: string;
}
interface BrowserSpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
}
type BrowserSpeechRecognitionCtor = new () => BrowserSpeechRecognitionInstance;

/**
 * Checked at CALL time, not import time — this module must be safely
 * importable in any environment (SSR, jsdom test runs, non-Chrome browsers)
 * without throwing, same "browser API might not exist" discipline already
 * used by checkStorageQuota/clearWebLlmCache in core/src/intent-parser.ts.
 * Returns null when unsupported so callers can render no mic button at all,
 * rather than a broken one.
 */
export function createBrowserSpeechRecognizer(): SpeechRecognizer | null {
  const w = globalThis as unknown as {
    SpeechRecognition?: BrowserSpeechRecognitionCtor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionCtor;
  };
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.lang = "en-US";

  const wrapper: SpeechRecognizer = {
    start: () => recognition.start(),
    stop: () => recognition.stop(),
    onresult: null,
    onerror: null,
    onend: null,
  };

  recognition.onresult = (event) => {
    // Only the most recent result index is relevant to us — we show a single
    // live transcript in the text input, not a running multi-utterance log.
    const result = event.results[event.resultIndex];
    if (!result) return;
    wrapper.onresult?.(result[0].transcript, result.isFinal);
  };
  recognition.onerror = (event) => {
    wrapper.onerror?.(event.error);
  };
  recognition.onend = () => {
    wrapper.onend?.();
  };

  return wrapper;
}

export interface UseSpeechToTextResult {
  isSupported: boolean;
  isListening: boolean;
  error: string | null;
  start: (onTranscript: (text: string, isFinal: boolean) => void) => void;
  stop: () => void;
}

/**
 * Live speech-to-text for the chat input. Deliberately does NOT auto-send on
 * a final transcript — see ChatInput.tsx: the caller is responsible for
 * populating its own text field and letting the user review/edit before
 * submitting. A misheard word or a "no-speech"/network error producing a bad
 * transcript must stay visibly editable, especially live on stage, since a
 * submitted intent can be a real (guardrail-gated) money-moving action.
 */
export function useSpeechToText(options?: { recognizer?: SpeechRecognizer | null }): UseSpeechToTextResult {
  const injected = options?.recognizer;
  const recognizerRef = useRef<SpeechRecognizer | null>(
    injected !== undefined ? injected : createBrowserSpeechRecognizer(),
  );
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSupported = recognizerRef.current !== null;

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
  }, []);

  const start = useCallback((onTranscript: (text: string, isFinal: boolean) => void) => {
    const recognizer = recognizerRef.current;
    if (!recognizer) return;

    setError(null);
    recognizer.onresult = (transcript, isFinal) => {
      onTranscript(transcript, isFinal);
      if (isFinal) recognizer.stop();
    };
    recognizer.onerror = (err) => {
      setError(describeSpeechError(err));
      setIsListening(false);
    };
    recognizer.onend = () => {
      setIsListening(false);
    };

    setIsListening(true);
    recognizer.start();
  }, []);

  // Best-effort cleanup: stop listening if the component unmounts mid-capture
  // (e.g. navigating away) rather than leaving the browser's mic indicator on.
  useEffect(() => {
    return () => {
      recognizerRef.current?.stop();
    };
  }, []);

  return { isSupported, isListening, error, start, stop };
}

function describeSpeechError(error: string): string {
  switch (error) {
    case "not-allowed":
    case "permission-denied":
      return "Microphone access was denied.";
    case "no-speech":
      return "Didn't catch that — no speech detected.";
    case "network":
      return "Speech recognition needs a network connection.";
    case "aborted":
      return "Voice input was stopped.";
    default:
      return `Voice input error: ${error}`;
  }
}
