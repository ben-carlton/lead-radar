import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { resolveSuggestionAction, suggestSourcesAction } from "./actions";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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
  const [sources, profiles] = await Promise.all([
    db.source.findMany({
      where: { status: { in: ["ACTIVE", "SUGGESTED"] } },
      orderBy: { createdAt: "desc" },
      include: { profile: true },
    }),
    db.profile.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const activeSources = sources.filter((s) => s.status === "ACTIVE");
  const suggestedSources = sources.filter((s) => s.status === "SUGGESTED");

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Sources</h1>
        <Link href="/sources/new" className={buttonVariants()}>
          Add source
        </Link>
      </div>

      {profiles.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Find similar sources</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              Claude looks at what a profile already tracks and researches other trade
              publications that cover similar ground. Suggestions show up below for you to
              accept or reject.
            </p>
            <form action={suggestSourcesAction} className="flex flex-wrap items-end gap-3">
              <select name="profileId" className={selectClassName} required>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm">
                Find similar sources
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {suggestedSources.length > 0 && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-medium">Suggested</h2>
          <div className="flex flex-col gap-3">
            {suggestedSources.map((source) => (
              <Card key={source.id}>
                <CardContent className="flex items-start justify-between gap-4 pt-6">
                  <div className="flex flex-col gap-1">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium hover:underline"
                    >
                      {source.name}
                    </a>
                    <span className="text-muted-foreground text-xs">
                      {source.url} &middot; for {source.profile.name}
                    </span>
                    {source.suggestedReason && (
                      <p className="text-muted-foreground mt-1 text-sm">
                        {source.suggestedReason}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <form action={resolveSuggestionAction}>
                      <input type="hidden" name="sourceId" value={source.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <Button type="submit" size="sm">
                        Accept
                      </Button>
                    </form>
                    <form action={resolveSuggestionAction}>
                      <input type="hidden" name="sourceId" value={source.id} />
                      <input type="hidden" name="decision" value="reject" />
                      <Button type="submit" variant="outline" size="sm">
                        Reject
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Active</h2>
        {activeSources.length === 0 ? (
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
                {activeSources.map((source) => (
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
    </div>
  );
}
