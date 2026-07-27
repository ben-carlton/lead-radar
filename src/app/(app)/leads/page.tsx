import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import type { LeadStatus, Prisma } from "@/generated/prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format-date";
import { setLeadStatusAction } from "./actions";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const statusVariant = {
  NEW: "default",
  DISMISSED: "secondary",
} as const;

function formatContact(lead: {
  contactName: string | null;
  contactRole: string | null;
  contactSource: string;
}): string {
  if (lead.contactSource === "NONE") return "—";
  if (lead.contactName) return lead.contactRole ? `${lead.contactName} (${lead.contactRole})` : lead.contactName;
  return lead.contactRole ? `${lead.contactRole} (inferred)` : "—";
}

function scoreBadgeVariant(score: number): "default" | "secondary" | "outline" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  return "outline";
}

type SearchParams = {
  profileId?: string;
  status?: string;
  minScore?: string;
  q?: string;
  sort?: string;
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const db = await getTenantDb();

  const profileId = params.profileId?.trim() || undefined;
  const status: LeadStatus | undefined =
    params.status === "NEW" || params.status === "DISMISSED" ? params.status : undefined;
  const minScore = params.minScore ? Number(params.minScore) : undefined;
  const q = params.q?.trim() || undefined;
  const sort = params.sort === "recent" ? "recent" : "score";

  const where: Prisma.LeadWhereInput = {
    ...(profileId ? { profileId } : {}),
    ...(status ? { status } : {}),
    ...(minScore ? { score: { gte: minScore } } : {}),
    ...(q
      ? {
          OR: [
            { companyName: { contains: q, mode: "insensitive" } },
            { signalType: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [leads, profiles] = await Promise.all([
    db.lead.findMany({
      where,
      orderBy: sort === "recent" ? { createdAt: "desc" } : { score: "desc" },
      include: { profile: { select: { name: true } } },
      take: 200,
    }),
    db.profile.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const hasFilters = Boolean(profileId || status || minScore || q || sort !== "score");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Leads</h1>
        <p className="text-muted-foreground text-sm">
          Every lead the pipeline has found, across all sources and runs.
        </p>
      </div>

      <form
        method="GET"
        className="flex flex-wrap items-end gap-3 rounded-lg border p-4"
      >
        <div className="flex flex-col gap-1">
          <Label htmlFor="q">Search</Label>
          <Input
            id="q"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Company or signal..."
            className="w-56"
          />
        </div>

        {profiles.length > 1 && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="profileId">Profile</Label>
            <select
              id="profileId"
              name="profileId"
              defaultValue={profileId ?? ""}
              className={selectClassName}
            >
              <option value="">All profiles</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label htmlFor="status">Status</Label>
          <select
            id="status"
            name="status"
            defaultValue={status ?? ""}
            className={selectClassName}
          >
            <option value="">All</option>
            <option value="NEW">New</option>
            <option value="DISMISSED">Dismissed</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="minScore">Min score</Label>
          <select
            id="minScore"
            name="minScore"
            defaultValue={params.minScore ?? ""}
            className={selectClassName}
          >
            <option value="">Any</option>
            <option value="80">80+</option>
            <option value="60">60+</option>
            <option value="40">40+</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="sort">Sort</Label>
          <select id="sort" name="sort" defaultValue={sort} className={selectClassName}>
            <option value="score">Highest score</option>
            <option value="recent">Most recent</option>
          </select>
        </div>

        <Button type="submit" size="sm">
          Apply
        </Button>
        {hasFilters && (
          <Link href="/leads" className={buttonVariants({ variant: "outline", size: "sm" })}>
            Clear
          </Link>
        )}
      </form>

      {leads.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {hasFilters ? "No leads match these filters." : "No leads yet — start a run to find some."}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Location</TableHead>
                {profiles.length > 1 && <TableHead>Profile</TableHead>}
                <TableHead>Signal</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Found</TableHead>
                <TableHead />
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
                  {profiles.length > 1 && (
                    <TableCell className="text-muted-foreground">{lead.profile.name}</TableCell>
                  )}
                  <TableCell className="text-muted-foreground">{lead.signalType}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={scoreBadgeVariant(lead.score)}>{lead.score}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatContact(lead)}</TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[lead.status]}>{lead.status}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {formatDate(lead.createdAt)}
                  </TableCell>
                  <TableCell>
                    <form action={setLeadStatusAction}>
                      <input type="hidden" name="leadId" value={lead.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={lead.status === "NEW" ? "DISMISSED" : "NEW"}
                      />
                      <SubmitButton
                        variant="outline"
                        size="sm"
                        pendingText={lead.status === "NEW" ? "Dismissing…" : "Restoring…"}
                      >
                        {lead.status === "NEW" ? "Dismiss" : "Restore"}
                      </SubmitButton>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
