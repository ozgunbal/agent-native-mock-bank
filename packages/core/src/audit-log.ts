import type { Intent } from "./schema/intent";
import type { Decision, PolicyRule } from "./schema/policy";

export interface AuditLogEntry {
  timestamp: string;
  rawInput: string;
  parsedIntent: Intent | null;
  rejectionReason: string | null;
  decision: Decision | null;
  matchedRule: PolicyRule | null;
}

/** In-memory audit log used by the CLI demo and the web agent-overlay. */
export class AuditLog {
  private entries: AuditLogEntry[] = [];

  recordParsed(rawInput: string, intent: Intent, decision: Decision, matchedRule: PolicyRule): AuditLogEntry {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      rawInput,
      parsedIntent: intent,
      rejectionReason: null,
      decision,
      matchedRule,
    };
    this.entries.push(entry);
    return entry;
  }

  recordRejected(rawInput: string, rejectionReason: string): AuditLogEntry {
    const entry: AuditLogEntry = {
      timestamp: new Date().toISOString(),
      rawInput,
      parsedIntent: null,
      rejectionReason,
      decision: null,
      matchedRule: null,
    };
    this.entries.push(entry);
    return entry;
  }

  all(): readonly AuditLogEntry[] {
    return this.entries;
  }
}
