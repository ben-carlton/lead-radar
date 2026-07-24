// Proxy (formerly "middleware") always runs on the Node.js runtime, unlike
// the old middleware.ts convention which defaulted to Edge — that matters
// here because the Prisma client needs Node builtins Edge doesn't have.
export { auth as proxy } from "@/auth";

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
