import { useState } from "react";
import { useStore } from "../mock-data/store";
import type { Account } from "@web-ai/shared";

/**
 * Sums balances across accounts, optionally filtered to one account type.
 * Currency is deliberately NOT converted/mixed across differing currencies —
 * this demo's seed data is all USD, so a naive sum is safe here, but a
 * multi-currency real app would need real conversion before summing.
 */
function sumBalances(accounts: Account[], accountType?: Account["type"]): number {
  return accounts
    .filter((a) => !accountType || a.type === accountType)
    .reduce((total, a) => total + a.balance, 0);
}

export function AccountsScreen() {
  const { state } = useStore();
  // Controlled by the agent adapter via [data-agent-field="accountType"] (see
  // executeIntent.ts) — "" means no filter (sum every account, i.e. "total
  // assets"/"total amount"); "savings" / "checking" narrows to that type
  // (e.g. "saving sum", "total checking").
  const [accountTypeFilter, setAccountTypeFilter] = useState<"" | Account["type"]>("");

  const total = sumBalances(state.accounts, accountTypeFilter || undefined);
  const currency = state.accounts[0]?.currency ?? "USD";

  return (
    <>
      <section
        className="card"
        data-agent-action="get_total_balance"
        data-tour="total-balance-screen"
      >
        <h2 className="section-title">Total balance</h2>
        <p className="section-subtitle">
          {accountTypeFilter ? `Sum across your ${accountTypeFilter} accounts.` : "Sum across all your accounts."}
        </p>
        <select
          aria-label="Account type filter"
          data-agent-field="accountType"
          value={accountTypeFilter}
          onChange={(e) => setAccountTypeFilter(e.target.value as "" | Account["type"])}
          className="account-type-filter"
        >
          <option value="">All accounts</option>
          <option value="checking">Checking</option>
          <option value="savings">Savings</option>
        </select>
        <div className="total-balance-amount" data-agent-item-id="total-balance">
          {currency} {total.toFixed(2)}
        </div>
      </section>

      <section className="card" data-agent-action="list_accounts" data-tour="accounts-screen">
        <h2 className="section-title">Accounts</h2>
        <p className="section-subtitle">Every account the agent is allowed to read and act on.</p>
        <ul className="account-list">
          {state.accounts.map((a) => (
            <li key={a.id} className="account-row" data-agent-item-id={a.id}>
              <div>
                <div className="account-name">{a.name}</div>
                <div className="account-type">{a.type}</div>
              </div>
              <div className="account-balance">
                {a.currency} {a.balance.toFixed(2)}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
