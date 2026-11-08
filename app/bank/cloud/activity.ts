import { callAction } from "@agent-native/core/client/hooks";

/** Who drove a step, matching the server's Actor enum (server/lib/bank-schemas.ts). */
export type Actor = "user" | "device-agent" | "cloud-agent" | "external-agent";
export type AgentActor = Exclude<Actor, "user">;

/**
 * An agent's submit is the same visible form submit a person makes, and the
 * form only dispatches after its processing delay. The session marks the next
 * submit right before executeIntent clicks it; the store takes the mark when
 * it saves. A mark older than this is stale and the submit counts as the user's.
 */
const MARK_TTL_MS = 5000;
let pendingSubmit: { actor: AgentActor; at: number } | null = null;

export function markNextSubmitBy(actor: AgentActor) {
  pendingSubmit = { actor, at: Date.now() };
}

export function takeSubmitActor(): Actor {
  const mark = pendingSubmit;
  pendingSubmit = null;
  return mark && Date.now() - mark.at < MARK_TTL_MS ? mark.actor : "user";
}

/** Logs a browser-only step (device proposal, confirm, cancel) to the activity feed. Never blocks the UI. */
export function recordActivity(entry: {
  kind: "proposal" | "confirmed" | "cancelled";
  actor: AgentActor;
  intentType: string;
  decision?: "allow" | "confirm" | "block" | null;
  ruleId?: string | null;
  detail: string;
}) {
  void callAction("record-bank-activity", {
    ...entry,
    decision: entry.decision ?? null,
    ruleId: entry.ruleId ?? null,
    detail: entry.detail.slice(0, 500),
  }).catch((err: unknown) => console.warn("[mock-bank] activity not recorded", err));
}
