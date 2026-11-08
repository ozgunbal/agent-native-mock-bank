import { useEffect, useLayoutEffect, useState } from "react";
import { TOUR_STEPS, type Screen } from "./steps";
import type { AgentOverlayHandle } from "../agent-overlay/AgentOverlay";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function GuidedTour({
  onScreenChange,
  agentHandle,
  onClose,
}: {
  onScreenChange: (s: Screen) => void;
  agentHandle: AgentOverlayHandle | null;
  onClose: () => void;
}) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const step = TOUR_STEPS[stepIndex];

  // Switch screen when a step requires it.
  useEffect(() => {
    if (step?.screen) onScreenChange(step.screen);
  }, [step, onScreenChange]);

  // Measure the target element's position for the highlight box; re-measure on
  // resize/scroll and after screen switches (layout settles a tick later).
  useLayoutEffect(() => {
    if (!step) return;
    const target = step.target;
    let cancelled = false;

    function measure() {
      if (cancelled) return;
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    const raf1 = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step]);

  if (!step) return null;

  const currentStep = step;
  const isLast = stepIndex === TOUR_STEPS.length - 1;

  async function handleNext() {
    if (currentStep.sendToAgent && agentHandle) {
      agentHandle.send(currentStep.sendToAgent);
      // Give the user a moment to see the message land before advancing/switching
      // screens, especially for steps that also change screen right after sending.
      await new Promise((r) => setTimeout(r, 250));
      if (currentStep.screenAfter) onScreenChange(currentStep.screenAfter);
    }
    if (isLast) {
      onClose();
      return;
    }
    setStepIndex((i) => i + 1);
  }

  const cardStyle = rect ? placeCard(rect, step.placement ?? "bottom") : { top: "50%", left: "50%" };

  return (
    <div className="tour-backdrop">
      <div className="tour-scrim" onClick={onClose} />
      {rect ? (
        <div
          className="tour-highlight"
          style={{ top: rect.top - 6, left: rect.left - 6, width: rect.width + 12, height: rect.height + 12 }}
        />
      ) : null}
      <div className="tour-card" style={cardStyle}>
        {step.sendToAgent ? <div className="tour-live-badge">● live in this app</div> : null}
        <div className="tour-step-label">
          Step {stepIndex + 1} of {TOUR_STEPS.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-footer">
          <div className="tour-dots">
            {TOUR_STEPS.map((_, i) => (
              <span key={i} className={`tour-dot${i === stepIndex ? " active" : ""}`} />
            ))}
          </div>
          <div className="tour-actions">
            <button className="tour-btn skip" onClick={onClose}>
              Skip
            </button>
            <button className="tour-btn next" onClick={handleNext}>
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function placeCard(rect: Rect, placement: "right" | "left" | "bottom" | "top") {
  const CARD_WIDTH = 300;
  const GAP = 16;
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;

  let top = rect.top;
  let left = rect.left;

  switch (placement) {
    case "right":
      left = rect.left + rect.width + GAP;
      top = rect.top;
      break;
    case "left":
      left = rect.left - CARD_WIDTH - GAP;
      top = rect.top;
      break;
    case "top":
      left = rect.left;
      top = Math.max(GAP, rect.top - GAP - 160);
      break;
    case "bottom":
    default:
      left = rect.left;
      top = rect.top + rect.height + GAP;
      break;
  }

  // Clamp so the card never falls off-screen.
  left = Math.min(Math.max(GAP, left), viewportW - CARD_WIDTH - GAP);
  top = Math.min(Math.max(GAP, top), viewportH - 200);

  return { top, left };
}
