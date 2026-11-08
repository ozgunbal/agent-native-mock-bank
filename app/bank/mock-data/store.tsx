import { createContext, useCallback, useContext, useEffect, useReducer, useRef, type ReactNode } from "react";
import { useActionMutation, useActionQuery } from "@agent-native/core/client/hooks";
import { takeSubmitActor } from "../cloud/activity";
import { useQueryClient } from "@tanstack/react-query";
import type { Account, Transaction, Payee } from "@web-ai/shared";

/**
 * Same `useStore()` contract as web-demo's localStorage reducer
 * (web-ai-trials packages/web-demo/src/mock-data/store.tsx), now backed by
 * Agent-Native actions and SQL:
 *
 * - The reducer below still applies each change locally the moment the form
 *   dispatches it, so the UI updates exactly when it did before.
 * - The same change is sent to its action (transfer-internal, pay-payee,
 *   add-payee-and-pay, reset-bank), which writes it server-side. The action's
 *   success refetches get-bank-state, and the server copy replaces the local
 *   one. On failure the local change is dropped by refetching.
 */
interface StoreState {
  accounts: Account[];
  transactions: Transaction[];
  payees: Payee[];
}

type StoreAction =
  | { type: "TRANSFER_INTERNAL"; fromAccountId: string; toAccountId: string; amount: number }
  | { type: "PAY_PAYEE"; payeeId: string; amount: number; fromAccountId: string }
  | { type: "ADD_PAYEE_AND_PAY"; payeeName: string; payeeAccountRef: string; amount: number; fromAccountId: string }
  | { type: "RESET" };

type InternalAction = StoreAction | { type: "HYDRATE"; state: StoreState };

function reducer(state: StoreState, action: InternalAction): StoreState {
  switch (action.type) {
    case "HYDRATE":
      return action.state;
    case "TRANSFER_INTERNAL":
      return {
        ...state,
        accounts: state.accounts.map((a) => {
          if (a.id === action.fromAccountId) return { ...a, balance: a.balance - action.amount };
          if (a.id === action.toAccountId) return { ...a, balance: a.balance + action.amount };
          return a;
        }),
        transactions: [
          {
            id: `txn-${Date.now()}`,
            accountId: action.fromAccountId,
            date: new Date().toISOString().slice(0, 10),
            description: `Transfer to ${action.toAccountId}`,
            amount: -action.amount,
            category: "transfer" as const,
          },
          ...state.transactions,
        ],
      };
    case "PAY_PAYEE":
      return {
        ...state,
        accounts: state.accounts.map((a) =>
          a.id === action.fromAccountId ? { ...a, balance: a.balance - action.amount } : a,
        ),
        transactions: [
          {
            id: `txn-${Date.now()}`,
            accountId: action.fromAccountId,
            date: new Date().toISOString().slice(0, 10),
            description: `Payment to ${action.payeeId}`,
            amount: -action.amount,
            category: "transfer" as const,
          },
          ...state.transactions,
        ],
      };
    case "ADD_PAYEE_AND_PAY":
      return {
        ...state,
        payees: [...state.payees, { id: `payee-${Date.now()}`, name: action.payeeName, accountRef: action.payeeAccountRef }],
        accounts: state.accounts.map((a) =>
          a.id === action.fromAccountId ? { ...a, balance: a.balance - action.amount } : a,
        ),
        transactions: [
          {
            id: `txn-${Date.now()}`,
            accountId: action.fromAccountId,
            date: new Date().toISOString().slice(0, 10),
            description: `Payment to new payee ${action.payeeName}`,
            amount: -action.amount,
            category: "transfer" as const,
          },
          ...state.transactions,
        ],
      };
    case "RESET":
      // Seed data lives on the server; the refetch after reset-bank fills it in.
      return state;
  }
}

const StoreContext = createContext<{ state: StoreState; dispatch: (action: StoreAction) => void } | null>(null);

function LoadedStore({ initial, children }: { initial: StoreState; children: ReactNode }) {
  const [state, localDispatch] = useReducer(reducer, initial);
  const queryClient = useQueryClient();
  const transfer = useActionMutation("transfer-internal");
  const pay = useActionMutation("pay-payee");
  const addAndPay = useActionMutation("add-payee-and-pay");
  const reset = useActionMutation("reset-bank");

  // Server copy wins whenever get-bank-state refetches (after every write).
  const initialRef = useRef(initial);
  useEffect(() => {
    if (initialRef.current !== initial) {
      initialRef.current = initial;
      localDispatch({ type: "HYDRATE", state: initial });
    }
  }, [initial]);

  const dispatch = useCallback(
    (action: StoreAction) => {
      localDispatch(action);
      const write = (() => {
        switch (action.type) {
          case "TRANSFER_INTERNAL":
            return transfer.mutateAsync({
              fromAccountId: action.fromAccountId,
              toAccountId: action.toAccountId,
              amount: action.amount,
              actor: takeSubmitActor(),
            });
          case "PAY_PAYEE":
            return pay.mutateAsync({
              payeeId: action.payeeId,
              fromAccountId: action.fromAccountId,
              amount: action.amount,
              actor: takeSubmitActor(),
            });
          case "ADD_PAYEE_AND_PAY":
            return addAndPay.mutateAsync({
              payeeName: action.payeeName,
              payeeAccountRef: action.payeeAccountRef,
              fromAccountId: action.fromAccountId,
              amount: action.amount,
              actor: takeSubmitActor(),
            });
          case "RESET":
            return reset.mutateAsync({});
        }
      })();
      write.catch((err: unknown) => {
        console.error(`[mock-bank] ${action.type} was not saved`, err);
        void queryClient.invalidateQueries({ queryKey: ["action"] });
      });
    },
    [transfer, pay, addAndPay, reset, queryClient],
  );

  return <StoreContext.Provider value={{ state, dispatch }}>{children}</StoreContext.Provider>;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { data, error } = useActionQuery("get-bank-state", {});
  if (error && !data) return <div className="store-loading">Could not load Mock Bank. Reload to try again.</div>;
  if (!data) return <div className="store-loading">Loading Mock Bank…</div>;
  return <LoadedStore initial={data}>{children}</LoadedStore>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within a StoreProvider");
  return ctx;
}
