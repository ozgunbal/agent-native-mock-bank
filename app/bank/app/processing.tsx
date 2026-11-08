import { useRef, useState } from "react";

/**
 * Simulated processing time for a money movement (transfer or payment), so
 * the submit button visibly shows a loading state, and can't be pressed
 * twice, before a toast confirms the result.
 */
export const PROCESSING_MS = 1200;

export const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export const formatAmount = (amount: number) => `USD ${amount.toFixed(2)}`;

/**
 * `busy` drives the button; the ref guards against two submits in the same
 * tick, before the re-render that disables the button.
 */
export function useProcessing() {
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const start = () => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    return true;
  };
  const finish = () => {
    inFlight.current = false;
    setBusy(false);
  };
  return { busy, start, finish };
}

export function SubmitButton({
  busy,
  label,
  busyLabel,
  agentSubmit,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
  agentSubmit: string;
}) {
  return (
    <button type="submit" className="btn-primary" data-agent-submit={agentSubmit} disabled={busy} aria-busy={busy}>
      {busy && <span className="btn-spinner" aria-hidden="true" />}
      {busy ? busyLabel : label}
    </button>
  );
}
