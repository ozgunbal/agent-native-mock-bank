import { doublePrecision, pgTable, text } from "drizzle-orm/pg-core";

/**
 * Mock Bank data, one private copy per signed-in user (`owner_email`).
 *
 * Mirrors the shapes in packages/shared (Account, Transaction, Payee) that the
 * original web-demo kept in a localStorage-backed reducer. `sort_key` keeps
 * the reducer's ordering: seeds keep their seed order, new rows sort first
 * (the reducer prepended new transactions and appended new payees).
 */
export const bankAccounts = pgTable("bank_accounts", {
  ownerEmail: text("owner_email").notNull(),
  id: text("id").notNull(),
  name: text("name").notNull(),
  type: text("type", { enum: ["checking", "savings"] }).notNull(),
  balance: doublePrecision("balance").notNull(),
  currency: text("currency").notNull(),
  sortKey: doublePrecision("sort_key").notNull(),
});

export const bankPayees = pgTable("bank_payees", {
  ownerEmail: text("owner_email").notNull(),
  id: text("id").notNull(),
  name: text("name").notNull(),
  accountRef: text("account_ref").notNull(),
  sortKey: doublePrecision("sort_key").notNull(),
});

export const bankTransactions = pgTable("bank_transactions", {
  ownerEmail: text("owner_email").notNull(),
  id: text("id").notNull(),
  accountId: text("account_id").notNull(),
  date: text("date").notNull(),
  description: text("description").notNull(),
  amount: doublePrecision("amount").notNull(),
  category: text("category").notNull(),
  note: text("note"),
  sortKey: doublePrecision("sort_key").notNull(),
});

/** Server-side audit trail: every money-moving action and every agent proposal. */
export const bankAuditLog = pgTable("bank_audit_log", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  createdAt: text("created_at").notNull(),
  source: text("source").notNull(),
  intentType: text("intent_type").notNull(),
  decision: text("decision"),
  ruleId: text("rule_id"),
  detail: text("detail").notNull(),
});
