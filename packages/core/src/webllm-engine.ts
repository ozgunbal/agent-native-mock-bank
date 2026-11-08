import type { CompleteOptions, EngineClient } from "./intent-parser";

/**
 * Real WebLLM-backed engine. Lives apart from intent-parser.ts so the parser,
 * prompt and eval harness stay importable on mobile; this file is only
 * reachable via the "./web" export subpath. See docs/implementation-log
 * phase-2 for the environment caveat: real inference requires a WebGPU browser
 * and cannot be exercised from this shell-only build/test environment.
 */
const LOAD_RETRY_ATTEMPTS = 2;

/** Structured load-progress event, mirroring WebLLM's own InitProgressReport shape. */
export interface EngineLoadProgress {
  /** Fraction complete, 0–1. WebLLM reports this across the whole download+init, not per-file. */
  progress: number;
  timeElapsedSeconds: number;
  text: string;
}

export class WebLlmEngineClient implements EngineClient {
  private enginePromise: Promise<import("@mlc-ai/web-llm").MLCEngineInterface> | null = null;
  private onProgress?: (report: EngineLoadProgress) => void;
  private lastProgressText = "";
  /** Wall-clock ms the last successful load took (download-or-cache-hit + init). */
  loadTimeMs: number | null = null;
  /** WebLLM's own usage block from the most recent completion (token counts, tokens/s). */
  lastUsage: unknown = null;

  constructor(private readonly modelId: string) {}

  /** Frees GPU memory so the eval harness can load the next model in the same tab. */
  async unload(): Promise<void> {
    if (!this.enginePromise) return;
    const engine = await this.enginePromise.catch(() => null);
    this.enginePromise = null;
    await engine?.unload();
  }

  /** Optional hook so a UI can show real model-download progress. */
  setProgressCallback(cb: (report: EngineLoadProgress) => void) {
    this.onProgress = cb;
  }

  /**
   * Explicitly starts the model load (download + WASM init) without waiting
   * for a `complete()` call — lets a UI begin downloading immediately on
   * mount and gate chat input on completion, rather than lazily loading on
   * the user's first message.
   */
  preload(): Promise<unknown> {
    return this.getEngine();
  }

  private async getEngine() {
    if (!this.enginePromise) {
      this.enginePromise = this.loadEngine();
      // If the load fails, clear the cached promise so the NEXT call retries
      // from scratch instead of returning the same rejected promise forever —
      // otherwise a transient network failure (e.g. a Cache.add() NetworkError
      // during the multi-GB model download) permanently breaks the session
      // until the page is reloaded.
      this.enginePromise.catch(() => {
        this.enginePromise = null;
      });
    }
    return this.enginePromise;
  }

  private async loadEngine() {
    const webllm = await import("@mlc-ai/web-llm");
    let lastErr: unknown;

    // Model downloads are multi-hundred-MB to multi-GB and go through a CDN
    // redirect chain (huggingface.co -> resolve-cache -> CloudFront). A single
    // dropped connection mid-download throws Cache.add()'s NetworkError even
    // though the overall connection is fine — so retry the whole load a couple
    // of times before surfacing an error, same bounded-retry philosophy as
    // parseIntent's retry loop.
    for (let attempt = 0; attempt <= LOAD_RETRY_ATTEMPTS; attempt++) {
      const startedAt = Date.now();
      try {
        const engine = await webllm.CreateMLCEngine(
          this.modelId,
          {
            initProgressCallback: (report) => {
              this.lastProgressText = report.text;
              this.onProgress?.({
                progress: report.progress,
                timeElapsedSeconds: report.timeElapsed,
                text: report.text,
              });
            },
          },
          // gemma3-1b-it-q4f16_1-MLC's own mlc-chat-config.json ships with BOTH
          // context_window_size (8192, or 4096 via this model's prebuilt
          // `overrides`) and sliding_window_size (512) set positive.
          // LLMChatPipeline hard-rejects that combination:
          // "WindowSizeConfigurationError: Only one of context_window_size and
          // sliding_window_size can be positive." — confirmed by fetching the
          // model's real mlc-chat-config.json and inspecting both fields.
          // Per the error's own suggested fix, force sliding_window_size to -1
          // here (via CreateMLCEngine's chatOpts param, not by mutating global
          // config) so context_window_size is the only positive value —
          // standard fixed-context truncation instead of sliding-window
          // attention, appropriate for this app's short single-turn prompts.
          { sliding_window_size: -1 },
        );
        this.loadTimeMs = Date.now() - startedAt;
        return engine;
      } catch (err) {
        lastErr = err;
        // Log every attempt's raw error to console immediately — the download
        // itself can succeed while WASM/WebGPU *initialization* afterward
        // fails for reasons Cache.add()'s NetworkError message doesn't cover
        // at all (e.g. shader compilation, device limits, an aborted init).
        // Without this, that failure was only ever visible as a generic
        // user-facing string with no way to actually diagnose it.
        logWebLlmLoadError(err, this.modelId, attempt, this.lastProgressText);
        if (attempt < LOAD_RETRY_ATTEMPTS) {
          this.onProgress?.({
            progress: 0,
            timeElapsedSeconds: 0,
            text: `Load attempt ${attempt + 1} failed, retrying…`,
          });
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    throw new Error(describeWebLlmLoadError(lastErr, this.lastProgressText), { cause: lastErr });
  }

  async complete({ system, user }: { system: string; user: string }, options?: CompleteOptions): Promise<string> {
    const engine = await this.getEngine();
    const response = await engine.chat.completions.create({
      // Sent as genuinely separate roles, not one concatenated user-role
      // string with hand-rolled "System: .../User: ..." labels — see
      // EngineClient's docstring for why that caused the model to imitate
      // our own scaffolding text instead of answering. gemma3-1b-it's own
      // conv_template has no native system-role turn (system_message is
      // folded into the user turn per its mlc-chat-config.json), but WebLLM
      // handles that folding correctly when given a real system-role
      // message — we don't need to hand-roll it ourselves.
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // response_format is only passed when the caller supplies a real
      // JSON-schema string (the eval harness's constrained-decoding variant).
      // By default it is deliberately NOT passed. This WebLLM version's
      // `{ type: "json_object" }` mode is actually schema-CONSTRAINED
      // decoding, not plain "produce valid JSON" mode as its own docstring
      // suggests — it unconditionally calls
      // grammarCompiler.compileJSONSchema(responseFormat.schema), and without
      // a real JSON-schema string in `schema` that call throws
      // `BindingError: Cannot pass non-string to std::string` from the C++
      // binding (confirmed by reading WebLLM's own runtime source at the
      // exact call site). Rather than generate and maintain a JSON-schema
      // string kept in sync with the zod `Intent` union (fragile across
      // model/WebLLM version changes), we rely on the SYSTEM_PROMPT's
      // explicit instruction to emit strict JSON, backstopped by
      // parseIntent's own zod validation + retry loop below — which is
      // already the real security boundary in this design (see parseIntent's
      // docstring: "this strict rejection is itself part of the injection
      // defense"), not response_format.
      //
      // Without grammar constraining, an unconstrained small quantized model
      // can degenerate into repeating a token pattern (observed live: endless
      // "```json" repetition) until it hits the context limit — wasting time
      // and producing useless output. These three parameters bound that:
      // 200 was observed live to be too tight: a chatty small model that
      // front-loads prose/"Output:" labels before the actual JSON can get cut
      // off mid-object (e.g. an unterminated string with no closing brace at
      // all) — that's a genuinely truncated response, not a malformed one,
      // and no amount of extraction/repair logic can recover it. 400 gives
      // enough headroom for a verbose preamble plus a complete JSON object.
      max_tokens: 400,
      temperature: 0, // deterministic decoding for a structured-output task, not creative writing
      // 1.3 is the app's original setting; the eval's v3 variant measures 1.0,
      // since a penalty on repeated tokens also penalizes the quotes and
      // braces JSON necessarily repeats.
      repetition_penalty: options?.repetitionPenalty ?? 1.3, // actively discourages repeating the same token/phrase (e.g. "```json") in a loop
      ...(options?.responseFormat ? { response_format: options.responseFormat } : {}),
    });
    this.lastUsage = response.usage ?? null;
    return response.choices[0]?.message?.content ?? "";
  }
}

/**
 * Logs the raw underlying error to the console in full — name, message, stack,
 * and `cause` if present — plus the context needed to diagnose it (model id,
 * which retry attempt, how far progress had gotten). The user-facing message
 * from `describeWebLlmLoadError` is necessarily a summary; this is the actual
 * diagnostic trail, since WebLLM/WebGPU errors (especially ones thrown during
 * WASM/device initialization AFTER a successful download) often carry detail
 * in `err.stack` or `err.cause` that a one-line string can't convey.
 */
function logWebLlmLoadError(err: unknown, modelId: string, attempt: number, lastProgressText: string): void {
  // eslint-disable-next-line no-console
  console.group(`[WebLlmEngineClient] model load failed (attempt ${attempt + 1}/${LOAD_RETRY_ATTEMPTS + 1})`);
  // eslint-disable-next-line no-console
  console.error("Raw error:", err);
  if (err instanceof Error) {
    if (err.stack) {
      // eslint-disable-next-line no-console
      console.error("Stack:", err.stack);
    }
    if ("cause" in err && err.cause !== undefined) {
      // eslint-disable-next-line no-console
      console.error("Cause:", err.cause);
    }
  }
  // eslint-disable-next-line no-console
  console.error("Model ID:", modelId);
  // eslint-disable-next-line no-console
  console.error("Last progress report before failure:", lastProgressText || "(none received)");
  // eslint-disable-next-line no-console
  console.groupEnd();
}

/**
 * WebLLM downloads model shards into the browser's Cache Storage via
 * `Cache.add()`, then separately compiles/initializes a WASM+WebGPU runtime
 * against them. Failures at either stage surface here with very different
 * signatures:
 * - Download-stage: a bare `NetworkError` from `Cache.add()`, with no
 *   distinguishing detail, for causes like no connectivity, a blocked/CORS-
 *   restricted request, quota exceeded, or a corrupted partial-download.
 * - Init-stage (download succeeded, engine construction/compilation then
 *   failed): a different error shape entirely — e.g. a WebGPU device-lost
 *   error, a shader compilation failure, an "Unable to find a compatible GPU"
 *   error thrown intentionally by WebLLM, or an aborted/cancelled init.
 * Turn the raw error into an actionable message for either case rather than
 * surfacing the opaque exception verbatim — and ALWAYS log the raw error via
 * logWebLlmLoadError so the real detail isn't lost even when this summary
 * can't pin down the exact cause.
 */
function describeWebLlmLoadError(err: unknown, lastProgressText: string): string {
  const message = err instanceof Error ? err.message : String(err);
  const whereItFailed = lastProgressText ? ` It last reported: "${lastProgressText}".` : "";

  if (/Cache\.add\(\)|NetworkError/i.test(message)) {
    return (
      "Could not download the on-device model after retrying — a network error occurred " +
      `while caching model files (the model is a multi-GB download from huggingface.co).${whereItFailed} ` +
      "Most likely causes, roughly in order of how common they are: " +
      "(1) the browser's Cache Storage quota was exceeded for this site — check " +
      "chrome://settings/content/all?searchSubpage=localhost and look at the storage used " +
      "for this origin, or check available disk space; " +
      "(2) the connection dropped partway through the multi-GB download (already retried " +
      `${LOAD_RETRY_ATTEMPTS} times automatically — a slow/unstable connection may need more ` +
      "time or a wired connection); " +
      "(3) an ad blocker or privacy extension blocked a request to huggingface.co — try an " +
      "incognito window with extensions disabled; " +
      "(4) a corrupted partial download from an earlier attempt — use 'Clear cache & retry' below. " +
      "Full error details were logged to the browser console."
    );
  }

  if (/WindowSizeConfigurationError|context_window_size.*sliding_window_size/i.test(message)) {
    return (
      `The on-device model's own configuration is invalid for this WebLLM version: ${message}${whereItFailed} ` +
      "This is a bug in the model's shipped config (both context_window_size and " +
      "sliding_window_size are set positive, which is not allowed) — not a network, " +
      "storage, or GPU problem on this machine. If you see this after changing the " +
      "model ID, that model needs a chatOpts override (e.g. { sliding_window_size: -1 }) " +
      "passed to CreateMLCEngine, same as the current model. Full error details were " +
      "logged to the browser console."
    );
  }

  if (/webgpu|gpu|device|adapter|shader/i.test(message)) {
    return (
      `The model downloaded successfully, but the on-device engine failed to initialize.${whereItFailed} ` +
      `Raw error: "${message}". This usually means WebGPU itself is unavailable or unstable in this ` +
      "browser/tab right now (not a caching or network problem) — check chrome://gpu for WebGPU status, " +
      "try closing other GPU-heavy tabs, or try a fresh tab/window. Full error details (including the " +
      "stack trace) were logged to the browser console — check DevTools for the exact failure."
    );
  }

  return (
    `Failed to load the on-device model: ${message}${whereItFailed} ` +
    "Full error details were logged to the browser console."
  );
}

/**
 * Minimal shape of the browser's global CacheStorage — declared locally rather
 * than pulling the DOM lib into this package's tsconfig (core targets Node-safe
 * output; mobile/Metro must never need DOM types to consume this package).
 */
interface CacheStorageLike {
  keys(): Promise<string[]>;
  delete(key: string): Promise<boolean>;
}

/**
 * Clears WebLLM's Cache Storage entries so a corrupted/partial download doesn't
 * permanently block future load attempts. Safe to call even if nothing is cached,
 * and safe to call outside a browser (no-ops).
 */
export async function clearWebLlmCache(): Promise<void> {
  const globalCaches = (globalThis as { caches?: CacheStorageLike }).caches;
  if (!globalCaches) return;
  const keys = await globalCaches.keys();
  await Promise.all(
    keys
      .filter((key) => key.toLowerCase().includes("webllm") || key.toLowerCase().includes("mlc"))
      .map((key) => globalCaches.delete(key)),
  );
}

export interface StorageQuotaCheck {
  /** false when the Storage API isn't available (e.g. non-browser, older Safari). */
  available: boolean;
  usageMB?: number;
  quotaMB?: number;
  remainingMB?: number;
  /** true when remaining quota looks too tight for a model of the given size. */
  likelyInsufficient?: boolean;
}

interface StorageManagerLike {
  estimate(): Promise<{ usage?: number; quota?: number }>;
}

/**
 * Best-effort check of the browser's Storage API quota (tied to free disk
 * space) against a model's approximate required size, so a likely-to-fail
 * download can be flagged BEFORE spending minutes downloading — this is the
 * proactive counterpart to describeWebLlmLoadError's after-the-fact diagnosis.
 * Always resolves (never throws) since it's advisory only.
 */
export async function checkStorageQuota(requiredMB: number): Promise<StorageQuotaCheck> {
  const storage = (globalThis as { navigator?: { storage?: StorageManagerLike } }).navigator?.storage;
  if (!storage) return { available: false };
  try {
    const { usage = 0, quota = 0 } = await storage.estimate();
    const usageMB = usage / (1024 * 1024);
    const quotaMB = quota / (1024 * 1024);
    const remainingMB = quotaMB - usageMB;
    // Require some headroom beyond the raw model size — decompression buffers,
    // the wasm runtime, and other site data all share the same quota.
    const likelyInsufficient = remainingMB < requiredMB * 1.3;
    return { available: true, usageMB, quotaMB, remainingMB, likelyInsufficient };
  } catch {
    return { available: false };
  }
}
