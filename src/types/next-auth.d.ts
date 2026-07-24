import type { DefaultSession } from "next-auth";
import type { MembershipRole } from "@/generated/prisma/client";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      organizationId: string;
      role: MembershipRole;
    } & DefaultSession["user"];
  }
}
