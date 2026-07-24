import Link from "next/link";
import { auth, signOut } from "@/auth";
import { rawDb } from "@/lib/db";
import { Button, buttonVariants } from "@/components/ui/button";

export default async function Home() {
  const session = await auth();
  const organization = session?.user.organizationId
    ? await rawDb.organization.findUnique({ where: { id: session.user.organizationId } })
    : null;

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Lead Radar</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Signed in as {session?.user.email} &middot; {organization?.name}
        </p>
      </div>
      <div className="flex gap-2">
        <Link href="/profiles" className={buttonVariants()}>
          Profiles
        </Link>
        <Link href="/sources" className={buttonVariants({ variant: "outline" })}>
          Sources
        </Link>
        <Link href="/runs" className={buttonVariants({ variant: "outline" })}>
          Runs
        </Link>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut();
        }}
      >
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
