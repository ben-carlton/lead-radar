import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";
import { profileCreateSchema } from "@/lib/validators/profile";

async function tenantDbOr401() {
  try {
    return await getTenantDb();
  } catch {
    return null;
  }
}

export async function GET() {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profiles = await db.profile.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ profiles });
}

export async function POST(request: Request) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = profileCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Prisma's static types require `organizationId`/`organization` on create,
  // but forOrganization() injects it at runtime (see scopeArgs in
  // src/lib/db.ts) — the caller-supplied data intentionally omits it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profile = await db.profile.create({ data: parsed.data as any });
  return NextResponse.json({ profile }, { status: 201 });
}
