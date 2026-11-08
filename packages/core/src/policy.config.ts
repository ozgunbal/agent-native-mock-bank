import type { PolicyRule } from "./schema/policy";
import type { Intent } from "./schema/intent";

/**
 * Policy as DATA (spec section 3.3) — easy to show on a slide, easy to reason
 * about live on stage.
 *
 * DESIGN DECISION (not literal from spec): `PolicyRule.condition` is a zod
 * `z.string()` (human-readable, per spec 3.2) but spec 3.3's rules embed real
 * thresholds ("amount <= 1000"). A string can't be evaluated safely. We keep
 * `condition` as pure display text on the validated data, and pair each rule
 * with an executable predicate here, keyed by rule id. This reconciles "policy
 * is data" with "policy needs real threshold logic" without smuggling
 * executable code into the zod-validated PolicyRule itself.
 */
export const POLICY_RULES: PolicyRule[] = [
  {
    id: "read-only-always-allowed",
    appliesTo: ["list_accounts", "get_transactions", "get_total_balance", "need_clarification"],
    condition: "read-only action",
    decision: "allow",
    reason: "No state change — safe to auto-execute.",
  },
  {
    id: "internal-transfer-small-amount",
    appliesTo: ["transfer_internal"],
    condition: "amount <= 1000 AND same owner",
    decision: "allow",
    reason: "Money stays with the same account holder, below threshold.",
  },
  {
    id: "internal-transfer-large-amount",
    appliesTo: ["transfer_internal"],
    condition: "amount > 1000",
    decision: "confirm",
    reason: "Above auto-approval threshold — requires explicit confirmation.",
  },
  {
    id: "known-payee-payment",
    appliesTo: ["pay_known_payee"],
    condition: "payee already exists on account",
    decision: "confirm",
    reason: "Moving money externally always requires confirmation, even to a known payee.",
  },
  {
    id: "new-payee-always-blocked-from-auto",
    appliesTo: ["add_payee_and_pay"],
    condition: "first-time payee",
    decision: "block",
    reason:
      "New payee + immediate payment is never auto-approved — requires out-of-band confirmation, not just an in-chat yes.",
  },
  /**
   * ADDED RULE — not in spec (spec's 5 rules never cover schedule_recurring_payment,
   * which is otherwise a listed IntentType with no matching policy). Without this,
   * a schedule_recurring_payment intent would fall through to the guardrail's
   * fail-safe "block" — which is actually a defensible default, but recurring
   * payment setup is exactly the kind of action a user plausibly wants to be able
   * to approve via confirmation rather than have permanently blocked, so we add an
   * explicit rule rather than relying on the fail-safe.
   */
  {
    id: "recurring-payment-always-confirm",
    appliesTo: ["schedule_recurring_payment"],
    condition: "any recurring payment setup",
    decision: "confirm",
    reason: "Recurring payment authorization — requires explicit confirmation regardless of amount.",
  },
];

/**
 * Executable predicates, keyed by PolicyRule.id. `condition` on the rule itself
 * stays a human-readable string for display; the actual evaluation logic lives
 * here in code, not in zod-validated data.
 */
export const RULE_PREDICATES: Record<string, (intent: Intent) => boolean> = {
  "read-only-always-allowed": () => true,
  "internal-transfer-small-amount": (intent) =>
    intent.type === "transfer_internal" && intent.amount <= 1000,
  "internal-transfer-large-amount": (intent) =>
    intent.type === "transfer_internal" && intent.amount > 1000,
  "known-payee-payment": () => true,
  "new-payee-always-blocked-from-auto": () => true,
  "recurring-payment-always-confirm": () => true,
};
