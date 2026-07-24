import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
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

type Props = { params: Promise<{ id: string }> };

const statusVariant = {
  RUNNING: "secondary",
  COMPLETED: "default",
  FAILED: "destructive",
} as const;

const stageVariant = {
  FETCHED: "secondary",
  KEYWORD_REJECTED: "outline",
  KEYWORD_PASSED: "default",
  CLASSIFIED: "default",
  LEAD_EXTRACTED: "default",
} as const;

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border p-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-2xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function formatContact(lead: {
  contactName: string | null;
  contactRole: string | null;
  contactSource: "ARTICLE" | "WEB_SEARCH" | "INFERRED_ROLE" | "NONE";
}): string {
  if (lead.contactSource === "NONE") return "—";
  if (lead.contactName) return lead.contactRole ? `${lead.contactName} (${lead.contactRole})` : lead.contactName;
  // INFERRED_ROLE: a likely title to ask for, no name — never invent one.
  return `${lead.contactRole} (inferred)`;
}

export default async function RunDetailPage({ params }: Props) {
  const { id } = await params;
  const db = await getTenantDb();

  const run = await db.run.findUnique({ where: { id }, include: { profile: true } });
  if (!run) notFound();

  // Article has no runId (per PROJECT_BRIEF.md.txt's data model — it's
  // deduped per org, not per run, since a re-crawl may rediscover the same
  // article). processedAt >= startedAt approximates "found during this
  // run" for the common one-run-at-a-time case; the funnel counters above
  // are the authoritative per-run numbers regardless.
  const articles = await db.article.findMany({
    where: { source: { profileId: run.profileId }, processedAt: { gte: run.startedAt } },
    orderBy: { createdAt: "desc" },
    include: { source: true },
    take: 200,
  });

  // Lead has no runId either, for the same reason as Article — approximate
  // "created during this run" the same way. Full sort/filter/export is the
  // step-8 Leads screen (PROJECT_BRIEF.md.txt); this is just enough to see
  // what a run produced without leaving the page.
  const leads = await db.lead.findMany({
    where: { profileId: run.profileId, createdAt: { gte: run.startedAt } },
    orderBy: { score: "desc" },
    take: 200,
  });

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{run.profile.name}</h1>
          <p className="text-muted-foreground text-sm">
            {run.mode} run &middot; started {run.startedAt.toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={statusVariant[run.status]}>{run.status}</Badge>
          <Link href={`/runs/${run.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Refresh
          </Link>
        </div>
      </div>

      {run.status === "FAILED" && run.errors ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-sm">Run failed</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {JSON.stringify(run.errors)}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <FunnelStat label="Fetched" value={run.articlesFetched} />
        <FunnelStat label="Passed filter" value={run.articlesFiltered} />
        <FunnelStat label="Classified" value={run.articlesClassified} />
        <FunnelStat label="Leads" value={run.leadsCreated} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Leads</h2>
        {leads.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {run.status === "RUNNING" ? "Still processing — refresh in a moment." : "No leads found."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Signal</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Why it&apos;s a lead</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell className="font-medium">
                      <a
                        href={lead.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {lead.companyName}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[lead.suburb, lead.state].filter(Boolean).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{lead.signalType}</TableCell>
                    <TableCell className="text-right tabular-nums">{lead.score}</TableCell>
                    <TableCell className="text-muted-foreground">{formatContact(lead)}</TableCell>
                    <TableCell className="text-muted-foreground max-w-sm truncate text-sm">
                      {lead.whyItsALead}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-medium">Articles</h2>
        {articles.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {run.status === "RUNNING" ? "Still crawling — refresh in a moment." : "No articles found."}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-right">Score</TableHead>
                  <TableHead>Reject reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((article) => (
                  <TableRow key={article.id}>
                    <TableCell className="max-w-xs truncate">
                      <a
                        href={article.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        {article.title}
                      </a>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{article.source.name}</TableCell>
                    <TableCell>
                      <Badge variant={stageVariant[article.stage]}>{article.stage}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{article.keywordScore}</TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate text-sm">
                      {article.rejectReason ?? "—"}
                    </TableCell>
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
