"use server";

import { revalidatePath } from "next/cache";
import { getTenantDb } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { detectSource } from "@/lib/sources/detect";
import { suggestSources } from "@/lib/pipeline/suggest-sources";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

/**
 * "Find similar sources" — summarizes a profile's existing sources and asks
 * Claude (with web search) to research lookalike trade publications, then
 * stores each as a SUGGESTED Source row for the user to accept or reject.
 * Rejections are remembered: every URL this profile has ever seen (active,
 * suggested, or rejected) is excluded from future suggestions.
 */
export async function suggestSourcesAction(formData: FormData) {
  const db = await getTenantDb();

  const profileId = formData.get("profileId");
  if (typeof profileId !== "string" || !profileId) {
    throw new Error("Missing profileId");
  }

  const profile = await db.profile.findUnique({ where: { id: profileId } });
  if (!profile) throw new Error("Unknown profile");

  const knownSources = await db.source.findMany({
    where: { profileId },
    select: { name: true, url: true, status: true },
  });

  const result = await suggestSources(db, {
    organizationId: profile.organizationId,
    profile: {
      productsSold: profile.productsSold,
      industriesTargeted: profile.industriesTargeted,
      regions: profile.regions,
    },
    existingSources: knownSources
      .filter((s) => s.status === "ACTIVE" || s.status === "SUGGESTED")
      .map((s) => ({ name: s.name, url: s.url })),
    excludedUrls: knownSources.map((s) => s.url),
  });

  if (result.status === "ok") {
    const knownHosts = new Set(
      knownSources.map((s) => hostnameOf(s.url)).filter((h): h is string => h !== null),
    );

    for (const suggestion of result.suggestions) {
      const host = hostnameOf(suggestion.url);
      if (!host || knownHosts.has(host)) continue;
      knownHosts.add(host);

      try {
        await db.source.create({
          data: {
            profileId,
            name: suggestion.name,
            url: suggestion.url,
            // Placeholder — resolveSuggestionAction runs real detection and
            // overwrites this (plus feedUrl/selectors) when accepted. A
            // SUGGESTED source is never crawled, so this is never acted on
            // before then.
            type: "RSS",
            status: "SUGGESTED",
            suggestedReason: suggestion.reasoning,
            // organizationId is injected by the tenant client's scopeArgs;
            // Prisma's static create() type can't see that (src/lib/db.ts).
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any,
        });
      } catch (err) {
        // Another suggestion this same batch (or a concurrent request)
        // already claimed this URL — skip, don't fail the whole batch.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
        throw err;
      }
    }
  }

  revalidatePath("/sources");
}

export async function resolveSuggestionAction(formData: FormData) {
  const db = await getTenantDb();

  const sourceId = formData.get("sourceId");
  const decision = formData.get("decision");
  if (typeof sourceId !== "string" || (decision !== "accept" && decision !== "reject")) {
    throw new Error("Invalid input");
  }

  if (decision === "reject") {
    await db.source.update({ where: { id: sourceId }, data: { status: "REJECTED" } });
    revalidatePath("/sources");
    return;
  }

  const source = await db.source.findUnique({ where: { id: sourceId } });
  if (!source) throw new Error("Source not found");

  try {
    const detection = await detectSource(source.url);

    if (detection.type === "rss") {
      await db.source.update({
        where: { id: sourceId },
        data: {
          status: "ACTIVE",
          type: "RSS",
          feedUrl: detection.feedUrl,
          selectors: Prisma.JsonNull,
          name: detection.suggestedName ?? source.name,
        },
      });
    } else if (detection.selectors) {
      await db.source.update({
        where: { id: sourceId },
        data: {
          status: "ACTIVE",
          type: "HTML",
          feedUrl: null,
          selectors: detection.selectors,
          name: detection.suggestedName ?? source.name,
        },
      });
    } else {
      await db.source.update({
        where: { id: sourceId },
        data: {
          suggestedReason:
            "Couldn't auto-detect how to crawl this site — no RSS feed or reliable article pattern found. You can try again later or reject it.",
        },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await db.source.update({
      where: { id: sourceId },
      data: { suggestedReason: `Couldn't verify this source: ${message}` },
    });
  }

  revalidatePath("/sources");
}
