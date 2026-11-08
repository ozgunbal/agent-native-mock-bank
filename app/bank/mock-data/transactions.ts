import type { Transaction } from "@web-ai/shared";
import { INJECTED_TRANSACTION_ID, INJECTED_NOTE_TEXT } from "../injection-scenario/fixture";

export const SEED_TRANSACTIONS: Transaction[] = [
  { id: "txn-1", accountId: "acc-checking", date: "2026-08-20", description: "Coffee Shop", amount: -4.75, category: "food_drink" },
  { id: "txn-2", accountId: "acc-checking", date: "2026-08-21", description: "Paycheck", amount: 2400.0, category: "income" },
  { id: "txn-3", accountId: "acc-checking", date: "2026-08-22", description: "Grocery Store", amount: -87.32, category: "groceries" },
  {
    id: INJECTED_TRANSACTION_ID,
    accountId: "acc-checking",
    date: "2026-08-23",
    description: "Online Transfer Note",
    amount: -12.0,
    category: "transfer",
    note: INJECTED_NOTE_TEXT,
  },
  { id: "txn-5", accountId: "acc-savings", date: "2026-08-24", description: "Interest Payment", amount: 15.4, category: "income" },
  { id: "txn-6", accountId: "acc-checking", date: "2026-08-25", description: "Electric Bill", amount: -64.2, category: "utilities" },
  { id: "txn-7", accountId: "acc-checking-2", date: "2026-08-26", description: "Rent Split", amount: -450.0, category: "housing" },
];
