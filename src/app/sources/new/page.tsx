import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddSourceForm } from "./add-source-form";

export default async function NewSourcePage() {
  const db = await getTenantDb();
  const profiles = await db.profile.findMany({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true },
  });

  if (profiles.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle>Add a source</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-muted-foreground text-sm">
              Sources belong to a profile. Create a profile first so the crawler knows what
              you&apos;re looking for.
            </p>
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
          <CardTitle>Add a source</CardTitle>
        </CardHeader>
        <CardContent>
          <AddSourceForm profiles={profiles} />
        </CardContent>
      </Card>
    </div>
  );
}
