import type { Intent } from "./schema/intent";

/**
 * Grounding: the step between "the model produced a schema-valid intent" and
 * "the guardrail decides". The model never reliably knows real ids (measured:
 * it emits "checking", "Everyday Checking", 12345, "attacker"), so code maps
 * its references onto the user's real accounts/payees and checks the result
 * against real data. Anything that doesn't map is never passed on.
 *
 * This is also where the policy's "same owner" condition is actually
 * enforced: an internal transfer to an account that isn't the user's is
 * rejected here, before the amount-only guardrail predicate ever runs.
 */

export interface GroundingAccount {
  id: string;
  name: string;
  type: string;
  balance?: number;
}

export interface GroundingPayee {
  id: string;
  name: string;
}

export interface UserContext {
  accounts: readonly GroundingAccount[];
  payees: readonly GroundingPayee[];
}

export type RefMatch = "exact_id" | "resolved" | "ungrounded";

const words = (s: string) => s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

/**
 * Exact id > exact name > a distinctive name word ("joint", "everyday") >
 * account type ("savings" -> first savings account). Numbers, empty strings
 * and names of things the user doesn't own stay ungrounded.
 */
export function resolveAccount(ref: unknown, ctx: UserContext): { id: string | null; match: RefMatch } {
  if (typeof ref !== "string" || ref.trim() === "") return { id: null, match: "ungrounded" };
  const lower = ref.trim().toLowerCase();
  const byId = ctx.accounts.find((a) => a.id.toLowerCase() === lower);
  if (byId) return { id: byId.id, match: "exact_id" };
  const byName = ctx.accounts.find((a) => a.name.toLowerCase() === lower);
  if (byName) return { id: byName.id, match: "resolved" };

  const refWords = words(lower);
  const distinctive = ctx.accounts.filter((a) =>
    words(a.name).some((w) => !a.type.toLowerCase().startsWith(w.replace(/s$/, "")) && refWords.includes(w)),
  );
  if (distinctive.length === 1) return { id: distinctive[0]!.id, match: "resolved" };

  const byType = ctx.accounts.find((a) => refWords.some((w) => w.replace(/s$/, "") === a.type.toLowerCase().replace(/s$/, "")));
  if (byType) return { id: byType.id, match: "resolved" };
  return { id: null, match: "ungrounded" };
}

export function resolvePayee(ref: unknown, ctx: UserContext): { id: string | null; match: RefMatch } {
  if (typeof ref !== "string" || ref.trim() === "") return { id: null, match: "ungrounded" };
  const lower = ref.trim().toLowerCase();
  const byId = ctx.payees.find((p) => p.id.toLowerCase() === lower);
  if (byId) return { id: byId.id, match: "exact_id" };
  const refWords = words(lower);
  const byName = ctx.payees.filter(
    (p) => p.name.toLowerCase() === lower || words(p.name).some((w) => refWords.includes(w)),
  );
  if (byName.length === 1) return { id: byName[0]!.id, match: "resolved" };
  return { id: null, match: "ungrounded" };
}

export type GroundingOutcome =
  | { status: "ok"; intent: Intent; match: RefMatch | null }
  | { status: "needs_clarification"; intent: Intent; missing: string[]; question: string }
  | { status: "rejected"; intent: Intent; reason: string };

const isBlank = (v: unknown) => v === undefined || v === null || (typeof v === "string" && v.trim() === "");

function worstMatch(matches: RefMatch[]): RefMatch | null {
  if (matches.length === 0) return null;
  return matches.includes("resolved") ? "resolved" : "exact_id";
}

/**
 * Grounds an intent against the user's data and, when `userText` is given,
 * against the user's own words: an amount, account or payee the user never
 * mentioned is treated as invented and turned into a question.
 *
 * The text check exists because of a measured failure: on ambiguous requests
 * ("pay them", "move money") models filled the gaps by copying values from
 * the prompt's examples (payee-landlord/900, Bob Lee/12-3456, 40), and the
 * v3 id enum mapped attacker destinations onto the user's own accounts.
 * Both produce values that are valid against the data but absent from the
 * message. See docs/implementation-log/phase-9-*.md.
 */
export function groundIntent(intent: Intent, ctx: UserContext, userText?: string): GroundingOutcome {
  const outcome = groundReferences(intent, ctx);
  if (outcome.status !== "ok" || userText === undefined) return outcome;
  const filtered = dropUnmentionedFilters(outcome.intent, userText, ctx);
  if (filtered !== outcome.intent) return { ...outcome, intent: filtered };
  const missing = unsupportedSlots(outcome.intent, userText, ctx);
  if (missing.length === 0) return outcome;
  return { status: "needs_clarification", intent, missing, question: questionFor(missing) };
}

function groundReferences(intent: Intent, ctx: UserContext): GroundingOutcome {
  switch (intent.type) {
    case "need_clarification":
      return {
        status: "needs_clarification",
        intent,
        missing: intent.missing,
        question: intent.question || "Could you give me a bit more detail?",
      };

    case "transfer_internal": {
      const missing = (["fromAccountId", "toAccountId"] as const).filter((k) => isBlank(intent[k]));
      if (missing.length > 0) {
        return { status: "needs_clarification", intent, missing, question: "Which accounts should I move money between?" };
      }
      const from = resolveAccount(intent.fromAccountId, ctx);
      const to = resolveAccount(intent.toAccountId, ctx);
      for (const [field, r] of [["fromAccountId", from], ["toAccountId", to]] as const) {
        if (!r.id) {
          return {
            status: "rejected",
            intent,
            reason: `${field} "${intent[field]}" is not one of your accounts. Internal transfers only move money between your own accounts.`,
          };
        }
      }
      if (from.id === to.id) return { status: "rejected", intent, reason: "The source and destination are the same account." };
      const balance = ctx.accounts.find((a) => a.id === from.id)?.balance;
      if (balance !== undefined && intent.amount > balance) {
        return { status: "rejected", intent, reason: `Amount ${intent.amount} exceeds the available balance of ${balance}.` };
      }
      return {
        status: "ok",
        intent: { ...intent, fromAccountId: from.id!, toAccountId: to.id! },
        match: worstMatch([from.match, to.match]),
      };
    }

    case "pay_known_payee":
    case "schedule_recurring_payment": {
      const payee = resolvePayee(intent.payeeId, ctx);
      if (!payee.id) {
        return {
          status: "needs_clarification",
          intent,
          missing: ["payeeId"],
          question: isBlank(intent.payeeId)
            ? "Who should I pay?"
            : `"${intent.payeeId}" isn't one of your saved payees. Do you want to add them as a new payee?`,
        };
      }
      return { status: "ok", intent: { ...intent, payeeId: payee.id }, match: payee.match };
    }

    case "get_transactions": {
      if (isBlank(intent.accountId)) return { status: "ok", intent, match: null };
      const account = resolveAccount(intent.accountId, ctx);
      // A read-only filter that doesn't map is dropped rather than failing the whole request.
      return { status: "ok", intent: { ...intent, accountId: account.id ?? undefined }, match: account.match };
    }

    case "add_payee_and_pay":
      if (isBlank(intent.payeeName)) {
        return { status: "needs_clarification", intent, missing: ["payeeName"], question: "Who is the new payee?" };
      }
      return { status: "ok", intent, match: null };

    default:
      return { status: "ok", intent, match: null };
  }
}

// ---- evidence in the user's own text

/** Numbers as the user wrote them: "$1,200", "25.75", "120 bucks". */
export function numbersInText(text: string): number[] {
  return [...text.replace(/(\d),(\d{3})/g, "$1$2").matchAll(/\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Same word, ignoring a plural "s", tolerating typos in longer words ("chekcing"). */
function sameWord(a: string, b: string): boolean {
  const x = a.replace(/s$/, "");
  const y = b.replace(/s$/, "");
  if (x === y) return true;
  const len = Math.min(x.length, y.length);
  if (len < 5) return false;
  return levenshtein(x, y) <= (len >= 7 ? 2 : 1);
}

const textWords = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const mentions = (text: string, word: string) => textWords(text).some((w) => sameWord(w, word));

/**
 * An account counts as mentioned if one of its distinctive name words appears
 * ("joint", "everyday", "yield"), or its type word appears and it is the
 * first account of that type ("checking" means Everyday Checking, not Joint).
 */
function accountMentioned(id: string, text: string, ctx: UserContext): boolean {
  const account = ctx.accounts.find((a) => a.id === id);
  if (!account) return false;
  const type = account.type.toLowerCase();
  const distinctive = words(account.name).filter((w) => !type.startsWith(w.replace(/s$/, "")));
  if (distinctive.some((w) => mentions(text, w))) return true;
  const firstOfType = ctx.accounts.find((a) => a.type.toLowerCase() === type)?.id === id;
  return firstOfType && mentions(text, type);
}

function payeeMentioned(id: string, text: string, ctx: UserContext): boolean {
  const payee = ctx.payees.find((p) => p.id === id);
  return payee !== undefined && words(payee.name).some((w) => mentions(text, w));
}

/**
 * Read-only filters the user never mentioned are dropped rather than asked
 * about: "how much do I have in total" must not become a checking-only total
 * because the model added accountType (observed live).
 */
function dropUnmentionedFilters(intent: Intent, text: string, ctx: UserContext): Intent {
  if (intent.type === "get_total_balance" && intent.accountType && !mentions(text, intent.accountType)) {
    const { accountType: _dropped, ...rest } = intent;
    return rest;
  }
  if (intent.type === "get_transactions" && intent.accountId && !accountMentioned(intent.accountId, text, ctx)) {
    const { accountId: _dropped, ...rest } = intent;
    return rest;
  }
  return intent;
}

/** Slots of a grounded intent whose value does not appear in the user's message. */
export function unsupportedSlots(intent: Intent, text: string, ctx: UserContext): string[] {
  const missing: string[] = [];
  const fields = intent as Record<string, unknown>;
  if (typeof fields.amount === "number" && !numbersInText(text).some((n) => Math.abs(n - (fields.amount as number)) < 0.005)) {
    missing.push("amount");
  }
  for (const key of ["fromAccountId", "toAccountId"] as const) {
    const id = fields[key];
    if (typeof id === "string" && !accountMentioned(id, text, ctx)) missing.push(key);
  }
  if (typeof fields.payeeId === "string" && !payeeMentioned(fields.payeeId, text, ctx)) missing.push("payeeId");
  if (typeof fields.payeeName === "string" && !words(fields.payeeName).some((w) => mentions(text, w))) missing.push("payeeName");
  return missing;
}

function questionFor(missing: string[]): string {
  const parts: string[] = [];
  if (missing.includes("payeeId") || missing.includes("payeeName")) parts.push("who should receive it");
  if (missing.includes("fromAccountId") || missing.includes("toAccountId")) parts.push("which of your accounts to use");
  if (missing.includes("amount")) parts.push("how much");
  return `Before I do anything, please tell me ${parts.join(", and ")}.`;
}
