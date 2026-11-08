import type { Intent } from "@web-ai/core";
import { findActionContainer } from "./domAdapter";

export interface ExecuteResult {
  ok: boolean;
  reason?: string;
}

/**
 * How long the agent-driven highlight stays on screen after an allowed intent
 * executes, in ms. Long enough to actually notice on a live demo (a flash on a
 * fast auto-execute is easy to miss entirely) without lingering so long it
 * looks stuck or gets confused for a human's own focus/hover state.
 */
const HIGHLIGHT_DURATION_MS = 2500;

/**
 * How long filled-in fields stay visible before the agent presses submit.
 * Filling and submitting in the same tick meant the user never saw what the
 * agent typed: the forms reset their own state after a successful submit
 * (TransferForm, PayPayeeForm), so the amount input went from "" to "" with
 * the real value existing for less than one frame. Observed live.
 */
export const SUBMIT_DELAY_MS = 900;

/**
 * Marks the elements an ALLOWED intent actually touched so it's visually
 * obvious this came from the agent, not a human clicking around — a distinct
 * color from the browser's native focus ring (which still means "a human just
 * interacted with this") and from hover states. Two cases:
 *  - Fields the agent filled + the submit it clicked (`agent-touched`) — a
 *    genuine state change.
 *  - Read-only/display actions with no fields to fill (list_accounts,
 *    get_transactions, get_total_balance) — nothing to mark per-field, so the
 *    whole container is framed (`agent-highlight`) as "look here, this is
 *    what answers your request."
 * Classes are removed after HIGHLIGHT_DURATION_MS so they don't accumulate
 * across turns or get mistaken for permanent UI state.
 */
function flashAgentTouched(elements: Element[]): void {
  for (const el of elements) {
    el.classList.add("agent-touched");
  }
  setTimeout(() => {
    for (const el of elements) {
      el.classList.remove("agent-touched");
    }
  }, HIGHLIGHT_DURATION_MS);
}

function flashAgentHighlight(container: Element): void {
  container.classList.add("agent-highlight");
  setTimeout(() => container.classList.remove("agent-highlight"), HIGHLIGHT_DURATION_MS);
}

/**
 * Execution: given an approved Intent, locate the matching [data-agent-action]
 * container, fill [data-agent-field] elements via real DOM interaction (native
 * setter + dispatched input/change events, so React's controlled-input state
 * notices the change), then click [data-agent-submit]. Per spec 4.3: this is a
 * real DOM interaction, not a hidden backend call — the UI visibly updates.
 *
 * On success, also visually flags what the agent just did (see
 * flashAgentTouched/flashAgentHighlight above) so a human watching the screen
 * can immediately tell it was the agent, not them, and where to look.
 *
 * Fields are filled and highlighted first, then the submit is pressed after
 * `submitDelayMs` (see SUBMIT_DELAY_MS), the way a person would review a form
 * before pressing the button.
 */
export async function executeIntent(
  intent: Intent,
  root: ParentNode = document,
  { submitDelayMs = SUBMIT_DELAY_MS }: { submitDelayMs?: number } = {},
): Promise<ExecuteResult> {
  const container = findActionContainer(intent.type, root);
  if (!container) {
    return { ok: false, reason: `No [data-agent-action="${intent.type}"] element found on current screen.` };
  }

  const fieldEntries = Object.entries(intent).filter(([key]) => key !== "type" && key !== "rawInputSummary");

  const touchedFields: HTMLElement[] = [];
  for (const [fieldName, value] of fieldEntries) {
    if (value === undefined) continue;
    const field = container.querySelector<HTMLInputElement | HTMLSelectElement>(
      `[data-agent-field="${fieldName}"]`,
    );
    if (!field) continue; // optional/filter fields may not exist on every screen
    setNativeValue(field, String(value));
    touchedFields.push(field);
  }

  const submit = container.querySelector<HTMLElement>(`[data-agent-submit="${intent.type}"]`);
  if (submit) {
    flashAgentTouched(touchedFields);
    if (submitDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, submitDelayMs));
    if (!submit.isConnected) {
      return { ok: false, reason: "The form was closed before the agent could submit it. Nothing was executed." };
    }
    flashAgentTouched([submit]);
    submit.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    return { ok: true };
  }

  // Read-only actions (list_accounts, get_transactions, get_total_balance)
  // have no submit button — the container itself represents the
  // already-visible answer, so highlight the whole card instead of individual
  // fields (there may be none touched at all, e.g. an unfiltered
  // get_total_balance).
  if (touchedFields.length > 0) {
    flashAgentTouched(touchedFields);
  }
  flashAgentHighlight(container as Element);
  return { ok: true };
}

/**
 * React tracks input values via an internal instance property set through the
 * native property descriptor's setter. Setting `.value` directly does not
 * trigger React's synthetic event system, so we call the native setter first,
 * then dispatch a real `input` event — the standard "React-controlled-input
 * safe" pattern for programmatic value changes.
 */
function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLSelectElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  const nativeSetter = descriptor?.set;
  if (nativeSetter) {
    nativeSetter.call(element, value);
  } else {
    element.value = value;
  }
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
