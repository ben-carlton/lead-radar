// Proxy (formerly "middleware") always runs on the Node.js runtime, unlike
// the old middleware.ts convention which defaulted to Edge — that matters
// here because the Prisma client needs Node builtins Edge doesn't have.
import { NextResponse } from "next/server";
import { AUTH_DISABLED, authMiddleware } from "@/auth";

// AUTH_DISABLED=1 skips the auth gate entirely — every request passes
// through. See src/auth.ts for the corresponding dev-session bypass.
export const proxy = AUTH_DISABLED ? () => NextResponse.next() : authMiddleware;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
