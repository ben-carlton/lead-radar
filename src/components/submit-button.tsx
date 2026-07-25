"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A submit button that shows a spinner and swaps its label while its parent
 * form is submitting. Every action in this app is a plain server-action
 * <form> (no client-side fetch, no optimistic state), so without this the
 * only feedback on a slow action — "Find similar sources" calls Claude with
 * web search and can take 10-20s — is the browser tab's loading spinner,
 * easy to miss. useFormStatus() reads pending state from the nearest
 * ancestor <form>, so this works as a drop-in for any of them without
 * converting the page itself to a Client Component.
 */
export function SubmitButton({
  children,
  pendingText,
  disabled,
  ...props
}: React.ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || disabled} {...props}>
      {pending && <Loader2 className="size-4 animate-spin" />}
      {pending ? (pendingText ?? children) : children}
    </Button>
  );
}
