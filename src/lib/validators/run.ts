import { z } from "zod";

// The lookback windows PROJECT_BRIEF.md.txt names for backfill runs.
export const LOOKBACK_DAYS_OPTIONS = [7, 30, 90, 180, 365] as const;

export const runCreateSchema = z.object({
  profileId: z.string().trim().min(1),
  mode: z.enum(["BACKFILL", "SCHEDULED"]).default("BACKFILL"),
  lookbackDays: z
    .number()
    .int()
    .refine((value) => (LOOKBACK_DAYS_OPTIONS as readonly number[]).includes(value), {
      message: `lookbackDays must be one of ${LOOKBACK_DAYS_OPTIONS.join(", ")}`,
    })
    .optional(),
});

export type RunCreateInput = z.infer<typeof runCreateSchema>;
