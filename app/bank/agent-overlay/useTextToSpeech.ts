import { useCallback, useEffect, useRef, useState } from "react";
import type { AgentMessage } from "./useAgentSession";

/**
 * Injectable interface over the browser's speechSynthesis API — same pattern
 * as SpeechRecognizer/EngineClient elsewhere in this codebase, so this hook
 * is unit-testable without a real browser speech API.
 */
export interface SpeechSynthesizer {
  speak(text: string): void;
  cancel(): void;
}

/** Checked at call time, not import time — see createBrowserSpeechRecognizer's docstring for why. */
export function createBrowserSpeechSynthesizer(): SpeechSynthesizer | null {
  const w = globalThis as unknown as { speechSynthesis?: SpeechSynthesis; SpeechSynthesisUtterance?: typeof SpeechSynthesisUtterance };
  if (!w.speechSynthesis || !w.SpeechSynthesisUtterance) return null;
  const synth = w.speechSynthesis;
  const UtteranceCtor = w.SpeechSynthesisUtterance;
  return {
    speak: (text: string) => synth.speak(new UtteranceCtor(text)),
    cancel: () => synth.cancel(),
  };
}

export interface UseTextToSpeechResult {
  isSupported: boolean;
  enabled: boolean;
  toggle: () => void;
}

/**
 * Reads new agent replies aloud. Off by default (per explicit product
 * decision — a live demo shouldn't get surprise audio unless the presenter
 * opts in via the header toggle).
 *
 * Scoped to AgentOverlay only, not the architecture showcase page: both
 * panels can observe the SAME shared `messages` array (session is lifted to
 * App.tsx), so mounting this hook in more than one place would double-speak
 * every reply. The showcase is a developer-facing internals viewer, not the
 * conversational surface, so it doesn't need its own TTS.
 */
export function useTextToSpeech(
  messages: AgentMessage[],
  options?: { synthesizer?: SpeechSynthesizer | null },
): UseTextToSpeechResult {
  const injected = options?.synthesizer;
  const synthRef = useRef<SpeechSynthesizer | null>(
    injected !== undefined ? injected : createBrowserSpeechSynthesizer(),
  );
  const [enabled, setEnabled] = useState(false);
  // Ids already spoken (or intentionally skipped via cancel-and-speak-latest)
  // — never revisited, so toggling on/off doesn't replay or re-trigger them.
  const spokenIdsRef = useRef<Set<string>>(new Set());
  const wasEnabledRef = useRef(false);

  const isSupported = synthRef.current !== null;

  useEffect(() => {
    const synth = synthRef.current;
    if (!synth) return;

    // On the false -> true transition, seed the spoken-id set with every
    // message currently present so turning TTS on never retroactively speaks
    // history that was already shown silently.
    if (enabled && !wasEnabledRef.current) {
      for (const m of messages) spokenIdsRef.current.add(m.id);
    }
    wasEnabledRef.current = enabled;

    if (!enabled) return;

    const unspoken = messages.filter((m) => m.role === "agent" && !m.thinking && !spokenIdsRef.current.has(m.id));
    if (unspoken.length === 0) return;

    // Cancel-and-speak-latest: a burst of guardrail messages (e.g. a block
    // immediately followed by a confirm-flow message) would otherwise queue
    // and narrate stale state well after the visible UI has moved on.
    for (const m of unspoken) spokenIdsRef.current.add(m.id);
    const latest = unspoken[unspoken.length - 1]!;
    synth.cancel();
    synth.speak(latest.text);
  }, [messages, enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (!next) synthRef.current?.cancel();
      return next;
    });
  }, []);

  return { isSupported, enabled, toggle };
}
