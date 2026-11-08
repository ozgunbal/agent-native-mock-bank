import { deleteClientAppState, readClientAppState } from "@agent-native/core/client/application-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { TAB_ID } from "@/lib/tab-id";
import {
  AGENT_INTENT_KEY,
  AGENT_INTENT_TTL_MS,
  type AgentIntentCommand,
  type ProposingAgent,
} from "@shared/bank-app-state";

const tabKey = `${AGENT_INTENT_KEY}:${TAB_ID}`;

/**
 * Picks up proposals written by the propose-intent action and hands each one,
 * once, to the same pipeline the on-device model feeds:
 * - this tab's key: the app's own agent, which knows the tab it runs from;
 * - the shared key: an external agent (Claude Code over MCP, the CLI), which
 *   has no tab. Only a visible bank tab takes those, so a background tab
 *   never acts on them.
 * A proposal older than AGENT_INTENT_TTL_MS is dropped unrun. The "app-state"
 * query key lets Agent-Native's db sync refetch as soon as an agent writes;
 * the interval is a fallback.
 */
export function useCloudIntents(onIntent: (userText: string, intent: unknown, actor: ProposingAgent) => void) {
  const handled = useRef(new Set<string>());
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;

  useAgentIntentKey(tabKey, "cloud-agent", handled, onIntentRef, () => true);
  useAgentIntentKey(AGENT_INTENT_KEY, "external-agent", handled, onIntentRef, () => document.visibilityState === "visible");
}

function useAgentIntentKey(
  key: string,
  fallbackActor: ProposingAgent,
  handled: React.MutableRefObject<Set<string>>,
  onIntentRef: React.MutableRefObject<(userText: string, intent: unknown, actor: ProposingAgent) => void>,
  canTake: () => boolean,
) {
  const queryClient = useQueryClient();
  const queryKey = ["app-state", key];
  const { data } = useQuery({
    queryKey,
    queryFn: () => readClientAppState<AgentIntentCommand>(key),
    refetchInterval: 2000,
    retry: false,
  });

  // Re-check when the tab is shown again, so a proposal that arrived while it was hidden runs then.
  const [shownAt, setShownAt] = useState(0);
  useEffect(() => {
    const onVisibility = () => document.visibilityState === "visible" && setShownAt(Date.now());
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    if (!data || handled.current.has(data._writeId) || !canTake()) return;
    handled.current.add(data._writeId);
    queryClient.setQueryData(queryKey, null);
    void deleteClientAppState(key, { requestSource: TAB_ID }).catch(() => undefined);
    const expired = data.createdAt !== undefined && Date.now() - data.createdAt > AGENT_INTENT_TTL_MS;
    if (!expired) onIntentRef.current(data.userText, data.intent, data.actor ?? fallbackActor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, shownAt]);
}
