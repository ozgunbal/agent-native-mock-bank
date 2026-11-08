import { defineAction } from "@agent-native/core/action";
import { writeAppStateForCurrentTab } from "@agent-native/core/application-state";
import { evaluateIntent, groundIntent, Intent } from "@web-ai/core";
import { z } from "zod";

import { loadBankState, recordAudit, requireOwner } from "../server/lib/bank.js";
import { AGENT_INTENT_KEY, type AgentIntentCommand } from "../shared/bank-app-state.js";

export default defineAction({
  description: `Hand one banking request to the Mock Bank screen the user is looking at. This is the ONLY way to act on the user's bank: the app then runs the same code path as its on-device agent — it grounds the intent against real accounts/payees, applies the policy (allow / confirm / block), switches screen, visibly fills the form, and submits only if policy allows or the user confirms.
Pass the user's exact words as userText, and one intent:
- list_accounts | get_total_balance {accountType?: "checking"|"savings"} | get_transactions {query?, accountId?, fromDate?, toDate?}
- transfer_internal {fromAccountId, toAccountId, amount}
- pay_known_payee {payeeId, amount}
- add_payee_and_pay {payeeName, payeeAccountRef, amount}
- need_clarification {missing: string[], question} when a required detail (e.g. amount) is not in the user's words — never invent amounts or payees.
Use ids from get-bank-state. Returns what the app will do; tell the user that outcome in one short sentence and do not call it again for the same request.`,
  schema: z.object({
    userText: z.string().min(1).describe("The user's request, verbatim"),
    intent: Intent.describe("One structured intent; `type` selects the shape"),
  }),
  outputSchema: z.object({
    status: z.enum(["handed_to_app", "needs_clarification", "rejected"]),
    decision: z.enum(["allow", "confirm", "block"]).nullable(),
    message: z.string(),
  }),
  run: async ({ userText, intent }, ctx) => {
    const owner = requireOwner(ctx);
    const { accounts, payees } = await loadBankState(owner);

    // Preview the same grounding + guardrail the app will re-run in the
    // browser, so the agent can tell the user what is about to happen. The app
    // stays the source of truth: it re-grounds the raw proposal itself.
    const grounding = groundIntent(intent, { accounts, payees }, userText);
    const verdict = grounding.status === "ok" ? evaluateIntent(grounding.intent) : null;

    const command: AgentIntentCommand = {
      _writeId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userText,
      intent,
    };
    await writeAppStateForCurrentTab(AGENT_INTENT_KEY, command);
    await recordAudit(owner, {
      source: "cloud-agent-proposal",
      intentType: intent.type,
      decision: verdict?.decision ?? null,
      ruleId: verdict?.matchedRule.id ?? null,
      detail: grounding.status === "ok" ? userText : `${grounding.status}: ${userText}`,
    });

    if (grounding.status === "needs_clarification") {
      return { status: "needs_clarification" as const, decision: null, message: grounding.question };
    }
    if (grounding.status === "rejected") {
      return { status: "rejected" as const, decision: null, message: `${grounding.reason} Nothing was executed.` };
    }
    const { decision, matchedRule } = verdict!;
    const next =
      decision === "allow"
        ? "The app is filling and submitting it now."
        : decision === "confirm"
          ? "The app is asking the user to confirm before anything runs."
          : "Policy blocked it; nothing will run.";
    return { status: "handed_to_app" as const, decision, message: `${next} (${matchedRule.reason})` };
  },
});
