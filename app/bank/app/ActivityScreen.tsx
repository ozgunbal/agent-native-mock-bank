import { useActionQuery } from "@agent-native/core/client/hooks";

import type { Actor } from "../cloud/activity";
import { useStore } from "../mock-data/store";
import { formatAmount } from "./processing";

type Entry = {
  id: string;
  createdAt: string;
  actor: Actor;
  kind: "proposal" | "submit" | "confirmed" | "cancelled";
  intentType: string;
  decision: "allow" | "confirm" | "block" | null;
  ruleId: string | null;
  detail: string;
};

const ACTOR_LABEL: Record<Actor, string> = {
  user: "You",
  "device-agent": "On-device agent",
  "cloud-agent": "Cloud agent",
};

const INTENT_LABEL: Record<string, string> = {
  list_accounts: "view accounts",
  get_transactions: "view transactions",
  get_total_balance: "check balance",
  transfer_internal: "transfer",
  pay_known_payee: "payment",
  add_payee_and_pay: "new-payee payment",
  schedule_recurring_payment: "recurring payment",
  need_clarification: "question",
};

function headline(e: Entry): string {
  const what = INTENT_LABEL[e.intentType] ?? e.intentType;
  const agent = ACTOR_LABEL[e.actor].toLowerCase();
  switch (e.kind) {
    case "proposal":
      return e.decision === null ? `Asked a question instead of acting (${what})` : `Proposed a ${what}`;
    case "submit":
      return e.actor === "user" ? `Submitted a ${what}` : `Filled and submitted a ${what}`;
    case "confirmed":
      return `You confirmed the ${agent}'s ${what}`;
    case "cancelled":
      return `You cancelled the ${agent}'s ${what}`;
  }
}

function decisionLabel(e: Entry): { tone: string; text: string } | null {
  if (e.kind === "proposal" && e.decision === null) return { tone: "info", text: "needs detail" };
  if (e.kind === "confirmed") return { tone: "allow", text: "approved by you" };
  if (e.kind === "cancelled") return { tone: "block", text: "cancelled" };
  if (!e.decision) return null;
  // A submit only happens after policy allowed it or the user confirmed it.
  if (e.kind === "submit" && e.decision === "confirm") return { tone: "allow", text: "after your confirm" };
  return { tone: e.decision, text: e.decision === "confirm" ? "needs confirm" : e.decision === "allow" ? "allowed" : "blocked" };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : d.toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/**
 * Who did what, from the server's audit log (list-bank-activity): every agent
 * proposal with its policy decision, every answer to a confirm card, and every
 * submit with whoever drove it. The cloud agent reads the same feed.
 */
export function ActivityScreen() {
  const { state } = useStore();
  const { data, error, isLoading } = useActionQuery("list-bank-activity", { limit: 50 }, { refetchInterval: 3000 });
  const entries = (data?.entries ?? []) as Entry[];

  // Audit details keep ids; show the names the user knows.
  const names = new Map<string, string>([
    ...state.accounts.map((a) => [a.id, a.name] as [string, string]),
    ...state.payees.map((p) => [p.id, p.name] as [string, string]),
  ]);
  const readable = (e: Entry) => {
    let text = e.detail.replace(/\b(acc|payee)-[\w-]+/g, (id) => names.get(id) ?? id);
    if (e.kind === "submit") text = text.replace(/^\d+(\.\d+)?/, (n) => formatAmount(Number(n)));
    return e.kind === "submit" ? text : `“${text}”`;
  };

  return (
    <section className="card">
      <h2 className="section-title">Activity</h2>
      <p className="section-subtitle">
        Everything you and both agents did, with the policy decision behind each step. Stored on the server; the cloud
        agent can read it too.
      </p>
      {error && !data ? <p className="activity-empty">Could not load activity. It will retry automatically.</p> : null}
      {isLoading ? <p className="activity-empty">Loading activity…</p> : null}
      {!isLoading && !error && entries.length === 0 ? (
        <p className="activity-empty">No activity yet. Ask either agent to do something, or use a form.</p>
      ) : null}
      <ol className="activity-list">
        {entries.map((e) => {
          const badge = decisionLabel(e);
          const actor = e.kind === "confirmed" || e.kind === "cancelled" ? "user" : e.actor;
          return (
            <li key={e.id} className="activity-row" data-agent-item-id={e.id}>
              <span className={`activity-actor ${actor}`}>{ACTOR_LABEL[actor]}</span>
              <div className="activity-main">
                <span className="activity-headline">{headline(e)}</span>
                <span className="activity-detail">{readable(e)}</span>
              </div>
              <div className="activity-meta">
                {badge ? <span className={`decision-badge ${badge.tone}`}>{badge.text}</span> : null}
                <time dateTime={e.createdAt}>{formatTime(e.createdAt)}</time>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
