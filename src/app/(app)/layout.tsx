import { auth, signOut } from "@/auth";
import { rawDb } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { AppSidebarNav } from "./_components/app-sidebar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const organization = session?.user.organizationId
    ? await rawDb.organization.findUnique({ where: { id: session.user.organizationId } })
    : null;

  return (
    <div className="flex min-h-svh">
      <aside className="border-sidebar-border bg-sidebar text-sidebar-foreground flex w-56 shrink-0 flex-col border-r">
        <div className="border-sidebar-border flex h-14 items-center border-b px-4">
          <span className="text-base font-semibold tracking-tight">Lead Radar</span>
        </div>

        <AppSidebarNav />

        <div className="border-sidebar-border mt-auto flex flex-col gap-2 border-t p-3">
          <div className="flex flex-col gap-0.5 px-1">
            <span className="truncate text-sm font-medium">{organization?.name ?? "—"}</span>
            <span className="text-sidebar-foreground/60 truncate text-xs">
              {session?.user.email}
            </span>
          </div>
          {process.env.AUTH_DISABLED !== "1" && (
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <Button type="submit" variant="outline" size="sm" className="w-full">
                Sign out
              </Button>
            </form>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
