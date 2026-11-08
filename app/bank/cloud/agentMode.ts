import { sendToAgentChatAndConfirm } from "@agent-native/core/client/agent-chat";
import { requestAgentSidebarOpen } from "@agent-native/core/client/agent-sidebar-state";
import { writeClientAppState } from "@agent-native/core/client/application-state";
import { useCallback, useEffect, useState } from "react";

import { TAB_ID } from "@/lib/tab-id";
import { BANK_SCREEN_KEY } from "@shared/bank-app-state";

/**
 * "device": Qwen2.5-1.5B in this browser (WebLLM), exactly as the original demo.
 * "cloud": Agent-Native's built-in server agent. It proposes intents through
 * the propose-intent action, and the same in-browser pipeline runs them.
 */
export type AgentMode = "device" | "cloud";

export function hasWebGpu(): boolean {
  return typeof navigator !== "undefined" && "gpu" in navigator;
}

export function useAgentMode() {
  // No WebGPU means the on-device model cannot run, so start in cloud mode.
  const [mode, setMode] = useState<AgentMode>(() => (hasWebGpu() ? "device" : "cloud"));
  return { mode, setMode, webGpu: hasWebGpu() };
}

export type CloudSendResult = { delivered: boolean; reason?: string };

/**
 * Starts a background run of Agent-Native's agent. The bank's own panel is the
 * visible surface: the run answers only through propose-intent, which lands in
 * session.sendExternal like any on-device parse. The run and its tool calls
 * stay in the agent chat thread (openCloudChat) for anyone who wants the trace.
 */
export async function sendToCloudAgent(text: string): Promise<CloudSendResult> {
  try {
    const { delivered, reason } = await sendToAgentChatAndConfirm({
      message: text,
      context:
        "Sent from the Mock Bank agent panel, which only shows propose-intent results. Answer exclusively through propose-intent (use need_clarification for questions or anything you cannot do).",
      submit: true,
      chatTarget: "local",
      background: true,
      openSidebar: false,
    });
    return { delivered, reason };
  } catch {
    return { delivered: false, reason: "send-failed" };
  }
}

/** Opens the agent chat sidebar, where the cloud runs' full transcripts live. */
export function openCloudChat() {
  requestAgentSidebarOpen();
}

/** Mirrors the visible bank screen into tab-scoped app state for the server agent (view-screen). */
export function useBankScreenState(screen: string) {
  const write = useCallback(
    (value: string) =>
      writeClientAppState(`${BANK_SCREEN_KEY}:${TAB_ID}`, { screen: value }, { requestSource: TAB_ID }).catch(
        () => undefined,
      ),
    [],
  );
  useEffect(() => {
    void write(screen);
  }, [screen, write]);
}
