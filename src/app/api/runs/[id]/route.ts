import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  let db;
  try {
    db = await getTenantDb();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const run = await db.run.findUnique({ where: { id } });
  if (!run) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ run });
}
