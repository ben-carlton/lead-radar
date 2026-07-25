import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/submit-button";
import { LOOKBACK_DAYS_OPTIONS } from "@/lib/validators/run";
import { startRunAction } from "../actions";

const selectClassName =
  "h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export default async function NewRunPage() {
  const db = await getTenantDb();
  const [profiles, sourceCount] = await Promise.all([
    db.profile.findMany({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true },
    }),
    db.source.count({ where: { status: "ACTIVE" } }),
  ]);

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Start a backfill run</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">Create a profile first.</p>
            <Link href="/profiles/new" className={buttonVariants({ className: "w-fit" })}>
              New profile
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>Start a backfill run</CardTitle>
        </CardHeader>
        <CardContent>
          {sourceCount === 0 && (
            <p className="text-muted-foreground mb-4 text-sm">
              You have no active sources yet — this run won&apos;t find anything until you{" "}
              <Link href="/sources/new" className="underline">
                add one
              </Link>
              .
            </p>
          )}
          <form action={startRunAction} className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="profileId">Profile</Label>
              <select id="profileId" name="profileId" className={selectClassName} required>
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="lookbackDays">Lookback window</Label>
              <select id="lookbackDays" name="lookbackDays" className={selectClassName} defaultValue="30" required>
                {LOOKBACK_DAYS_OPTIONS.map((days) => (
                  <option key={days} value={days}>
                    Last {days} days
                  </option>
                ))}
              </select>
            </div>

            <SubmitButton className="w-fit" pendingText="Starting run…">
              Start run
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
