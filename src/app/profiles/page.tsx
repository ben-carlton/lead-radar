import Link from "next/link";
import { getTenantDb } from "@/lib/db";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ProfilesPage() {
  const db = await getTenantDb();
  const profiles = await db.profile.findMany({ orderBy: { createdAt: "desc" } });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Profiles</h1>
        <Link href="/profiles/new" className={buttonVariants()}>
          New profile
        </Link>
      </div>

      {profiles.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No profiles yet. A profile tells the crawler what you sell and who to find leads for.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {profiles.map((profile) => (
            <Link key={profile.id} href={`/profiles/${profile.id}`}>
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    {profile.name}
                    {!profile.isActive && (
                      <span className="text-muted-foreground text-xs font-normal">Inactive</span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-muted-foreground text-sm">
                  {profile.productsSold}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
