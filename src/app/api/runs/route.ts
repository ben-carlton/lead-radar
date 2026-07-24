import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";
import { startRun, UnknownProfileError } from "@/lib/runs/start-run";
import { runCreateSchema } from "@/lib/validators/run";

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

  const runs = await db.run.findMany({ orderBy: { startedAt: "desc" }, include: { profile: true } });
  return NextResponse.json({ runs });
}

export async function POST(request: Request) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = runCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const run = await startRun(db, parsed.data);
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    if (error instanceof UnknownProfileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
