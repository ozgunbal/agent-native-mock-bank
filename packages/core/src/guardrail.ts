import type { Intent } from "./schema/intent";
import type { Decision, PolicyRule } from "./schema/policy";
import { POLICY_RULES, RULE_PREDICATES } from "./policy.config";

export interface GuardrailResult {
  decision: Decision;
  matchedRule: PolicyRule;
}

const NO_MATCHING_POLICY_RULE: PolicyRule = {
  id: "no-matching-policy-fail-safe",
  appliesTo: [],
  condition: "no policy rule matched this intent type",
  decision: "block",
  reason:
    "No policy rule matches this intent — failing safe to block rather than defaulting to allow.",
};

/**
 * Pure function: Intent -> Decision. No LLM call — deterministic and testable.
 *
 * Resolution order: iterate POLICY_RULES in array order, first rule where
 * appliesTo includes the intent's type AND the rule's predicate (see
 * RULE_PREDICATES in policy.config.ts) returns true. First match wins.
 *
 * If nothing matches, fail safe to "block" — never default-allow.
 */
export function evaluateIntent(intent: Intent): GuardrailResult {
  for (const rule of POLICY_RULES) {
    if (!rule.appliesTo.includes(intent.type)) continue;
    const predicate = RULE_PREDICATES[rule.id];
    if (!predicate) continue; // rule with no predicate can never match — treated as inert
    if (predicate(intent)) {
      return { decision: rule.decision, matchedRule: rule };
    }
  }
  return { decision: NO_MATCHING_POLICY_RULE.decision, matchedRule: NO_MATCHING_POLICY_RULE };
}
