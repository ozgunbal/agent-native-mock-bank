import { defineAction } from "@agent-native/core/action";
import { evaluateIntent } from "@web-ai/core";
import { z } from "zod";

import { payPayee, auditSource, recordAudit, requireOwner } from "../server/lib/bank.js";
import { amount, submitActor, policyNeedsApproval, WriteResultSchema } from "../server/lib/bank-schemas.js";

const toIntent = (args: { payeeId: string; amount: number }) => ({
  type: "pay_known_payee" as const,
  rawInputSummary: "",
  payeeId: args.payeeId,
  amount: args.amount,
});

export default defineAction({
  description:
    "Pay an existing payee from one of the user's accounts. Called by the Pay form's submit button; agents propose payments with propose-intent instead.",
  schema: z.object({
    payeeId: z.string().describe("Existing payee id"),
    fromAccountId: z.string().describe("Account id to pay from"),
    amount,
    actor: submitActor,
  }),
  outputSchema: WriteResultSchema,
  agentTool: false,
  needsApproval: (args) => policyNeedsApproval(toIntent(args)),
  run: async (args, ctx) => {
    const owner = requireOwner(ctx);
    const { id } = await payPayee(owner, args);
    const { decision, matchedRule } = evaluateIntent(toIntent(args));
    await recordAudit(owner, {
      source: auditSource("submit", args.actor),
      intentType: "pay_known_payee",
      decision,
      ruleId: matchedRule.id,
      detail: `${args.amount} to ${args.payeeId} from ${args.fromAccountId}`,
    });
    return { id, message: `Paid ${args.amount} USD.` };
  },
});
