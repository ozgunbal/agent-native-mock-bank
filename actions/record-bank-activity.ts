import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";

import { auditSource, recordAudit, requireOwner } from "../server/lib/bank.js";

/**
 * Steps that happen only in the browser: the on-device model's proposals
 * (with the decision the shared guardrail gave them) and the user's answers
 * to confirm cards. Cloud proposals and submits are logged by their own
 * actions on the server. Writes only to the caller's own activity feed.
 */
export default defineAction({
  description: "Log a Mock Bank step that happened in the browser to the user's activity feed. Called by the bank screen.",
  schema: z.object({
    kind: z.enum(["proposal", "confirmed", "cancelled"]),
    actor: z.enum(["device-agent", "cloud-agent"]).describe("The agent whose proposal this was"),
    intentType: z.string().max(64),
    decision: z.enum(["allow", "confirm", "block"]).nullable().default(null),
    ruleId: z.string().max(128).nullable().default(null),
    detail: z.string().max(500),
  }),
  outputSchema: z.object({ ok: z.literal(true) }),
  agentTool: false,
  run: async ({ kind, actor, ...entry }, ctx) => {
    // A proposal row is always the device model's; cloud proposals are logged by propose-intent.
    if (kind === "proposal" && actor !== "device-agent") {
      fail("Cloud proposals are logged by propose-intent.", { statusCode: 400 });
    }
    await recordAudit(requireOwner(ctx), { source: auditSource(kind, actor), ...entry });
    return { ok: true as const };
  },
});
