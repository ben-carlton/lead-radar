import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format-date";

const statusVariant = {
  RUNNING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
} as const;

export default async function RunsPage() {
  const db = await getTenantDb();
  const runs = await db.run.findMany({ orderBy: { startedAt: "desc" }, include: { profile: true } });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Runs</h1>
        <Link href="/runs/new" className={buttonVariants()}>
          Start backfill run
        </Link>
      </div>

      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No runs yet. Start a backfill to fetch, dedupe, and keyword-filter articles from your
          active sources.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Profile</TableHead>
                <TableHead>Mode</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Started</TableHead>
                <TableHead className="text-right">Fetched</TableHead>
                <TableHead className="text-right">Passed filter</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <Link href={`/runs/${run.id}`} className="font-medium hover:underline">
                      {run.profile.name}
                    </Link>
                  </TableCell>
                  <TableCell>{run.mode}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[run.status]}>{run.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDateTime(run.startedAt)}
                  </TableCell>
                  <TableCell className="text-right">{run.articlesFetched}</TableCell>
                  <TableCell className="text-right">{run.articlesFiltered}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
