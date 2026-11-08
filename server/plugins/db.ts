import { runMigrations } from "@agent-native/core/db";

export default runMigrations(
  [
    {
      version: 1,
      name: "mock-bank-tables",
      sql: `CREATE TABLE IF NOT EXISTS bank_accounts (
  owner_email TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('checking', 'savings')),
  balance DOUBLE PRECISION NOT NULL,
  currency TEXT NOT NULL,
  sort_key DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (owner_email, id)
);
CREATE TABLE IF NOT EXISTS bank_payees (
  owner_email TEXT NOT NULL,
  id TEXT NOT NULL,
  name TEXT NOT NULL,
  account_ref TEXT NOT NULL,
  sort_key DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (owner_email, id)
);
CREATE TABLE IF NOT EXISTS bank_transactions (
  owner_email TEXT NOT NULL,
  id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount DOUBLE PRECISION NOT NULL,
  category TEXT NOT NULL,
  note TEXT,
  sort_key DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (owner_email, id)
);
CREATE TABLE IF NOT EXISTS bank_audit_log (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source TEXT NOT NULL,
  intent_type TEXT NOT NULL,
  decision TEXT,
  rule_id TEXT,
  detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bank_transactions_owner_sort_idx ON bank_transactions (owner_email, sort_key);
CREATE INDEX IF NOT EXISTS bank_audit_log_owner_created_idx ON bank_audit_log (owner_email, created_at)`,
    },
  ],
  { table: "mock_bank_migrations" },
);
