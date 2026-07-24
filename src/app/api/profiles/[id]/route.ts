import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";
import { profileUpdateSchema } from "@/lib/validators/profile";

type Params = { params: Promise<{ id: string }> };

async function tenantDbOr401() {
  try {
    return await getTenantDb();
  } catch {
    return null;
  }
}

// Every branch below that can't find a row returns 404, never 403 — an org
// must not be able to tell "exists but isn't yours" from "doesn't exist".
// See tests/isolation/README.md.

export async function GET(_request: Request, { params }: Params) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profile = await db.profile.findUnique({ where: { id } });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ profile });
}

export async function PATCH(request: Request, { params }: Params) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = profileUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const profile = await db.profile.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ profile });
  } catch {
    // scopeArgs() folds organizationId into `where`, so a cross-org id
    // simply matches zero rows — Prisma throws, we surface it as 404.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await db.profile.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
