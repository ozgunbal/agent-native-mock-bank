import { z } from "zod";

// Fixed, closed set of actions. The agent can NEVER propose an action
// outside this enum — that closed set IS the security boundary.
export const IntentType = z.enum([
  "list_accounts",
  "get_transactions",
  "get_total_balance", // sum of balances across accounts — "total assets", "how much do I have saved", etc.
  "transfer_internal", // between the user's own accounts
  "pay_known_payee", // existing, previously-used payee
  "add_payee_and_pay", // first-time payee — always high risk
  "schedule_recurring_payment",
  "need_clarification", // the model's way to say "a required detail is missing" instead of inventing it
]);
export type IntentType = z.infer<typeof IntentType>;

export const RiskTier = z.enum(["read_only", "bounded", "high_risk"]);
export type RiskTier = z.infer<typeof RiskTier>;

/**
 * A positive number, but tolerant of a small local model emitting it as a
 * numeric string (e.g. `"200"` instead of `200`) — a common, cosmetic
 * near-miss for quantized models against a strict schema. `z.coerce.number()`
 * still requires a genuinely numeric value (coercing `"abc"` fails just like
 * before) and `.positive()` still rejects zero/negative amounts — this does
 * NOT loosen the actual security boundary (closed intent-type enum, required
 * account/payee reference fields), it only tolerates a string-vs-number
 * formatting quirk in an otherwise-valid amount.
 */
const amountField = z.coerce.number().positive();

/**
 * GAP (spec section 3.1 says only "add GetTransactions, ScheduleRecurring similarly"
 * without giving field shapes). This schema is this implementation's interpretation,
 * documented in docs/implementation-log/phase-1-schemas-guardrail.md.
 *
 * All filters are optional — "show me my recent transactions" has no required slots.
 *
 * `rawInputSummary` is optional with an empty-string default: we ask the model to
 * echo back a short paraphrase of the user's request for the audit log, but small
 * local models frequently omit fields not central to the "action" itself even when
 * explicitly instructed — that omission is cosmetic and must not fail an otherwise
 * well-formed, correctly-typed intent. The actual audit log still has the real raw
 * user text available separately (see AuditLog.recordParsed's `rawInput` param).
 */
const baseIntent = z.object({
  type: IntentType,
  rawInputSummary: z.string().default(""),
});

export const ListAccountsIntent = baseIntent.extend({
  type: z.literal("list_accounts"),
});

export const GetTransactionsIntent = baseIntent.extend({
  type: z.literal("get_transactions"),
  accountId: z.string().optional(),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  query: z.string().optional(),
});

/**
 * ADDED INTENT (not in spec) — sums account balances. `accountType` is an
 * optional filter so "total savings"/"savings sum" only sums savings
 * accounts, "total checking" only checking, and omitting it (e.g. "total
 * assets", "how much money do I have in total") sums every account — same
 * shape covers all three phrasings the user asked for ("total amount",
 * "total assets", "saving sum") without needing separate intent types.
 */
export const GetTotalBalanceIntent = baseIntent.extend({
  type: z.literal("get_total_balance"),
  accountType: z.enum(["checking", "savings"]).optional(),
});

export const TransferInternalIntent = baseIntent.extend({
  type: z.literal("transfer_internal"),
  fromAccountId: z.string(),
  toAccountId: z.string(),
  amount: amountField,
  currency: z.string().default("USD"),
});

export const PayKnownPayeeIntent = baseIntent.extend({
  type: z.literal("pay_known_payee"),
  payeeId: z.string(),
  amount: amountField,
});

export const AddPayeeAndPayIntent = baseIntent.extend({
  type: z.literal("add_payee_and_pay"),
  payeeName: z.string(),
  payeeAccountRef: z.string(),
  amount: amountField,
});

/**
 * GAP (spec section 3.1): field shapes are this implementation's interpretation —
 * spec only names the intent type in the IntentType enum ("schedule_recurring_payment")
 * and says "add ... similarly", without defining fields.
 */
export const ScheduleRecurringPaymentIntent = baseIntent.extend({
  type: z.literal("schedule_recurring_payment"),
  payeeId: z.string(),
  amount: amountField,
  currency: z.string().default("USD"),
  frequency: z.enum(["weekly", "biweekly", "monthly"]),
  startDate: z.string(),
});

/**
 * ADDED INTENT (v3) — without it the schema has no legal way to express
 * "the user didn't say how much", so a model (especially under constrained
 * decoding, which forces a schema-valid answer) has to invent an amount.
 * Measured: see evidence/REPORT.md, ambiguous-case "invented slots".
 */
export const NeedClarificationIntent = baseIntent.extend({
  type: z.literal("need_clarification"),
  missing: z.array(z.string()).default([]),
  question: z.string().default(""),
});

const ACTION_INTENTS = [
  ListAccountsIntent,
  GetTransactionsIntent,
  GetTotalBalanceIntent,
  TransferInternalIntent,
  PayKnownPayeeIntent,
  AddPayeeAndPayIntent,
  ScheduleRecurringPaymentIntent,
] as const;

/**
 * The 7 original actions only. Kept separately so the v2 eval variant's JSON
 * schema stays exactly what was measured before need_clarification existed.
 */
export const ActionIntent = z.discriminatedUnion("type", [...ACTION_INTENTS]);

// Discriminated union — this is the ONLY shape the guardrail ever sees.
// Raw user text never reaches the guardrail or the adapters.
export const Intent = z.discriminatedUnion("type", [...ACTION_INTENTS, NeedClarificationIntent]);
export type Intent = z.infer<typeof Intent>;

/**
 * DESIGN DECISION (not literal from spec): the spec defines a `RiskTier` schema
 * (section 3.2) but never wires it onto `Intent` or `PolicyRule`, even though
 * section 4.4 (mobile offline queue) references `riskTier !== "read_only"` as if
 * it's already a property on an intent. We derive risk tier from the intent TYPE
 * in code, rather than trusting a value the model could produce — the security
 * boundary must live in code, not in LLM output.
 */
export function riskTierForIntent(type: IntentType): RiskTier {
  switch (type) {
    case "list_accounts":
    case "get_transactions":
    case "get_total_balance":
    case "need_clarification":
      return "read_only";
    case "transfer_internal":
    case "pay_known_payee":
      return "bounded";
    case "add_payee_and_pay":
    case "schedule_recurring_payment":
      return "high_risk";
  }
}
