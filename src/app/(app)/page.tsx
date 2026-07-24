import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const runStatusVariant = {
  RUNNING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
} as const;

function StatCard({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <Link
      href={href}
      className="hover:border-ring flex flex-col gap-1 rounded-lg border p-4 transition-colors"
    >
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </Link>
  );
}

export default async function DashboardPage() {
  const db = await getTenantDb();

  const [newLeadsCount, totalLeadsCount, activeSourceCount, profileCount, lastRun] =
    await Promise.all([
      db.lead.count({ where: { status: "NEW" } }),
      db.lead.count(),
      db.source.count({ where: { status: "ACTIVE" } }),
      db.profile.count(),
      db.run.findFirst({ orderBy: { startedAt: "desc" }, include: { profile: true } }),
    ]);

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          An overview of your leads, sources, and runs.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="New leads" value={newLeadsCount} href="/leads?status=NEW" />
        <StatCard label="Total leads" value={totalLeadsCount} href="/leads" />
        <StatCard label="Active sources" value={activeSourceCount} href="/sources" />
        <StatCard label="Profiles" value={profileCount} href="/profiles" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Latest run</CardTitle>
        </CardHeader>
        <CardContent>
          {lastRun ? (
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium">{lastRun.profile.name}</p>
                <p className="text-muted-foreground text-sm">
                  {lastRun.mode} &middot; started {lastRun.startedAt.toLocaleString()}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Badge variant={runStatusVariant[lastRun.status]}>{lastRun.status}</Badge>
                <Link
                  href={`/runs/${lastRun.id}`}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  View
                </Link>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No runs yet — start a backfill to find your first leads.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Link href="/runs/new" className={buttonVariants()}>
          Start a run
        </Link>
        <Link href="/sources/new" className={buttonVariants({ variant: "outline" })}>
          Add source
        </Link>
      </div>
    </div>
  );
}
