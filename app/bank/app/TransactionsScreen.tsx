import { useState } from "react";
import { useStore } from "../mock-data/store";
import { matchesQuery } from "../mock-data/transactionSearch";

export function TransactionsScreen() {
  const { state } = useStore();
  const [query, setQuery] = useState("");

  const filtered = state.transactions.filter((t) => matchesQuery(t, query));

  return (
    <section className="card" data-agent-action="get_transactions" data-tour="transactions-screen">
      <h2 className="section-title">Transactions</h2>
      <p className="section-subtitle">Read-only history. One row below carries a planted note — see the tour.</p>
      <div className="field-group">
        <input
          className="field-input"
          data-agent-field="query"
          placeholder="Filter by description or category (e.g. 'food', 'bills')..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <ul className="tx-list">
        {filtered.map((t) => (
          <li key={t.id} className={`tx-row${t.note ? " has-note" : ""}`} data-agent-item-id={t.id}>
            <div className="tx-main">
              {t.note ? <span className="tx-note-badge">⚠ embedded note</span> : null}
              <span className="tx-desc">{t.description}</span>
              <span className="tx-category-pill">{t.category.replace("_", " ")}</span>
              <span className="tx-date">{t.date}</span>
              {t.note ? (
                <div className="tx-note" data-testid={`note-${t.id}`}>
                  {t.note}
                </div>
              ) : null}
            </div>
            <span className={`tx-amount${t.amount >= 0 ? " positive" : ""}`}>
              {t.amount >= 0 ? "+" : ""}
              {t.amount.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
