import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";
import { sourceCreateSchema } from "@/lib/validators/source";

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

  const sources = await db.source.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ sources });
}

export async function POST(request: Request) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = sourceCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // profileId is a foreign key, not something scopeArgs() rewrites — verify
  // it actually belongs to this org via the tenant client (which returns
  // null for another org's profile) before letting a Source point at it.
  const profile = await db.profile.findUnique({ where: { id: parsed.data.profileId } });
  if (!profile) {
    return NextResponse.json({ error: "Unknown profileId" }, { status: 400 });
  }

  if (parsed.data.type === "RSS" && !parsed.data.feedUrl) {
    return NextResponse.json({ error: "feedUrl is required for RSS sources" }, { status: 400 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const source = await db.source.create({ data: parsed.data as any });
    return NextResponse.json({ source }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("Unique constraint")) {
      return NextResponse.json({ error: "This URL is already a source" }, { status: 409 });
    }
    throw error;
  }
}
