import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { inngest } from "@/inngest/client";

// Diagnostic-only: fires the trivial hello-world event so step 5's "prove
// it runs in production" check has something to trigger without needing
// the Inngest dashboard. Requires a session (see the /api/inngest exact-path
// carve-out in src/auth.ts — this sibling route is NOT exempted).
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === "string" ? body.name : session.user.email;

  const { ids } = await inngest.send({ name: "test/hello.world", data: { name } });
  return NextResponse.json({ eventIds: ids });
}
