import { evaluateIntent, type Intent } from "@web-ai/core";
import { TRANSACTION_CATEGORIES } from "@web-ai/shared";
import { z } from "zod";

export const AccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["checking", "savings"]),
  balance: z.number(),
  currency: z.string(),
});

export const PayeeSchema = z.object({
  id: z.string(),
  name: z.string(),
  accountRef: z.string(),
});

export const TransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  category: z.enum(TRANSACTION_CATEGORIES),
  note: z.string().optional(),
});

export const BankStateSchema = z.object({
  accounts: z.array(AccountSchema),
  transactions: z.array(TransactionSchema),
  payees: z.array(PayeeSchema),
});

export const WriteResultSchema = z.object({
  id: z.string(),
  message: z.string(),
});

export const amount = z.coerce.number().positive().describe("Amount in USD, greater than 0");

/**
 * The same deterministic guardrail the browser runs (packages/core
 * guardrail.ts), used as Agent-Native's approval gate: any call the guardrail
 * would not auto-allow needs a human to approve it — unless it comes from the
 * signed-in user's own UI click, which Agent-Native treats as that approval.
 * This is the second, server-side enforcement layer: an agent, MCP client or
 * CLI caller cannot move money past policy, whatever model produced the call.
 */
export function policyNeedsApproval(intent: Intent): boolean {
  return evaluateIntent(intent).decision !== "allow";
}

/** Who drove a step: the signed-in person, the on-device model, or the cloud agent. */
export const Actor = z.enum(["user", "device-agent", "cloud-agent", "external-agent"]);
export type Actor = z.infer<typeof Actor>;

/**
 * Who pressed submit, as reported by the bank screen (its agents submit the
 * same visible form a person does). Display-only: it labels the activity
 * feed and never changes what the action is allowed to do.
 */
export const submitActor = Actor.default("user").describe("Who drove this submit; activity label only");

export const ActivityKind = z.enum(["proposal", "submit", "confirmed", "cancelled"]);

export const ActivityEntrySchema = z.object({
  id: z.string(),
  createdAt: z.string(),
  actor: Actor,
  kind: ActivityKind,
  intentType: z.string(),
  decision: z.enum(["allow", "confirm", "block"]).nullable(),
  ruleId: z.string().nullable(),
  detail: z.string(),
});
export type ActivityEntry = z.infer<typeof ActivityEntrySchema>;
