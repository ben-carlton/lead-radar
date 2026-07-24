"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db";

export async function setLeadStatusAction(formData: FormData) {
  const db = await getTenantDb();

  const leadId = formData.get("leadId");
  const status = formData.get("status");
  if (typeof leadId !== "string" || (status !== "NEW" && status !== "DISMISSED")) {
    throw new Error("Invalid input");
  }

  await db.lead.update({ where: { id: leadId }, data: { status } });
  revalidatePath("/leads");
}
