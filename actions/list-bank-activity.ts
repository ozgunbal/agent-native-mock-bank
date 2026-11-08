import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { listActivity, requireOwner } from "../server/lib/bank.js";
import { ActivityEntrySchema } from "../server/lib/bank-schemas.js";

export default defineAction({
  description:
    "Read the signed-in user's Mock Bank activity, newest first: every agent proposal (on-device or cloud) with its policy decision, every Confirm/Cancel the user answered, and every submitted transfer or payment with who drove it. Use it to answer 'what did you do?' or to explain a past decision.",
  schema: z.object({
    limit: z.coerce.number().int().min(1).max(200).default(50).describe("How many entries to return"),
  }),
  outputSchema: z.object({ entries: z.array(ActivityEntrySchema) }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ limit }, ctx) => ({ entries: await listActivity(requireOwner(ctx), limit) }),
});
