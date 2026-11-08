import { useMemo, useState } from "react";
import { POLICY_RULES, riskTierForIntent } from "@web-ai/core/web";
import type { useAgentSession, AgentMessage } from "../agent-overlay/useAgentSession";
import { PipelineDiagram, type PipelineStage } from "./PipelineDiagram";

const TRY_IT_SUGGESTIONS = [
  "show me my accounts",
  "what's my total balance",
  "transfer $200 from checking to savings",
  "pay Jane Smith $75",
];

/**
 * "Live architecture showcase" — a developer-facing page (not part of the
 * guided tour, which is written for an end-user audience) that DOES the job
 * of the pipeline from inside the page, rather than only documenting it:
 * it has its own command input wired straight to the SAME `session.send()`
 * the chat panel uses, so a developer can trigger a real intent here and
 * watch it move through parsing, the guardrail, and (for allowed intents)
 * real DOM execution on the actual app underneath — the backdrop is
 * intentionally translucent and the panel intentionally doesn't cover the
 * full width, specifically so the real screen navigation and the
 * agent-touched/agent-highlight flashes (see executeIntent.ts) stay visible
 * while this page is open, instead of hiding the very execution being shown.
 *
 * Deliberately shows nothing fabricated: every value here reads from the
 * live `session` (useAgentSession, including the exact parse options it
 * sends) or from the real exported POLICY_RULES — there is no separate
 * "demo data" path.
 */
export function ArchitectureShowcase({
  session,
  onClose,
}: {
  session: ReturnType<typeof useAgentSession>;
  onClose: () => void;
}) {
  const { messages, modelStatus, send, getClassifierPrompt } = session;
  const isReady = modelStatus === "ready";
  const [pending, setPending] = useState(false);

  const lastAgentMessage = useMemo(
    () => [...messages].reverse().find((m): m is AgentMessage & { role: "agent" } => m.role === "agent"),
    [messages],
  );
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((m) => m.role === "user"),
    [messages],
  );

  const stage = deriveActiveStage(lastAgentMessage, modelStatus, pending);

  async function trigger(text: string) {
    if (!isReady || pending) return;
    setPending(true);
    try {
      await send(text);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="showcase-backdrop" role="dialog" aria-label="Live architecture showcase">
      <div className="showcase-panel">
        <div className="showcase-header">
          <div>
            <div className="showcase-eyebrow">For developers</div>
            <h2 className="showcase-title">Live architecture showcase</h2>
            <p className="showcase-subtitle">
              Trigger a real request below — it runs through the actual pipeline (same on-device
              model, same guardrail, same DOM execution as the chat panel) and the app behind this
              panel will really navigate/update. Watch both.
            </p>
          </div>
          <button className="showcase-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div className="showcase-body">
          <section className="showcase-section">
            <h3 className="showcase-section-title">0 · Trigger a real request</h3>
            <TriggerBar isReady={isReady} pending={pending} onSend={trigger} />
          </section>

          <section className="showcase-section">
            <h3 className="showcase-section-title">1 · Pipeline</h3>
            <PipelineDiagram activeStage={stage} />
          </section>

          <section className="showcase-section">
            <h3 className="showcase-section-title">2 · Latest turn</h3>
            {!lastUserMessage ? (
              <div className="showcase-empty">
                No turns yet — trigger a request above (or in the chat panel) and it'll appear
                here.
              </div>
            ) : (
              <LatestTurn userMessage={lastUserMessage} agentMessage={lastAgentMessage} />
            )}
          </section>

          <section className="showcase-section">
            <h3 className="showcase-section-title">3 · Prompt sent to the on-device LLM (step 1 of 2)</h3>
            <p className="showcase-section-note">
              Two model calls per message (<code>core/src/two-stage.ts</code>, "v4"). Step 1, below
              verbatim, only picks the action, constrained to a fixed list. Step 2 extracts just that
              action's details, with account and payee ids limited to your real ones. Code then
              decides whether anything is missing and checks every value against your own words.
            </p>
            <pre className="showcase-code-block">{getClassifierPrompt()}</pre>
          </section>

          <section className="showcase-section">
            <h3 className="showcase-section-title">4 · Guardrail policy table</h3>
            <p className="showcase-section-note">
              Deterministic, no LLM call. First matching rule (in array order) wins; no match
              fails safe to <code>block</code>. Real data from <code>core/src/policy.config.ts</code>.
            </p>
            <div className="policy-table-wrap">
              <table className="policy-table">
                <thead>
                  <tr>
                    <th>Rule id</th>
                    <th>Applies to</th>
                    <th>Decision</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {POLICY_RULES.map((rule) => (
                    <tr
                      key={rule.id}
                      className={lastAgentMessage?.matchedRule?.id === rule.id ? "policy-row-matched" : ""}
                    >
                      <td className="policy-cell-id">{rule.id}</td>
                      <td>
                        {rule.appliesTo.map((t) => (
                          <span key={t} className="policy-intent-pill">
                            {t}
                          </span>
                        ))}
                      </td>
                      <td>
                        <span className={`decision-badge ${rule.decision}`}>{rule.decision}</span>
                      </td>
                      <td className="policy-cell-reason">{rule.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="showcase-section">
            <h3 className="showcase-section-title">5 · Recent turns (risk tier + timing)</h3>
            <div className="turn-log">
              {messages
                .filter((m) => m.role === "agent")
                .slice(-8)
                .reverse()
                .map((m) => (
                  <div key={m.id} className="turn-log-row">
                    <span className={`decision-badge ${m.decision ?? "block"}`}>
                      {m.decision ?? (m.rejected ? "reject" : "—")}
                    </span>
                    <span className="turn-log-type">{m.intent?.type ?? "(unparsed)"}</span>
                    <span className="turn-log-tier">
                      {m.intent ? riskTierForIntent(m.intent.type) : ""}
                    </span>
                    {m.retriesUsed !== undefined ? (
                      <span className="turn-log-retries">{m.retriesUsed === 0 ? "1st try" : `+${m.retriesUsed} retry`}</span>
                    ) : null}
                    {m.elapsedMs !== undefined ? (
                      <span className="turn-log-time">{(m.elapsedMs / 1000).toFixed(1)}s</span>
                    ) : null}
                  </div>
                ))}
              {messages.filter((m) => m.role === "agent").length === 0 ? (
                <div className="showcase-empty">No turns recorded yet this session.</div>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LatestTurn({
  userMessage,
  agentMessage,
}: {
  userMessage: AgentMessage;
  agentMessage: (AgentMessage & { role: "agent" }) | undefined;
}) {
  return (
    <div className="latest-turn">
      <div className="latest-turn-col">
        <div className="latest-turn-label">User input</div>
        <div className="showcase-code-block">{userMessage.text}</div>
      </div>

      <div className="latest-turn-col">
        <div className="latest-turn-label">Raw model output (on-device LLM)</div>
        {agentMessage?.rawModelOutputs?.length ? (
          <pre className="showcase-code-block">
            {agentMessage.rawModelOutputs[agentMessage.rawModelOutputs.length - 1]}
          </pre>
        ) : (
          <div className="showcase-empty">No raw output captured for this turn.</div>
        )}
      </div>

      <div className="latest-turn-col">
        <div className="latest-turn-label">Parsed &amp; validated intent (zod)</div>
        {agentMessage?.intent ? (
          <pre className="showcase-code-block">{JSON.stringify(agentMessage.intent, null, 2)}</pre>
        ) : (
          <div className="showcase-empty">Rejected before a valid Intent was produced.</div>
        )}
      </div>

      <div className="latest-turn-col">
        <div className="latest-turn-label">Guardrail verdict</div>
        {agentMessage?.matchedRule ? (
          <div className="verdict-card">
            <span className={`decision-badge ${agentMessage.decision}`}>{agentMessage.decision}</span>
            <div className="verdict-reason">{agentMessage.matchedRule.reason}</div>
            <div className="verdict-rule-id">rule: {agentMessage.matchedRule.id}</div>
          </div>
        ) : (
          <div className="showcase-empty">No policy rule evaluated (parse failed before reaching the guardrail).</div>
        )}
      </div>

      <div className="latest-turn-col">
        <div className="latest-turn-label">Result</div>
        <div className="showcase-code-block">{agentMessage?.text ?? "(waiting…)"}</div>
      </div>
    </div>
  );
}

function deriveActiveStage(
  lastAgentMessage: (AgentMessage & { role: "agent" }) | undefined,
  modelStatus: ReturnType<typeof useAgentSession>["modelStatus"],
  pending: boolean,
): PipelineStage {
  if (modelStatus !== "ready") return "model";
  // A request is in flight right now (triggered from this page) — light the
  // parser stage immediately rather than waiting for the LAST turn's stale
  // state, since that's what's actually happening at this instant.
  if (pending) return "parse";
  if (!lastAgentMessage) return "input";
  if (!lastAgentMessage.intent) return "parse";
  if (!lastAgentMessage.decision) return "parse";
  if (lastAgentMessage.decision === "block") return "guardrail";
  if (lastAgentMessage.decision === "confirm" && lastAgentMessage.pendingConfirm) return "guardrail";
  return "execute";
}

/**
 * The showcase's own trigger — calls `session.send` directly, the SAME
 * function ChatInput's form calls, so this page doesn't just describe the
 * pipeline, it runs it. Suggestions double as one-click reproductions of the
 * documented policy rules below (a small amount auto-allows, a large amount
 * needs confirm, a first-time payee gets blocked, etc.).
 */
function TriggerBar({
  isReady,
  pending,
  onSend,
}: {
  isReady: boolean;
  pending: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const disabled = !isReady || pending;

  return (
    <div className="trigger-bar">
      <form
        className="trigger-bar-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!text.trim() || disabled) return;
          onSend(text.trim());
          setText("");
        }}
      >
        <input
          className="trigger-bar-input"
          value={text}
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          placeholder={isReady ? "Try a request, e.g. \"show me my accounts\"…" : "Waiting for the on-device model…"}
          aria-label="architecture-showcase-trigger-input"
        />
        <button className="trigger-bar-submit" type="submit" disabled={disabled}>
          {pending ? "Running…" : "Run through pipeline"}
        </button>
      </form>
      <div className="trigger-bar-suggestions">
        {TRY_IT_SUGGESTIONS.map((s) => (
          <button key={s} className="suggestion-chip" disabled={disabled} onClick={() => onSend(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
