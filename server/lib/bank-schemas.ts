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
