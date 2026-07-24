"use server";

import { redirect } from "next/navigation";
import { getTenantDb } from "@/lib/db";
import { parseCommaList, profileCreateSchema, profileUpdateSchema } from "@/lib/validators/profile";

function readForm(formData: FormData) {
  return {
    name: formData.get("name"),
    productsSold: formData.get("productsSold"),
    industriesTargeted: parseCommaList(formData.get("industriesTargeted")),
    buyerRoles: parseCommaList(formData.get("buyerRoles")),
    regions: parseCommaList(formData.get("regions")),
    signalKeywords: parseCommaList(formData.get("signalKeywords")),
    excludeKeywords: parseCommaList(formData.get("excludeKeywords")),
    isActive: formData.get("isActive") === "on",
  };
}

export async function createProfileAction(formData: FormData) {
  const db = await getTenantDb();

  const parsed = profileCreateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  // See the comment in src/app/api/profiles/route.ts: forOrganization()
  // injects organizationId at runtime, which Prisma's static types can't see.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = await db.profile.create({ data: parsed.data as any });
  redirect(`/profiles/${profile.id}`);
}

export async function updateProfileAction(id: string, formData: FormData) {
  const db = await getTenantDb();

  const parsed = profileUpdateSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join(", "));
  }

  await db.profile.update({ where: { id }, data: parsed.data });
  redirect(`/profiles/${id}`);
}

export async function deleteProfileAction(id: string) {
  const db = await getTenantDb();
  await db.profile.delete({ where: { id } });
  redirect("/profiles");
}
