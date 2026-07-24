"use server";

import { redirect } from "next/navigation";
import { getTenantDb } from "@/lib/db";
import { startRun, UnknownProfileError } from "@/lib/runs/start-run";
import { runCreateSchema } from "@/lib/validators/run";

export async function startRunAction(formData: FormData) {
  const db = await getTenantDb();

  const lookbackRaw = formData.get("lookbackDays");
  const parsed = runCreateSchema.safeParse({
    profileId: formData.get("profileId"),
    mode: "BACKFILL",
    lookbackDays: typeof lookbackRaw === "string" && lookbackRaw ? Number(lookbackRaw) : undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  let run;
  try {
    run = await startRun(db, parsed.data);
  } catch (error) {
    if (error instanceof UnknownProfileError) throw new Error(error.message);
    throw error;
  }

  redirect(`/runs/${run.id}`);
}
