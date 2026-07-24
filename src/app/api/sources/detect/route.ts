import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { detectSource, previewUrlWithSelectors } from "@/lib/sources/detect";
import { detectRequestSchema } from "@/lib/validators/source";

// No org data is touched here (nothing saved yet — this is the preview
// step), so this just needs "is someone logged in", not getTenantDb().
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = detectRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    if (parsed.data.selectors) {
      const preview = await previewUrlWithSelectors(parsed.data.url, parsed.data.selectors);
      return NextResponse.json({
        type: "html",
        selectors: parsed.data.selectors,
        suggestedName: null,
        preview,
      });
    }

    const result = await detectSource(parsed.data.url);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not fetch that URL";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
