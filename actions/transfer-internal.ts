import { defineAction } from "@agent-native/core/action";
import { evaluateIntent } from "@web-ai/core";
import { z } from "zod";

import { recordAudit, requireOwner, transferInternal } from "../server/lib/bank.js";
import { amount, policyNeedsApproval, WriteResultSchema } from "../server/lib/bank-schemas.js";

const toIntent = (args: { fromAccountId: string; toAccountId: string; amount: number }) => ({
  type: "transfer_internal" as const,
  rawInputSummary: "",
  currency: "USD",
  ...args,
});

export default defineAction({
  description:
    "Move money between two of the user's own accounts. Called by the Transfer form's submit button; agents propose transfers with propose-intent instead.",
  schema: z.object({
    fromAccountId: z.string().describe("Source account id"),
    toAccountId: z.string().describe("Destination account id"),
    amount,
  }),
  outputSchema: WriteResultSchema,
  agentTool: false,
  needsApproval: (args) => policyNeedsApproval(toIntent(args)),
  run: async (args, ctx) => {
    const owner = requireOwner(ctx);
    const { id } = await transferInternal(owner, args);
    const { decision, matchedRule } = evaluateIntent(toIntent(args));
    await recordAudit(owner, {
      source: "ui-submit",
      intentType: "transfer_internal",
      decision,
      ruleId: matchedRule.id,
      detail: `${args.amount} from ${args.fromAccountId} to ${args.toAccountId}`,
    });
    return { id, message: `Transferred ${args.amount} USD.` };
  },
});
