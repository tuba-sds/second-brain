import { z } from "zod";

export const ChatRequestSchema = z.object({
  workspaceId: z.string().min(1),
  message: z.string().min(1).max(4000),
});
export type ChatRequest = z.infer<typeof ChatRequestSchema>;

export const CitationSchema = z.object({
  chunkRef: z.number().int().positive(),
  quotedExcerpt: z.string().min(1).max(500),
});

export const RespondWithCitationsSchema = z.object({
  answer: z.string().min(1),
  citations: z.array(CitationSchema),
  confidence: z.number().min(0).max(1),
});
export type RespondWithCitations = z.infer<typeof RespondWithCitationsSchema>;
