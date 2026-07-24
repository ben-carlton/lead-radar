import { z } from "zod";

export const selectorsSchema = z.object({
  articleSelector: z.string().trim().min(1),
  titleSelector: z.string().trim().min(1),
  linkSelector: z.string().trim().min(1),
});

export const detectRequestSchema = z.object({
  url: z.string().trim().min(1),
  // When provided, skip auto-detection and just re-run extraction with
  // these selectors (the "tweak and re-preview" step in the UI).
  selectors: selectorsSchema.optional(),
});

export const sourceCreateSchema = z.object({
  profileId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  url: z.string().trim().min(1),
  type: z.enum(["RSS", "HTML"]),
  feedUrl: z.string().trim().min(1).optional().nullable(),
  selectors: selectorsSchema.optional().nullable(),
});

export const sourceUpdateSchema = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(["ACTIVE", "SUGGESTED", "REJECTED"]).optional(),
  selectors: selectorsSchema.optional().nullable(),
});
