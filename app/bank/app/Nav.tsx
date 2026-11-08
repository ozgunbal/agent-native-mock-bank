export type Screen = "accounts" | "transactions" | "transfer" | "pay";

export function Nav({ current, onChange }: { current: Screen; onChange: (s: Screen) => void }) {
  const items: { key: Screen; label: string }[] = [
    { key: "accounts", label: "Accounts" },
    { key: "transactions", label: "Transactions" },
    { key: "transfer", label: "Transfer" },
    { key: "pay", label: "Pay" },
  ];
  return (
    <nav className="nav" data-tour="nav">
      {items.map((item) => (
        <button
          key={item.key}
          className={`nav-btn${current === item.key ? " active" : ""}`}
          onClick={() => onChange(item.key)}
          disabled={current === item.key}
          data-nav-target={item.key}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
