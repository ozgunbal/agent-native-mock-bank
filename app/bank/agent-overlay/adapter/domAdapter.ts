import type { IntentType } from "@web-ai/core";

/**
 * Perception: scan the current document for [data-agent-action] containers,
 * per spec section 4.3 — explicit markup instead of raw DOM/accessibility-tree
 * scraping, deliberately, for demo reliability (see README for the disclosed
 * simplification framing).
 */
export function availableActionsOnScreen(root: ParentNode = document): IntentType[] {
  const elements = root.querySelectorAll<HTMLElement>("[data-agent-action]");
  const actions = new Set<IntentType>();
  elements.forEach((el) => {
    const action = el.getAttribute("data-agent-action");
    if (action) actions.add(action as IntentType);
  });
  return Array.from(actions);
}

export function findActionContainer(intentType: IntentType, root: ParentNode = document): HTMLElement | null {
  return root.querySelector<HTMLElement>(`[data-agent-action="${intentType}"]`);
}
