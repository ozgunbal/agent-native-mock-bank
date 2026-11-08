export function TourNudge({ onStart, onDismiss }: { onStart: () => void; onDismiss: () => void }) {
  return (
    <div className="tour-nudge">
      <button className="tour-nudge-close" onClick={onDismiss} aria-label="Dismiss">
        ✕
      </button>
      <div style={{ fontWeight: 650, fontSize: 13.5, marginBottom: 6 }}>New here? 👋</div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-muted)", marginBottom: 12, lineHeight: 1.5 }}>
        Take a 2-minute guided tour to see exactly how the agent decides what to auto-run, what to
        confirm, and what to refuse outright.
      </div>
      <button className="tour-btn next" onClick={onStart}>
        Take the tour
      </button>
    </div>
  );
}
