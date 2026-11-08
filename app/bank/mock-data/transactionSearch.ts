import type { Transaction, TransactionCategory } from "@web-ai/shared";

/**
 * Deterministic keyword-to-category synonym table. This is the real fix for
 * "what did I spend on drinking and eating" not matching a transaction
 * literally described as "Coffee Shop" — matching happens app-side against
 * known synonyms, so it works regardless of what the model's `query` field
 * ends up containing (a full paraphrase or a clean single word), rather than
 * relying on literal substring luck.
 */
const CATEGORY_SYNONYMS: Record<TransactionCategory, string[]> = {
  food_drink: ["food", "drink", "drinking", "eating", "eat", "restaurant", "coffee", "dining"],
  groceries: ["groceries", "grocery", "supermarket"],
  utilities: ["utility", "utilities", "bill", "bills", "electric", "electricity"],
  income: ["income", "paycheck", "salary", "interest", "deposit"],
  housing: ["rent", "housing", "lease"],
  transfer: ["transfer", "wire"],
};

/**
 * Whether transaction `t` matches a free-text search query. Checks, in order:
 * literal substring against description, literal substring against the
 * category name itself, then word-by-word synonym overlap against the
 * transaction's category. An empty/whitespace-only query matches everything
 * (preserves the original no-filter behavior).
 */
export function matchesQuery(t: Transaction, rawQuery: string): boolean {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return true;
  if (t.description.toLowerCase().includes(q)) return true;
  if (t.category.toLowerCase().includes(q)) return true;

  const words = q.split(/\s+/);
  const synonyms = CATEGORY_SYNONYMS[t.category];
  return words.some((word) => synonyms.some((syn) => syn.includes(word) || word.includes(syn)));
}
