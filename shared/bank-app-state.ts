/** Tab-scoped app-state keys shared by Mock Bank actions and the bank screen. */

/** A cloud-agent proposal waiting for the bank screen to run it (written by propose-intent). */
export const AGENT_INTENT_KEY = "agent-intent";

/** Which Mock Bank screen the tab is showing, so the server agent can see it (read by view-screen). */
export const BANK_SCREEN_KEY = "bank-screen";

export type AgentIntentCommand = {
  _writeId: string;
  userText: string;
  intent: unknown;
};
