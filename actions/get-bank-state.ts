import { defineAction } from "@agent-native/core/action";
import { z } from "zod";

import { loadBankState, requireOwner } from "../server/lib/bank.js";
import { BankStateSchema } from "../server/lib/bank-schemas.js";

export default defineAction({
  description:
    "Read the signed-in user's Mock Bank: accounts (id, name, type, balance in USD), payees (id, name), and transactions (newest first). Use the ids from here when calling propose-intent.",
  schema: z.object({}),
  outputSchema: BankStateSchema,
  http: { method: "GET" },
  readOnly: true,
  run: async (_args, ctx) => loadBankState(requireOwner(ctx)),
});
