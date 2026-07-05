import { z } from "zod";

export const KeyDecisionSchema = z.object({
  decisionText: z.string().min(1),
  decisionDate: z.string().optional(),
  confidence: z.number().min(0).max(1),
});

export const SummarizeDocumentSchema = z.object({
  summary: z.string().min(1),
  keyDecisions: z.array(KeyDecisionSchema),
});
export type SummarizeDocumentResult = z.infer<typeof SummarizeDocumentSchema>;
