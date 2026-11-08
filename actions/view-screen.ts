import { defineAction } from "@agent-native/core/action";
import {
  readAppState,
  readAppStateForCurrentTab,
} from "@agent-native/core/application-state";
import { z } from "zod";

import { BANK_SCREEN_KEY } from "../shared/bank-app-state.js";

export default defineAction({
  description:
    "Read the app's current navigation state, including which Mock Bank screen (accounts, transactions, transfer, pay) the user's tab shows. Basic navigation is already included in <current-screen>; use this action only when you need a fresh read.",
  schema: z.object({}),
  http: false,
  readOnly: true,
  run: async () => {
    const navigation = await readAppState("navigation");
    const bankScreen = await readAppStateForCurrentTab(BANK_SCREEN_KEY);

    const screen: Record<string, unknown> = {};
    if (navigation) screen.navigation = navigation;
    if (bankScreen) screen.bankScreen = bankScreen;

    if (Object.keys(screen).length === 0) {
      return "No application state found. Is the app running?";
    }
    return screen;
  },
});
