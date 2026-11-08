import { useCallback, useEffect, useRef, useState } from "react";
import {
  evaluateIntent,
  AuditLog,
  classifyRawOutput,
  groundIntent,
  buildClassifierPrompt,
  parseIntentTwoStage,
  type UserContext,
  type AttemptRecord,
  WebLlmEngineClient,
  clearWebLlmCache,
  checkStorageQuota,
  type EngineLoadProgress,
  Intent,
  type Decision,
  type PolicyRule,
} from "@web-ai/core/web";
import { executeIntent } from "./adapter/executeIntent";
import { markNextSubmitBy, recordActivity, type AgentActor } from "../cloud/activity";
import { INTENT_SCREEN_MAP } from "../app/intentScreenMap";
import type { Screen } from "../app/Nav";
import { SEED_ACCOUNTS } from "../mock-data/accounts";
import { SEED_PAYEES } from "../mock-data/payees";

const SEED_CONTEXT: UserContext = { accounts: SEED_ACCOUNTS, payees: SEED_PAYEES };

// Qwen2.5-1.5B-Instruct-q4f16_1-MLC's own reported vram_required_MB, used here
// as a proxy for its browser Cache Storage footprint so we can warn
// proactively before spending minutes on a download likely to hit quota
// mid-transfer.
const MODEL_APPROX_SIZE_MB = 1630;

export interface AgentMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  /** Set on user messages that came from the cloud agent rather than this panel's on-device model. */
  via?: "cloud";
  intent?: Intent;
  decision?: Decision;
  matchedRule?: PolicyRule;
  rejected?: boolean;
  pendingConfirm?: boolean;
  /** Set on a model-load failure so the UI can offer a retry action. */
  canRetryModelLoad?: boolean;
  /**
   * Wall-clock time (ms) this specific agent reply took to produce, measured
   * from the triggering user interaction (the chat send, or — for a
   * confirm-gated action — the Confirm click, since that's a distinct wait
   * the user experiences separately from however long they spent reading the
   * confirm dialog). Only ever set on role: "agent" messages.
   */
  elapsedMs?: number;
  /**
   * Raw completion(s) the on-device model actually produced for this turn —
   * real pipeline data (not a mock), threaded through from parseIntent's
   * ParseResult/ParseFailure so a UI (the architecture showcase page) can
   * show genuine LLM I/O rather than a paraphrase or a canned example.
   */
  rawModelOutputs?: string[];
  /** How many retry attempts parseIntent needed before this result. Only set alongside a successful parse. */
  retriesUsed?: number;
  /** On agent replies: which agent's proposal this was (for the activity feed and confirm/cancel). */
  actor?: AgentActor;
  /** On agent replies: the user's words that started this turn. */
  requestText?: string;
  /** Placeholder while a background cloud run works; replaced by the run's result. */
  thinking?: boolean;
  /** Set on a cloud failure so the UI can offer the agent chat transcript. */
  canOpenCloudChat?: boolean;
}

/** How long a background cloud run may take before the panel gives up on it. */
const CLOUD_TURN_TIMEOUT_MS = 90_000;

type CloudTurn = { id: string; startedAt: number; timer: ReturnType<typeof setTimeout> };

// Switched from gemma3-1b-it (~711MB) to Qwen2.5-1.5B-Instruct (~1.63GB)
// after gemma3-1b-it repeatedly failed to produce valid JSON even after
// fixing every actual bug in our own code (window-size config, the broken
// response_format grammar path, generation params, and — most significantly
// — genuinely separating system/user chat roles instead of hand-rolling
// label text). At that point the honest conclusion was a real capability
// ceiling for a 1B-parameter heavily-quantized model on structured-output
// generation, not something further prompt engineering could fix. Qwen2.5
// models are specifically known to be stronger at instruction-following/
// structured JSON output than same-size Gemma variants, and Qwen2.5-1.5B's
// own mlc-chat-config.json confirms two concrete advantages: (1)
// sliding_window_size is already -1 (Gemma's was positive, causing the
// WindowSizeConfigurationError bug), and (2) its "qwen2" conv_template has a
// genuine system-role turn (ChatML-style <|im_start|>), unlike Gemma's
// role-folding — directly avoiding the exact "model imitates our own prompt
// labels" failure mode fixed in the previous update. Real trade-off: ~1.63GB
// vs ~711MB download — still comfortably under both the 2.8GB free-space
// budget on this machine and the ~1.9GB gemma-2-2b-it that originally failed
// outright on disk space. See docs/implementation-log/phase-2-intent-parser.md.
const MODEL_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";

/**
 * Persists every live chat parse (success, rejection, engine error) to
 * evidence/live-app.jsonl via the dev server's evidence sink (vite.config.ts),
 * so failures seen while actually using the app become countable data next to
 * the benchmark results. Dev-server only; fire-and-forget.
 */
function logLiveParse(record: Record<string, unknown>): void {
  if (!import.meta.env.DEV || import.meta.env.MODE === "test") return;
  void fetch("/__evidence?stream=live-app", {
    method: "POST",
    body: JSON.stringify({
      timestamp: new Date().toISOString(),
      platform: "web",
      engine: "webllm",
      modelId: MODEL_ID,
      promptVariant: "v4_two_stage",
      ...record,
    }),
  }).catch(() => undefined);
}

function summarizeAttempts(attempts: AttemptRecord[]) {
  return attempts.map((a) => ({
    raw: a.raw.slice(0, 2000),
    latencyMs: a.latencyMs,
    rawClass: classifyRawOutput(a.raw),
    failureKind: a.failure?.kind,
  }));
}

export type ModelStatus = "idle" | "loading" | "ready" | "error";

export function useAgentSession({
  onNavigate,
  getUserContext = () => SEED_CONTEXT,
}: {
  onNavigate?: (screen: Screen) => void;
  /** The user's current accounts/payees (with live balances), for grounding model output. */
  getUserContext?: () => UserContext;
} = {}) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("idle");
  const [loadProgress, setLoadProgress] = useState<EngineLoadProgress | null>(null);
  const engineRef = useRef<WebLlmEngineClient | null>(null);
  const auditLogRef = useRef(new AuditLog());
  /** Cloud sends from this panel still waiting for their propose-intent, oldest first. */
  const cloudTurnsRef = useRef<CloudTurn[]>([]);

  const ensureEngine = useCallback(() => {
    if (!engineRef.current) {
      engineRef.current = new WebLlmEngineClient(MODEL_ID);
      engineRef.current.setProgressCallback((report) => setLoadProgress(report));
    }
    return engineRef.current;
  }, []);

  /** Kicks off the model download+init, warning first if storage quota looks tight. */
  const startLoading = useCallback(async () => {
    const engine = ensureEngine();
    setModelStatus("loading");

    const quota = await checkStorageQuota(MODEL_APPROX_SIZE_MB);
    if (quota.available && quota.likelyInsufficient) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-warn`,
          role: "agent",
          text:
            `Heads up: this browser only has about ${Math.max(0, Math.round(quota.remainingMB ?? 0))}MB of ` +
            `storage quota left, and the on-device model needs roughly ${MODEL_APPROX_SIZE_MB}MB. The download ` +
            "below may fail partway through — freeing up disk space first will make it more likely to succeed.",
        },
      ]);
    }

    try {
      await engine.preload();
      setModelStatus("ready");
    } catch (err) {
      setModelStatus("error");
      const message = err instanceof Error ? err.message : String(err);
      auditLogRef.current.recordRejected("(model preload)", `Engine error: ${message}`);
      // Deliberately NOT also pushed into `messages` here: ModelLoadPanel (shown
      // whenever modelStatus !== "ready") already surfaces this error prominently,
      // with its own retry button. Duplicating it into the chat message list as
      // well — which is otherwise empty at this point, since the empty-state/
      // suggestions only render once ready — was redundant and confusing in
      // practice (confirmed visually: the same error appeared twice on screen).
    }
  }, [ensureEngine]);

  // Start downloading the model as soon as the agent panel mounts, rather
  // than lazily on the user's first message — the chat input stays disabled
  // (see AgentOverlay) until modelStatus becomes "ready", so there's no
  // benefit to deferring the download and it only adds a surprise wait after
  // the user's first attempt to chat.
  useEffect(() => {
    startLoading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Navigates to the intent's owning screen (if any) and waits a tick for
   * React to actually mount it before returning — executeIntent()/its
   * [data-agent-action] lookup only works against whatever screen is
   * CURRENTLY mounted (App.tsx renders exactly one screen at a time), so
   * without this, asking the agent to do something while on a different
   * screen produced a confusing "Approved but could not execute: No
   * [data-agent-action=...] element found on current screen" — even though
   * the intent was parsed and approved correctly. Observed live.
   *
   * When the intent's owning screen is `null` (no UI built for it yet — e.g.
   * schedule_recurring_payment), this records the request in the audit log
   * (rather than silently failing) so a real, timestamped record exists of
   * what people asked for that this demo doesn't support yet — a generic
   * pattern, not a one-off message for a single intent type.
   */
  const ensureCorrectScreen = useCallback(
    async (intent: Intent): Promise<{ ok: true } | { ok: false; reason: string }> => {
      const targetScreen = INTENT_SCREEN_MAP[intent.type];
      if (targetScreen === null) {
        auditLogRef.current.recordRejected(
          intent.rawInputSummary,
          `No screen implemented yet for "${intent.type}"`,
        );
        return {
          ok: false,
          reason:
            `This kind of request ("${intent.type}") isn't available in this demo yet — ` +
            "I've logged it so it can be considered for a future iteration.",
        };
      }
      if (onNavigate) {
        onNavigate(targetScreen);
        // Let React commit the new screen before the DOM adapter looks for it.
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      return { ok: true };
    },
    [onNavigate],
  );

  /**
   * The v4 pipeline measured in evidence/REPORT.md (98% on the held-out
   * split): the model first only classifies the action, then extracts that
   * action's fields; code decides what is missing. Both prompts are rebuilt
   * per message from live store data, so a payee added mid-session is
   * immediately a legal id. Exposed so the showcase can display it verbatim.
   */
  const getClassifierPrompt = useCallback(() => buildClassifierPrompt(getUserContext()), [getUserContext]);

  /**
   * Everything after the model: grounding → guardrail → navigate → visible
   * fill/submit. Shared verbatim by the on-device model (send) and the cloud
   * agent's proposals (sendExternal), so both produce identical behaviour.
   */
  const handleParsedIntent = useCallback(
    async (
      text: string,
      parsed: Intent,
      meta: { actor: AgentActor; rawOutputs?: string[]; retriesUsed?: number; attempts?: AttemptRecord[] },
      elapsed: () => number,
    ) => {
      const { actor } = meta;
      // Cloud proposals are logged server-side by propose-intent; the device
      // model's only exist here, so log them from the browser.
      const logDeviceProposal = (decision: "allow" | "confirm" | "block" | null, ruleId: string | null, detail: string) => {
        if (actor === "device-agent") {
          recordActivity({ kind: "proposal", actor, intentType: parsed.type, decision, ruleId, detail });
        }
      };
      // Code, not the model, maps references onto real accounts/payees and
      // checks them against real data (core/src/grounding.ts). Only a
      // grounded intent ever reaches the guardrail.
      const grounding = groundIntent(parsed, getUserContext(), text);
      if (grounding.status !== "ok") {
        const reason = grounding.status === "rejected" ? grounding.reason : grounding.question;
        auditLogRef.current.recordRejected(text, `Grounding ${grounding.status}: ${reason}`);
        logDeviceProposal(null, null, `${grounding.status}: ${text}`);
        logLiveParse({
          text,
          outcome: grounding.status === "rejected" ? "grounding_rejected" : "needs_clarification",
          intent: parsed,
          reason,
          retriesUsed: meta.retriesUsed,
          attempts: meta.attempts ? summarizeAttempts(meta.attempts) : undefined,
          totalLatencyMs: elapsed(),
        });
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: grounding.status === "rejected" ? `${reason} Nothing was executed.` : reason,
            rejected: grounding.status === "rejected",
            intent: parsed,
            rawModelOutputs: meta.rawOutputs,
            retriesUsed: meta.retriesUsed,
            elapsedMs: elapsed(),
          },
        ]);
        return;
      }
      const intent = grounding.intent;

      const { decision, matchedRule } = evaluateIntent(intent);
      auditLogRef.current.recordParsed(text, intent, decision, matchedRule);
      logDeviceProposal(decision, matchedRule.id, text);
      logLiveParse({
        text,
        outcome: "parsed",
        intent,
        decision,
        retriesUsed: meta.retriesUsed,
        attempts: meta.attempts ? summarizeAttempts(meta.attempts) : undefined,
        totalLatencyMs: elapsed(),
      });

      if (decision === "block") {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: `Blocked: ${matchedRule.reason}`,
            intent: intent,
            actor,
            requestText: text,
            rawModelOutputs: meta.rawOutputs,
            retriesUsed: meta.retriesUsed,
            decision,
            matchedRule,
            elapsedMs: elapsed(),
          },
        ]);
        return;
      }

      if (decision === "confirm") {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: `This requires your confirmation: ${matchedRule.reason}`,
            intent: intent,
            actor,
            requestText: text,
            rawModelOutputs: meta.rawOutputs,
            retriesUsed: meta.retriesUsed,
            decision,
            matchedRule,
            pendingConfirm: true,
            elapsedMs: elapsed(),
          },
        ]);
        return;
      }

      // decision === "allow"
      const screenCheck = await ensureCorrectScreen(intent);
      if (!screenCheck.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: screenCheck.reason,
            intent: intent,
            actor,
            requestText: text,
            rawModelOutputs: meta.rawOutputs,
            retriesUsed: meta.retriesUsed,
            decision,
            matchedRule,
            elapsedMs: elapsed(),
          },
        ]);
        return;
      }
      markNextSubmitBy(actor);
      const execResult = await executeIntent(intent);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-a`,
          role: "agent",
          text: execResult.ok
            ? `Done. (${matchedRule.reason})`
            : `Approved but could not execute: ${execResult.reason}`,
          intent: intent,
          rawModelOutputs: meta.rawOutputs,
          retriesUsed: meta.retriesUsed,
          decision,
          matchedRule,
          elapsedMs: elapsed(),
        },
      ]);
    },
    [ensureCorrectScreen, getUserContext],
  );

  const send = useCallback(
    async (text: string) => {
      if (modelStatus !== "ready") return; // input is disabled until ready, but guard defensively

      const startedAt = Date.now();
      const elapsed = () => Date.now() - startedAt;

      const userMessage: AgentMessage = { id: `msg-${Date.now()}-u`, role: "user", text };
      setMessages((prev) => [...prev, userMessage]);

      const engine = ensureEngine();
      let result;
      try {
        result = await parseIntentTwoStage(engine, text, getUserContext(), new Date().toISOString().slice(0, 10));
      } catch (err) {
        setModelStatus("error");
        const message = err instanceof Error ? err.message : String(err);
        auditLogRef.current.recordRejected(text, `Engine error: ${message}`);
        logLiveParse({ text, outcome: "engine_error", error: message, totalLatencyMs: elapsed() });
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: message,
            rejected: true,
            canRetryModelLoad: true,
            elapsedMs: elapsed(),
          },
        ]);
        return;
      }

      if (!result.ok) {
        auditLogRef.current.recordRejected(text, result.reason);
        logLiveParse({
          text,
          outcome: "parse_failed",
          reason: result.reason,
          retriesUsed: result.retriesUsed,
          attempts: summarizeAttempts(result.attempts),
          totalLatencyMs: elapsed(),
        });
        setMessages((prev) => [
          ...prev,
          {
            // result.reason now names the specific cause (e.g. which fields
            // the model's JSON was missing/wrong-typed for, or that no JSON
            // could be extracted at all) — shown directly rather than
            // wrapped in a redundant "I couldn't parse that (...)" preamble,
            // since the reason string is already a complete sentence.
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: `${result.reason} Nothing was executed.`,
            rejected: true,
            elapsedMs: elapsed(),
            rawModelOutputs: result.rawOutputs,
          },
        ]);
        return;
      }

      await handleParsedIntent(text, result.intent, { ...result, actor: "device-agent" }, elapsed);
    },
    [ensureEngine, handleParsedIntent, modelStatus, getUserContext],
  );

  /**
   * Entry point for the cloud agent (Agent-Native's server agent, via the
   * propose-intent action). It skips only the on-device parse: the proposal is
   * schema-checked with the same Intent schema, then handled exactly like the
   * on-device model's output.
   */
  const sendExternal = useCallback(
    async (text: string, proposal: unknown) => {
      // A proposal answering this panel's own cloud send resolves that turn
      // (its user bubble is already shown); one started from the agent chat
      // directly gets its user bubble here, as before.
      const turn = cloudTurnsRef.current.shift();
      const startedAt = turn?.startedAt ?? Date.now();
      const elapsed = () => Date.now() - startedAt;
      if (turn) {
        clearTimeout(turn.timer);
        setMessages((prev) => prev.filter((m) => m.id !== `${turn.id}-thinking`));
      } else {
        setMessages((prev) => [...prev, { id: `msg-${Date.now()}-u`, role: "user", text, via: "cloud" }]);
      }
      const parsed = Intent.safeParse(proposal);
      if (!parsed.success) {
        const reason = `The cloud agent's proposal did not match the intent schema (${parsed.error.issues
          .map((i) => i.path.join(".") || i.message)
          .join(", ")}).`;
        auditLogRef.current.recordRejected(text, reason);
        setMessages((prev) => [
          ...prev,
          { id: `msg-${Date.now()}-a`, role: "agent", text: `${reason} Nothing was executed.`, rejected: true, elapsedMs: elapsed() },
        ]);
        return;
      }
      await handleParsedIntent(text, parsed.data, { actor: "cloud-agent" }, elapsed);
    },
    [handleParsedIntent],
  );

  /** Ends a cloud turn that produced no proposal; nothing reaches the pipeline. */
  const failCloudTurn = useCallback((turnId: string, reason: string) => {
    const turn = cloudTurnsRef.current.find((t) => t.id === turnId);
    if (!turn) return; // already answered by a proposal
    clearTimeout(turn.timer);
    cloudTurnsRef.current = cloudTurnsRef.current.filter((t) => t !== turn);
    auditLogRef.current.recordRejected("(cloud agent)", reason);
    setMessages((prev) =>
      prev.map((m) =>
        m.id === `${turnId}-thinking`
          ? {
              id: `msg-${Date.now()}-a`,
              role: "agent",
              text: `${reason} Nothing was executed.`,
              rejected: true,
              canOpenCloudChat: true,
              elapsedMs: Date.now() - turn.startedAt,
            }
          : m,
      ),
    );
  }, []);

  /**
   * The cloud counterpart of `send`: shows the user's message right away, then
   * waits for the background run's propose-intent to arrive through
   * sendExternal — so cloud and on-device turns read the same in this panel.
   */
  const sendCloud = useCallback(
    async (text: string, dispatch: (text: string) => Promise<{ delivered: boolean; reason?: string }>) => {
      const id = `msg-${Date.now()}-u`;
      const turn: CloudTurn = {
        id,
        startedAt: Date.now(),
        timer: setTimeout(() => failCloudTurn(id, "The cloud agent didn't respond in time."), CLOUD_TURN_TIMEOUT_MS),
      };
      cloudTurnsRef.current.push(turn);
      setMessages((prev) => [
        ...prev,
        { id, role: "user", text, via: "cloud" },
        { id: `${id}-thinking`, role: "agent", text: "Cloud agent is working on it…", thinking: true },
      ]);
      const result = await dispatch(text);
      if (!result.delivered) {
        failCloudTurn(id, `Couldn't reach the cloud agent (${result.reason ?? "unknown error"}).`);
      }
    },
    [failCloudTurn],
  );

  useEffect(() => () => cloudTurnsRef.current.forEach((t) => clearTimeout(t.timer)), []);

  /**
   * Recovers from a failed model load: drops the current (broken) engine
   * instance, clears WebLLM's Cache Storage entries in case a corrupted/partial
   * download is the cause, and immediately starts a fresh load (rather than
   * waiting for the user to send a message, since the input stays disabled
   * until the model is ready anyway).
   */
  const retryModelLoad = useCallback(async () => {
    engineRef.current = null;
    setLoadProgress(null);
    // No chat message pushed here — ModelLoadPanel reflects "loading" immediately
    // via startLoading()'s setModelStatus("loading") below, so the retry is
    // already visible without duplicating it into the (still-hidden) message list.
    try {
      await clearWebLlmCache();
    } catch {
      // best-effort — proceed even if cache clearing itself fails
    }
    await startLoading();
  }, [startLoading]);

  /**
   * A confirm card is answered once: the first Confirm or Cancel closes it, and
   * any later click on it is ignored. The ref covers double clicks that land
   * before React re-renders the card away; the state update removes the card.
   */
  const settledConfirmsRef = useRef(new Set<string>());
  const settleConfirm = useCallback((messageId: string) => {
    if (settledConfirmsRef.current.has(messageId)) return false;
    settledConfirmsRef.current.add(messageId);
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, pendingConfirm: false } : m)));
    return true;
  }, []);

  const confirm = useCallback(
    async (message: AgentMessage) => {
      if (!message.intent || !settleConfirm(message.id)) return;
      // Timed from the Confirm click, not the original message — this is the
      // actual wait the user experiences for this specific interaction
      // (screen switch + execute), separate from however long they spent
      // reading the confirm dialog before clicking.
      const confirmStartedAt = Date.now();
      const screenCheck = await ensureCorrectScreen(message.intent);
      if (!screenCheck.ok) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-a`,
            role: "agent",
            text: screenCheck.reason,
            elapsedMs: Date.now() - confirmStartedAt,
          },
        ]);
        return;
      }
      const actor = message.actor ?? "device-agent";
      recordActivity({ kind: "confirmed", actor, intentType: message.intent.type, decision: message.decision, ruleId: message.matchedRule?.id, detail: message.requestText ?? message.intent.type });
      markNextSubmitBy(actor);
      const execResult = await executeIntent(message.intent);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-a`,
          role: "agent",
          text: execResult.ok ? "Confirmed and executed." : `Confirmed but could not execute: ${execResult.reason}`,
          elapsedMs: Date.now() - confirmStartedAt,
        },
      ]);
    },
    [ensureCorrectScreen, settleConfirm],
  );

  const cancel = useCallback((message: AgentMessage) => {
    if (!settleConfirm(message.id)) return;
    if (message.intent) {
      recordActivity({ kind: "cancelled", actor: message.actor ?? "device-agent", intentType: message.intent.type, decision: message.decision, ruleId: message.matchedRule?.id, detail: message.requestText ?? message.intent.type });
    }
    setMessages((prev) => [
      ...prev,
      { id: `msg-${Date.now()}-a`, role: "agent", text: "Cancelled — nothing was executed." },
    ]);
  }, [settleConfirm]);

  return {
    messages,
    send,
    sendExternal,
    sendCloud,
    confirm,
    cancel,
    retryModelLoad,
    modelStatus,
    loadProgress,
    auditLog: auditLogRef.current,
    getClassifierPrompt,
  };
}
