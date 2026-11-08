import { z } from "zod";

export const Decision = z.enum(["allow", "confirm", "block"]);
export type Decision = z.infer<typeof Decision>;

export const PolicyRule = z.object({
  id: z.string(),
  appliesTo: z.array(z.string()), // intent types
  condition: z.string(), // human-readable, for the audit log/slide
  decision: Decision,
  reason: z.string(),
});
export type PolicyRule = z.infer<typeof PolicyRule>;
