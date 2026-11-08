import { fail } from "@agent-native/core/action";
import type { Account, Payee, Transaction, TransactionCategory } from "@web-ai/shared";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { SEED_ACCOUNTS } from "../../app/bank/mock-data/accounts";
import { SEED_PAYEES } from "../../app/bank/mock-data/payees";
import { SEED_TRANSACTIONS } from "../../app/bank/mock-data/transactions";
import { getDb, schema } from "../db/index.js";

/** Same shape the web-demo reducer held (mock-data/store.tsx StoreState). */
export interface BankState {
  accounts: Account[];
  transactions: Transaction[];
  payees: Payee[];
}

type Db = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export function requireOwner(ctx: { userEmail?: string | null } | undefined): string {
  return ctx?.userEmail ?? fail("Sign in to use Mock Bank.", { statusCode: 401 });
}

/**
 * Seeds give sort keys 0, -1, -2, … (seed order, descending sort); rows the
 * app creates use Date.now(), so they sort before every seed — the same order
 * the reducer produced by prepending transactions. Accounts and payees sort
 * ascending, so the reducer's append order is kept there.
 */
async function insertSeeds(db: Db | Tx, ownerEmail: string) {
  await db
    .insert(schema.bankAccounts)
    .values(SEED_ACCOUNTS.map((a, i) => ({ ownerEmail, ...a, sortKey: i })))
    .onConflictDoNothing();
  await db
    .insert(schema.bankPayees)
    .values(SEED_PAYEES.map((p, i) => ({ ownerEmail, ...p, sortKey: i })))
    .onConflictDoNothing();
  await db
    .insert(schema.bankTransactions)
    .values(
      SEED_TRANSACTIONS.map((t, i) => ({
        ownerEmail,
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
        note: t.note ?? null,
        sortKey: -i,
      })),
    )
    .onConflictDoNothing();
}

async function ensureSeeded(ownerEmail: string) {
  const db = getDb();
  const [existing] = await db
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(eq(schema.bankAccounts.ownerEmail, ownerEmail))
    .limit(1);
  if (!existing) await insertSeeds(db, ownerEmail);
}

export async function loadBankState(ownerEmail: string): Promise<BankState> {
  await ensureSeeded(ownerEmail);
  const db = getDb();
  const { bankAccounts: a, bankPayees: p, bankTransactions: t } = schema;
  const [accounts, payees, transactions] = await Promise.all([
    db
      .select({ id: a.id, name: a.name, type: a.type, balance: a.balance, currency: a.currency })
      .from(a)
      .where(eq(a.ownerEmail, ownerEmail))
      .orderBy(asc(a.sortKey)),
    db
      .select({ id: p.id, name: p.name, accountRef: p.accountRef })
      .from(p)
      .where(eq(p.ownerEmail, ownerEmail))
      .orderBy(asc(p.sortKey)),
    db
      .select({
        id: t.id,
        accountId: t.accountId,
        date: t.date,
        description: t.description,
        amount: t.amount,
        category: t.category,
        note: t.note,
      })
      .from(t)
      .where(eq(t.ownerEmail, ownerEmail))
      .orderBy(desc(t.sortKey)),
  ]);
  return {
    accounts,
    payees,
    transactions: transactions.map(({ note, category, ...rest }) => ({
      ...rest,
      category: category as TransactionCategory,
      ...(note ? { note } : {}),
    })),
  };
}

async function requireAccount(tx: Tx, ownerEmail: string, id: string) {
  const [row] = await tx
    .select({ id: schema.bankAccounts.id })
    .from(schema.bankAccounts)
    .where(and(eq(schema.bankAccounts.ownerEmail, ownerEmail), eq(schema.bankAccounts.id, id)))
    .for("update");
  if (!row) fail(`Unknown account "${id}".`, { errorCode: "not_found", statusCode: 404 });
}

async function adjustBalance(tx: Tx, ownerEmail: string, id: string, delta: number) {
  await tx
    .update(schema.bankAccounts)
    .set({ balance: sql`${schema.bankAccounts.balance} + ${delta}` })
    .where(and(eq(schema.bankAccounts.ownerEmail, ownerEmail), eq(schema.bankAccounts.id, id)));
}

const today = () => new Date().toISOString().slice(0, 10);

/** Port of the reducer's TRANSFER_INTERNAL case. */
export async function transferInternal(
  ownerEmail: string,
  args: { fromAccountId: string; toAccountId: string; amount: number },
) {
  await ensureSeeded(ownerEmail);
  const now = Date.now();
  const id = `txn-${now}`;
  await getDb().transaction(async (tx) => {
    await requireAccount(tx, ownerEmail, args.fromAccountId);
    await requireAccount(tx, ownerEmail, args.toAccountId);
    await adjustBalance(tx, ownerEmail, args.fromAccountId, -args.amount);
    await adjustBalance(tx, ownerEmail, args.toAccountId, args.amount);
    await tx.insert(schema.bankTransactions).values({
      ownerEmail,
      id,
      accountId: args.fromAccountId,
      date: today(),
      description: `Transfer to ${args.toAccountId}`,
      amount: -args.amount,
      category: "transfer",
      sortKey: now,
    });
  });
  return { id };
}

/** Port of the reducer's PAY_PAYEE case. */
export async function payPayee(
  ownerEmail: string,
  args: { payeeId: string; amount: number; fromAccountId: string },
) {
  await ensureSeeded(ownerEmail);
  const now = Date.now();
  const id = `txn-${now}`;
  await getDb().transaction(async (tx) => {
    await requireAccount(tx, ownerEmail, args.fromAccountId);
    const [payee] = await tx
      .select({ id: schema.bankPayees.id })
      .from(schema.bankPayees)
      .where(and(eq(schema.bankPayees.ownerEmail, ownerEmail), eq(schema.bankPayees.id, args.payeeId)));
    if (!payee) fail(`Unknown payee "${args.payeeId}".`, { errorCode: "not_found", statusCode: 404 });
    await adjustBalance(tx, ownerEmail, args.fromAccountId, -args.amount);
    await tx.insert(schema.bankTransactions).values({
      ownerEmail,
      id,
      accountId: args.fromAccountId,
      date: today(),
      description: `Payment to ${args.payeeId}`,
      amount: -args.amount,
      category: "transfer",
      sortKey: now,
    });
  });
  return { id };
}

/** Port of the reducer's ADD_PAYEE_AND_PAY case. */
export async function addPayeeAndPay(
  ownerEmail: string,
  args: { payeeName: string; payeeAccountRef: string; amount: number; fromAccountId: string },
) {
  await ensureSeeded(ownerEmail);
  const now = Date.now();
  const payeeId = `payee-${now}`;
  const id = `txn-${now}`;
  await getDb().transaction(async (tx) => {
    await requireAccount(tx, ownerEmail, args.fromAccountId);
    await tx.insert(schema.bankPayees).values({
      ownerEmail,
      id: payeeId,
      name: args.payeeName,
      accountRef: args.payeeAccountRef,
      sortKey: now,
    });
    await adjustBalance(tx, ownerEmail, args.fromAccountId, -args.amount);
    await tx.insert(schema.bankTransactions).values({
      ownerEmail,
      id,
      accountId: args.fromAccountId,
      date: today(),
      description: `Payment to new payee ${args.payeeName}`,
      amount: -args.amount,
      category: "transfer",
      sortKey: now,
    });
  });
  return { id, payeeId };
}

/** Port of the reducer's RESET case. */
export async function resetBank(ownerEmail: string) {
  await getDb().transaction(async (tx) => {
    await tx.delete(schema.bankAccounts).where(eq(schema.bankAccounts.ownerEmail, ownerEmail));
    await tx.delete(schema.bankPayees).where(eq(schema.bankPayees.ownerEmail, ownerEmail));
    await tx.delete(schema.bankTransactions).where(eq(schema.bankTransactions.ownerEmail, ownerEmail));
    await insertSeeds(tx, ownerEmail);
  });
}

export async function recordAudit(
  ownerEmail: string,
  entry: { source: string; intentType: string; decision: string | null; ruleId: string | null; detail: string },
) {
  await getDb()
    .insert(schema.bankAuditLog)
    .values({ id: crypto.randomUUID(), ownerEmail, createdAt: new Date().toISOString(), ...entry });
}
