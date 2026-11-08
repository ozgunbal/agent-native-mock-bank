/** UI-facing DTOs shared by web-demo and mobile-demo mock-data layers. */

export interface Account {
  id: string;
  name: string;
  type: "checking" | "savings";
  balance: number;
  currency: string;
}

/**
 * Closed category set (not a free string) — deliberate, since it lets
 * category-aware transaction search (web-demo's transactionSearch.ts) type
 * its synonym table exhaustively against these exact values, and prevents
 * typo-drift ("dining" vs "food_drink" vs "Food & Drink") across the mock data.
 */
export const TRANSACTION_CATEGORIES = [
  "food_drink",
  "groceries",
  "utilities",
  "income",
  "housing",
  "transfer",
] as const;
export type TransactionCategory = (typeof TRANSACTION_CATEGORIES)[number];

export interface Transaction {
  id: string;
  accountId: string;
  date: string; // ISO date
  description: string;
  amount: number; // negative = debit, positive = credit
  category: TransactionCategory;
  /**
   * Free-text note field. One seeded transaction in web-demo's mock data uses this
   * field to carry the planted prompt-injection fixture (see
   * packages/web-demo/src/injection-scenario/fixture.ts) — this DTO makes no
   * distinction; the injection defense lives entirely in the intent-parser/guardrail
   * layer, not in this data shape.
   */
  note?: string;
}

export interface Payee {
  id: string;
  name: string;
  accountRef: string;
}
