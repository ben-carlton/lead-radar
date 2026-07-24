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

function formatDate(date: Date | null) {
  return date ? date.toLocaleString() : "—";
}

const statusVariant = {
  ACTIVE: "default",
  SUGGESTED: "secondary",
  REJECTED: "destructive",
} as const;

export default async function SourcesPage() {
  const db = await getTenantDb();
  const sources = await db.source.findMany({
    orderBy: { createdAt: "desc" },
    include: { profile: true },
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sources</h1>
        <Link href="/sources/new" className={buttonVariants()}>
          Add source
        </Link>
      </div>

      {sources.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No sources yet. Add one by pasting a URL — the app will look for an RSS feed or
          propose selectors to scrape the page.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Profile</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last crawled</TableHead>
                <TableHead>Last success</TableHead>
                <TableHead className="text-right">Errors</TableHead>
                <TableHead className="text-right">Articles</TableHead>
                <TableHead className="text-right">Leads</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell>
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                    >
                      {source.name}
                    </a>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{source.profile.name}</TableCell>
                  <TableCell>{source.type}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[source.status]}>{source.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(source.lastCrawledAt)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(source.lastSuccessAt)}
                  </TableCell>
                  <TableCell className="text-right">{source.errorCount}</TableCell>
                  <TableCell className="text-right">{source.articlesFound}</TableCell>
                  <TableCell className="text-right">{source.leadsFound}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
