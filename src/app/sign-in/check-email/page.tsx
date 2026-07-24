import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CheckEmailPage() {
  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Check your email</CardTitle>
          <CardDescription>We sent you a sign-in link. It expires shortly, so use it soon.</CardDescription>
        </CardHeader>
        <CardContent />
      </Card>
    </div>
  );
}
