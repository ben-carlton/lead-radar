import { notFound } from "next/navigation";
import { getTenantDb } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/submit-button";
import { deleteProfileAction, updateProfileAction } from "../actions";
import { ProfileForm } from "../profile-form";

type Props = { params: Promise<{ id: string }> };

export default async function EditProfilePage({ params }: Props) {
  const { id } = await params;
  const db = await getTenantDb();
  const profile = await db.profile.findUnique({ where: { id } });

  // Same rule as the API: a profile that isn't this org's is not
  // distinguishable from one that doesn't exist.
  if (!profile) notFound();

  const boundUpdate = updateProfileAction.bind(null, id);
  const boundDelete = deleteProfileAction.bind(null, id);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm
            action={boundUpdate}
            defaultValues={{
              name: profile.name,
              productsSold: profile.productsSold,
              industriesTargeted: profile.industriesTargeted,
              buyerRoles: profile.buyerRoles,
              regions: profile.regions,
              signalKeywords: profile.signalKeywords,
              excludeKeywords: profile.excludeKeywords,
              isActive: profile.isActive,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>

      <form action={boundDelete}>
        <SubmitButton variant="destructive" pendingText="Deleting…">
          Delete profile
        </SubmitButton>
      </form>
    </div>
  );
}
