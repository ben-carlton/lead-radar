import { z } from "zod";

const stringList = z.array(z.string().trim().min(1)).default([]);

export const profileCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  productsSold: z.string().trim().min(1, "Describe what you sell"),
  industriesTargeted: stringList,
  buyerRoles: stringList,
  regions: stringList,
  signalKeywords: stringList,
  excludeKeywords: stringList,
  isActive: z.boolean().default(true),
});

export const profileUpdateSchema = profileCreateSchema.partial();

export type ProfileCreateInput = z.infer<typeof profileCreateSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

/** Comma-separated form field -> trimmed, non-empty string array. */
export function parseCommaList(value: FormDataEntryValue | null): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
