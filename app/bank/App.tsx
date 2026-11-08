import { useCallback, useEffect, useRef, useState } from "react";
import type { UserContext } from "@web-ai/core";
import { StoreProvider, useStore } from "./mock-data/store";
import { ToastProvider } from "./app/Toast";
import { SEED_ACCOUNTS } from "./mock-data/accounts";
import { SEED_PAYEES } from "./mock-data/payees";
import { Nav, type Screen } from "./app/Nav";
import { AccountsScreen } from "./app/AccountsScreen";
import { TransactionsScreen } from "./app/TransactionsScreen";
import { TransferForm } from "./app/TransferForm";
import { PayPayeeForm } from "./app/PayPayeeForm";
import { ActivityScreen } from "./app/ActivityScreen";
import { AgentOverlay, type AgentOverlayHandle } from "./agent-overlay/AgentOverlay";
import { useAgentSession } from "./agent-overlay/useAgentSession";
import { GuidedTour } from "./tour/GuidedTour";
import { TourNudge } from "./tour/TourNudge";
import { useTourNudge } from "./tour/useTourNudge";
import { ArchitectureShowcase } from "./architecture-showcase/ArchitectureShowcase";
import { openCloudChat, sendToCloudAgent, useAgentMode, useBankScreenState } from "./cloud/agentMode";
import { useCloudIntents } from "./cloud/useCloudIntents";

/**
 * The agent session lives above StoreProvider (see below), so it can't read
 * the store directly. This sits inside the provider and keeps a ref with the
 * current accounts/payees, so grounding checks live balances and payees the
 * user just added.
 */
function UserContextBridge({ target }: { target: React.MutableRefObject<UserContext> }) {
  const { state } = useStore();
  useEffect(() => {
    target.current = { accounts: state.accounts, payees: state.payees };
  }, [state.accounts, state.payees, target]);
  return null;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("accounts");
  const [tourActive, setTourActive] = useState(false);
  const [showcaseActive, setShowcaseActive] = useState(false);
  const [agentHandle, setAgentHandle] = useState<AgentOverlayHandle | null>(null);
  const { showNudge, dismissNudge } = useTourNudge();

  // Owned here, not inside AgentOverlay, so the showcase page (opened
  // alongside the normal app) observes the SAME live model/session/message
  // history as the chat panel — one on-device model instance, one real
  // pipeline, two views onto it.
  const userContextRef = useRef<UserContext>({ accounts: SEED_ACCOUNTS, payees: SEED_PAYEES });
  const getUserContext = useCallback(() => userContextRef.current, []);
  const session = useAgentSession({ onNavigate: setScreen, getUserContext });

  // Agent-Native: the cloud agent's propose-intent calls arrive here and run
  // through the same pipeline as the on-device model; the current screen is
  // mirrored to app state so the cloud agent can see it.
  const agentMode = useAgentMode();
  useCloudIntents(session.sendExternal);
  useBankScreenState(screen);

  const registerAgentHandle = useCallback((handle: AgentOverlayHandle) => {
    setAgentHandle(handle);
  }, []);

  function startTour() {
    dismissNudge();
    setTourActive(true);
  }

  return (
    <StoreProvider>
      <ToastProvider>
        <UserContextBridge target={userContextRef} />
        <div className="shell">
          <div className="main-column">
            <div className="topbar">
              <div className="brand">
                <div className="brand-mark">MB</div>
                <div>
                  <div className="brand-name">Mock Bank</div>
                  <div className="brand-tag">Agent demo</div>
                </div>
              </div>
              <div className="topbar-actions">
                <button className="tour-button" onClick={startTour}>
                  <span className="sparkle">✦</span> Guided tour
                </button>
                <button className="tour-button showcase-button" onClick={() => setShowcaseActive(true)}>
                  <span className="sparkle">◈</span> Live architecture
                </button>
              </div>
            </div>

            <Nav current={screen} onChange={setScreen} />
            {screen === "accounts" && <AccountsScreen />}
            {screen === "transactions" && <TransactionsScreen />}
            {screen === "transfer" && <TransferForm />}
            {screen === "pay" && <PayPayeeForm />}
            {screen === "activity" && <ActivityScreen />}
          </div>

          <AgentOverlay
            registerHandle={registerAgentHandle}
            session={session}
            mode={agentMode.mode}
            onModeChange={agentMode.setMode}
            onCloudSend={sendToCloudAgent}
            onOpenCloudChat={openCloudChat}
            webGpu={agentMode.webGpu}
          />
        </div>

        {tourActive && (
          <GuidedTour onScreenChange={setScreen} agentHandle={agentHandle} onClose={() => setTourActive(false)} />
        )}

        {!tourActive && showNudge && <TourNudge onStart={startTour} onDismiss={dismissNudge} />}

        {showcaseActive && <ArchitectureShowcase session={session} onClose={() => setShowcaseActive(false)} />}
      </ToastProvider>
    </StoreProvider>
  );
}
