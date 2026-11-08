import type { AgentMessage } from "./useAgentSession";

export function IntentPreview({ message }: { message: AgentMessage }) {
  if (!message.intent) return null;
  return (
    <>
      {message.decision ? (
        <span className={`decision-badge ${message.decision}`}>
          {message.decision === "allow" ? "✓ allowed" : message.decision === "confirm" ? "◐ needs confirm" : "✕ blocked"}
        </span>
      ) : null}
      <details className="intent-preview" data-testid={`intent-preview-${message.id}`}>
        <summary>
          {message.intent.type} · view parsed intent
        </summary>
        <pre>{JSON.stringify(message.intent, null, 2)}</pre>
        {message.matchedRule ? (
          <div style={{ marginTop: 6, color: "var(--color-text-faint)" }}>
            rule: {message.matchedRule.id} — {message.matchedRule.reason}
          </div>
        ) : null}
      </details>
    </>
  );
}
