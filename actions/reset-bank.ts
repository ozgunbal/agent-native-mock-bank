import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { resetBank, requireOwner } from "../server/lib/bank.js";

export default defineAction({
  description: "Restore the user's Mock Bank to its seed accounts, payees and transactions.",
  schema: z.object({}),
  outputSchema: z.object({ message: z.string() }),
  agentTool: false,
  run: async (_args, ctx) => {
    await resetBank(requireOwner(ctx));
    return { message: "Mock Bank reset to seed data." };
  },
});
