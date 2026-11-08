import { useEffect, useState } from "react";

const STORAGE_KEY = "web-ai-tour-seen-v1";

/**
 * Tracks whether the guided tour has ever been offered/started, so the
 * first-visit nudge only ever appears once per browser — the tour itself is
 * always available via the header button regardless of this flag.
 */
export function useTourNudge() {
  const [showNudge, setShowNudge] = useState(false);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(STORAGE_KEY);
      if (!seen) {
        const timer = setTimeout(() => setShowNudge(true), 900);
        return () => clearTimeout(timer);
      }
    } catch {
      // localStorage unavailable — just skip the nudge, tour is still button-accessible
    }
  }, []);

  function dismissNudge() {
    setShowNudge(false);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // ignore
    }
  }

  return { showNudge, dismissNudge };
}
