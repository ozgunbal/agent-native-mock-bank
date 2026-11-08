import { parseIntent, type EngineClient } from "../intent-parser";
import type { EvalCase } from "./cases";
import type { PromptVariant } from "./prompts";
import { scoreCase, type EvalRecord } from "./scoring";

export interface RunMeta {
  runId: string;
  platform: EvalRecord["platform"];
  engine: string;
  modelId: string;
  modelLoadMs: number | null;
  /** Read after each case so per-call token counts / tokens-per-second land in the record. */
  readUsage?: () => unknown;
}

/**
 * Runs one case through the real parseIntent path and scores it. Never
 * throws: an engine crash mid-run becomes an `engine_error` record, because a
 * model that crashes on some inputs is itself a result worth showing.
 */
export async function runEvalCase(
  engine: EngineClient,
  evalCase: EvalCase,
  variant: PromptVariant,
  meta: RunMeta,
): Promise<EvalRecord> {
  const base = {
    runId: meta.runId,
    timestamp: new Date().toISOString(),
    platform: meta.platform,
    engine: meta.engine,
    modelId: meta.modelId,
    promptVariant: variant.id,
    caseId: evalCase.id,
    category: evalCase.category,
    text: evalCase.text,
    modelLoadMs: meta.modelLoadMs,
  };
  const startedAt = Date.now();
  try {
    const result = variant.parse
      ? await variant.parse(engine, evalCase.text)
      : await parseIntent(engine, evalCase.text, variant.options);
    return {
      ...base,
      ...scoreCase(evalCase, {
        ok: result.ok,
        intent: result.ok ? result.intent : null,
        retriesUsed: result.retriesUsed,
        attempts: result.attempts,
      }),
      intent: result.ok ? result.intent : null,
      retriesUsed: result.retriesUsed,
      totalLatencyMs: Date.now() - startedAt,
      usage: meta.readUsage?.() ?? null,
    };
  } catch (err) {
    return {
      ...base,
      verdict: "engine_error",
      pass: false,
      slotIssues: [],
      grounding: null,
      guardrailDecision: null,
      firstAttemptOk: false,
      attempts: [],
      grounded: { status: "parse_failed", verdict: "engine_error", pass: false, slotIssues: [], guardrailDecision: null },
      intent: null,
      retriesUsed: 0,
      totalLatencyMs: Date.now() - startedAt,
      usage: null,
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}
