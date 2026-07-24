import { NextResponse } from "next/server";
import { getTenantDb } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { sourceUpdateSchema } from "@/lib/validators/source";

type Params = { params: Promise<{ id: string }> };

async function tenantDbOr401() {
  try {
    return await getTenantDb();
  } catch {
    return null;
  }
}

export async function GET(_request: Request, { params }: Params) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const source = await db.source.findUnique({ where: { id } });
  if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ source });
}

export async function PATCH(request: Request, { params }: Params) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = sourceUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Json? fields need Prisma's JsonNull sentinel to clear them to SQL NULL —
  // a plain `null` would set the column to a literal JSON "null" instead.
  const { selectors, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(selectors !== undefined && { selectors: selectors === null ? Prisma.JsonNull : selectors }),
  };

  try {
    const source = await db.source.update({ where: { id }, data });
    return NextResponse.json({ source });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const db = await tenantDbOr401();
  if (!db) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  try {
    await db.source.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
