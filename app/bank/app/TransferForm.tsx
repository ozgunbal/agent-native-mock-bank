import { useState } from "react";
import { useStore } from "../mock-data/store";
import { formatAmount, PROCESSING_MS, SubmitButton, useProcessing, wait } from "./processing";
import { useToast } from "./Toast";

export function TransferForm() {
  const { state, dispatch } = useStore();
  const [fromAccountId, setFromAccountId] = useState(state.accounts[0]?.id ?? "");
  const [toAccountId, setToAccountId] = useState(state.accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const showToast = useToast();
  const { busy, start, finish } = useProcessing();
  const accountName = (id: string) => state.accounts.find((a) => a.id === id)?.name ?? id;

  return (
    <form
      className="card"
      data-agent-action="transfer_internal"
      data-tour="transfer-screen"
      onSubmit={async (e) => {
        e.preventDefault();
        const parsed = Number(amount);
        if (!fromAccountId || !toAccountId || !parsed || !start()) return;
        await wait(PROCESSING_MS);
        dispatch({ type: "TRANSFER_INTERNAL", fromAccountId, toAccountId, amount: parsed });
        showToast(`Moved ${formatAmount(parsed)} from ${accountName(fromAccountId)} to ${accountName(toAccountId)}`);
        setAmount("");
        finish();
      }}
    >
      <h2 className="section-title">Transfer between my accounts</h2>
      <p className="section-subtitle">
        Amounts up to $1,000 auto-execute. Above that, the agent will ask you to confirm.
      </p>
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
        <label className="field-label">To</label>
        <select
          className="field-select"
          data-agent-field="toAccountId"
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
        >
          {state.accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
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
      <SubmitButton busy={busy} label="Transfer" busyLabel="Transferring…" agentSubmit="transfer_internal" />
    </form>
  );
}
