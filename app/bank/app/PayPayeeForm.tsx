import { useState } from "react";
import { useStore } from "../mock-data/store";
import { formatAmount, PROCESSING_MS, SubmitButton, useProcessing, wait } from "./processing";
import { useToast } from "./Toast";

export function PayPayeeForm() {
  const { state, dispatch } = useStore();
  const showToast = useToast();
  const { busy, start, finish } = useProcessing();
  const [mode, setMode] = useState<"known" | "new">("known");
  const accountName = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? id;
  const [payeeId, setPayeeId] = useState(state.payees[0]?.id ?? "");
  const [payeeName, setPayeeName] = useState("");
  const [payeeAccountRef, setPayeeAccountRef] = useState("");
  const [amount, setAmount] = useState("");
  const [fromAccountId, setFromAccountId] = useState(state.accounts[0]?.id ?? "");

  return (
    <div className="card" data-tour="pay-screen">
      <h2 className="section-title">Pay a payee</h2>
      <p className="section-subtitle">
        Known payees always require confirmation. New payees are never auto-approved.
      </p>
      <div className="mode-toggle">
        <label className={`mode-pill${mode === "known" ? " active" : ""}`}>
          <input type="radio" checked={mode === "known"} onChange={() => setMode("known")} />
          Existing payee
        </label>
        <label className={`mode-pill${mode === "new" ? " active" : ""}`}>
          <input type="radio" checked={mode === "new"} onChange={() => setMode("new")} />
          New payee
        </label>
      </div>

      {mode === "known" ? (
        <form
          data-agent-action="pay_known_payee"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = Number(amount);
            if (!payeeId || !parsed || !start()) return;
            await wait(PROCESSING_MS);
            dispatch({ type: "PAY_PAYEE", payeeId, amount: parsed, fromAccountId });
            const payee = state.payees.find((p) => p.id === payeeId)?.name ?? payeeId;
            showToast(`Paid ${formatAmount(parsed)} to ${payee} from ${accountName(fromAccountId)}`);
            setAmount("");
            finish();
          }}
        >
          <div className="field-group">
            <label className="field-label">From</label>
            <select
              className="field-select"
              data-agent-field="fromAccountId"
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
            >
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Payee</label>
            <select
              className="field-select"
              data-agent-field="payeeId"
              value={payeeId}
              onChange={(e) => setPayeeId(e.target.value)}
            >
              {state.payees.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Amount</label>
            <input
              className="field-input"
              data-agent-field="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <SubmitButton busy={busy} label="Pay" busyLabel="Paying…" agentSubmit="pay_known_payee" />
        </form>
      ) : (
        <form
          data-agent-action="add_payee_and_pay"
          onSubmit={async (e) => {
            e.preventDefault();
            const parsed = Number(amount);
            if (!payeeName || !payeeAccountRef || !parsed || !start()) return;
            await wait(PROCESSING_MS);
            dispatch({ type: "ADD_PAYEE_AND_PAY", payeeName, payeeAccountRef, amount: parsed, fromAccountId });
            showToast(`Added ${payeeName} as a payee and paid ${formatAmount(parsed)} from ${accountName(fromAccountId)}`);
            finish();
            setPayeeName("");
            setPayeeAccountRef("");
            setAmount("");
          }}
        >
          <div className="field-group">
            <label className="field-label">From</label>
            <select
              className="field-select"
              data-agent-field="fromAccountId"
              value={fromAccountId}
              onChange={(e) => setFromAccountId(e.target.value)}
            >
              {state.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">New payee name</label>
            <input
              className="field-input"
              data-agent-field="payeeName"
              value={payeeName}
              onChange={(e) => setPayeeName(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Payee account reference</label>
            <input
              className="field-input"
              data-agent-field="payeeAccountRef"
              value={payeeAccountRef}
              onChange={(e) => setPayeeAccountRef(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Amount</label>
            <input
              className="field-input"
              data-agent-field="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <SubmitButton busy={busy} label="Add payee and pay" busyLabel="Paying…" agentSubmit="add_payee_and_pay" />
        </form>
      )}
    </div>
  );
}
