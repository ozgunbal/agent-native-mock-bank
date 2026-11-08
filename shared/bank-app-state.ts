/** Tab-scoped app-state keys shared by Mock Bank actions and the bank screen. */

/** A cloud-agent proposal waiting for the bank screen to run it (written by propose-intent). */
export const AGENT_INTENT_KEY = "agent-intent";

/** Which Mock Bank screen the tab is showing, so the server agent can see it (read by view-screen). */
export const BANK_SCREEN_KEY = "bank-screen";

/** Agents that propose through propose-intent: the app's own agent, or one connected over MCP/CLI. */
export type ProposingAgent = "cloud-agent" | "external-agent";

/** A proposal older than this is dropped unrun, so a request never executes long after it was made. */
export const AGENT_INTENT_TTL_MS = 2 * 60 * 1000;

export type AgentIntentCommand = {
  _writeId: string;
  userText: string;
  intent: unknown;
  /** Who proposed it. Older commands without it came from the app's own agent. */
  actor?: ProposingAgent;
  /** Epoch ms when propose-intent wrote it. */
  createdAt?: number;
};
