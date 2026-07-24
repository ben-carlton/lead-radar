import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createProfileAction } from "../actions";
import { ProfileForm } from "../profile-form";

export default function NewProfilePage() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <Card>
        <CardHeader>
          <CardTitle>New profile</CardTitle>
        </CardHeader>
        <CardContent>
          <ProfileForm action={createProfileAction} submitLabel="Create profile" />
        </CardContent>
      </Card>
    </div>
  );
}
