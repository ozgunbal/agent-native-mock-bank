import { deleteClientAppState, readClientAppState } from "@agent-native/core/client/application-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { TAB_ID } from "@/lib/tab-id";
import { AGENT_INTENT_KEY, type AgentIntentCommand } from "@shared/bank-app-state";

const tabKey = `${AGENT_INTENT_KEY}:${TAB_ID}`;

/**
 * Picks up proposals the cloud agent wrote with the propose-intent action
 * (tab-scoped app state) and hands each one, once, to the same pipeline the
 * on-device model feeds. The "app-state" query key lets Agent-Native's db
 * sync refetch this as soon as the agent writes; the interval is a fallback.
 */
export function useCloudIntents(onIntent: (userText: string, intent: unknown) => void) {
  const queryClient = useQueryClient();
  const queryKey = ["app-state", tabKey];
  const { data } = useQuery({
    queryKey,
    queryFn: () => readClientAppState<AgentIntentCommand>(tabKey),
    refetchInterval: 2000,
    retry: false,
  });

  const handled = useRef(new Set<string>());
  const onIntentRef = useRef(onIntent);
  onIntentRef.current = onIntent;

  useEffect(() => {
    if (!data || handled.current.has(data._writeId)) return;
    handled.current.add(data._writeId);
    queryClient.setQueryData(queryKey, null);
    void deleteClientAppState(tabKey, { requestSource: TAB_ID }).catch(() => undefined);
    onIntentRef.current(data.userText, data.intent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);
}
