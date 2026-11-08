import type { IntentType } from "@web-ai/core";
import type { Screen } from "./Nav";

/**
 * Which screen owns each intent's [data-agent-action] container. Only one
 * screen is mounted at a time (App.tsx conditionally renders exactly one),
 * so the agent must navigate to the right screen BEFORE executing an intent
 * whose container isn't on the currently-visible screen — otherwise
 * executeIntent() correctly (but unhelpfully) reports
 * `No [data-agent-action="..."] element found on current screen`, even
 * though the intent was parsed and approved correctly. This was a real gap
 * hit live: asking the agent to "show me my accounts" while on a different
 * screen produced exactly that failure.
 *
 * `schedule_recurring_payment` has no screen/UI at all yet — mapped to
 * `null` so callers can detect and report this distinctly rather than
 * silently failing the same way.
 */
export const INTENT_SCREEN_MAP: Record<IntentType, Screen | null> = {
  list_accounts: "accounts",
  get_transactions: "transactions",
  get_total_balance: "accounts",
  transfer_internal: "transfer",
  pay_known_payee: "pay",
  add_payee_and_pay: "pay",
  schedule_recurring_payment: null,
  need_clarification: null, // answered in chat by the grounding step; never navigates
};
