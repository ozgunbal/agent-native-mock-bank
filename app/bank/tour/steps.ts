export type Screen = "accounts" | "transactions" | "transfer" | "pay";

export interface TourStep {
  /** data-tour attribute value to highlight. */
  target: string;
  /** Screen to switch to before showing this step, if any. */
  screen?: Screen;
  title: string;
  body: string;
  /** If set, the tour sends this text into the agent chat when the user hits Next. */
  sendToAgent?: string;
  /** Screen to switch to right after sending the agent message (e.g. to reveal the result). */
  screenAfter?: Screen;
  /** Roughly where to place the tooltip card relative to the highlighted element. */
  placement?: "right" | "left" | "bottom" | "top";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: "nav",
    screen: "accounts",
    title: "Welcome to the mock bank",
    body: "This is an ordinary banking UI — accounts, transactions, transfers, payments. Use this nav to move between screens, same as any app.",
    placement: "bottom",
  },
  {
    target: "accounts-screen",
    screen: "accounts",
    title: "The agent can read this",
    body: "Every screen tagged for the agent is marked explicitly (data-agent-action) — no guessing at the page's structure. This screen is 'list_accounts': read-only, always safe.",
    placement: "right",
  },
  {
    target: "agent-panel",
    screen: "accounts",
    title: "Meet the agent",
    body: "This chat panel is the whole interface for agent usage. Ask it to look something up or move money, in plain language. Let's try it live.",
    placement: "left",
  },
  {
    target: "agent-panel",
    screen: "accounts",
    title: "Step 1 — a safe, read-only ask",
    body: "Watch what happens when you ask a read-only question. The agent parses it, checks it against policy, and since nothing changes, it just answers — no confirmation needed.",
    sendToAgent: "show me my accounts",
    placement: "left",
  },
  {
    target: "agent-panel",
    screen: "accounts",
    title: "Step 2 — a small transfer",
    body: "Now a transfer under $1,000. Policy allows this to auto-execute — watch the Transfer screen update live once you continue.",
    sendToAgent: "transfer $200 from checking to savings",
    screenAfter: "transfer",
    placement: "left",
  },
  {
    target: "transfer-screen",
    screen: "transfer",
    title: "It really moved the money",
    body: "The agent didn't just say it did this — it filled in this exact form and submitted it, the same way you would. Nothing happens behind a hidden API call.",
    placement: "top",
  },
  {
    target: "agent-panel",
    screen: "transfer",
    title: "Step 3 — a large transfer needs you",
    body: "This one is over the $1,000 threshold. Policy requires an explicit confirmation before anything moves — the agent will show a Confirm / Cancel card, not just do it.",
    sendToAgent: "transfer $5000 from checking to savings",
    placement: "left",
  },
  {
    target: "agent-panel",
    screen: "transfer",
    title: "Step 4 — a blocked action",
    body: "Paying a brand-new payee immediately is never auto-approved, no matter how you phrase it in chat. Watch the agent refuse this outright.",
    sendToAgent: "add a new payee named Alex and pay them $500",
    placement: "left",
  },
  {
    target: "transactions-screen",
    screen: "transactions",
    title: "One more thing: prompt injection",
    body: "See the highlighted transaction below with an embedded note? It contains hidden text trying to redirect a payment. Ask the agent to summarize your transactions and see what happens.",
    placement: "top",
  },
  {
    target: "agent-panel",
    screen: "transactions",
    title: "Step 5 — the injection has nowhere to go",
    body: "The agent can only ever produce one of a fixed set of actions. Even if it reads that note, there's no path from 'read a transaction' to 'send money' — the schema itself is the security boundary.",
    sendToAgent: "summarize my recent transactions",
    placement: "left",
  },
  {
    target: "agent-panel",
    screen: "transactions",
    title: "That's the tour",
    body: "You've seen: read-only auto-allow, small transfers auto-allow, large transfers need confirmation, new payees are always blocked, and injected content can't hijack an action. Explore freely from here.",
    placement: "left",
  },
];
