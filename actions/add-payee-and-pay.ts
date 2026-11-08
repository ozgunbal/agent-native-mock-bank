import { defineAction } from "@agent-native/core/action";
import { evaluateIntent } from "@web-ai/core";
import { z } from "zod";

import { addPayeeAndPay, auditSource, recordAudit, requireOwner } from "../server/lib/bank.js";
import { amount, submitActor, policyNeedsApproval, WriteResultSchema } from "../server/lib/bank-schemas.js";

const toIntent = (args: { payeeName: string; payeeAccountRef: string; amount: number }) => ({
  type: "add_payee_and_pay" as const,
  rawInputSummary: "",
  ...args,
});

export default defineAction({
  description:
    "Add a new payee and pay them. Called by the Pay form's new-payee submit button; agents propose this with propose-intent instead (policy always blocks it for agents).",
  schema: z.object({
    payeeName: z.string().min(1).describe("New payee's display name"),
    payeeAccountRef: z.string().min(1).describe("New payee's external account reference"),
    fromAccountId: z.string().describe("Account id to pay from"),
    amount,
    actor: submitActor,
  }),
  outputSchema: WriteResultSchema,
  agentTool: false,
  needsApproval: (args) => policyNeedsApproval(toIntent(args)),
  run: async (args, ctx) => {
    const owner = requireOwner(ctx);
    const { id } = await addPayeeAndPay(owner, args);
    const { decision, matchedRule } = evaluateIntent(toIntent(args));
    await recordAudit(owner, {
      source: auditSource("submit", args.actor),
      intentType: "add_payee_and_pay",
      decision,
      ruleId: matchedRule.id,
      detail: `${args.amount} to new payee ${args.payeeName} from ${args.fromAccountId}`,
    });
    return { id, message: `Added ${args.payeeName} and paid ${args.amount} USD.` };
  },
});
