import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { extractLead } from "./extract";
import { enrichContact, WEB_LOOKUP_SCORE_THRESHOLD } from "./enrich";
import { scoreLead } from "./scoring";

export type LeadProfile = {
  id: string;
  productsSold: string;
  regions: string[];
  industriesTargeted: string[];
  buyerRoles: string[];
  scoringWeights: unknown;
};

export type LeadArticle = {
  id: string;
  title: string;
  bodyText: string | null;
  signalType: string | null;
  url: string;
  publishedAt: Date | null;
};

export type ExtractAndScoreResult =
  | { status: "created"; leadId: string; score: number; needsEnrichment: boolean }
  | { status: "skipped"; reason: "already-exists" | "extraction-failed" | "budget" };

/**
 * lead.extract from BUILD_ORDER.md.txt step 7: extracts lead detail with
 * Sonnet, scores it, and writes the Lead row. `db` must already be scoped
 * to organizationId (forOrganization() in a background job).
 *
 * Idempotent — checks for an existing Lead by articleId first, per
 * PROJECT_BRIEF.md.txt: "Every step idempotent. Check for existing records
 * before writing so retries never duplicate a lead."
 */
export async function extractAndScoreLead(
  db: PrismaClient,
  params: { organizationId: string; runId: string; profile: LeadProfile; article: LeadArticle },
): Promise<ExtractAndScoreResult> {
  const { organizationId, runId, profile, article } = params;

  const existing = await db.lead.findUnique({ where: { articleId: article.id } });
  if (existing) return { status: "skipped", reason: "already-exists" };

  const { extraction, skippedBudget } = await extractLead(db, {
    organizationId,
    runId,
    profile: { productsSold: profile.productsSold },
    article: {
      id: article.id,
      title: article.title,
      bodyText: article.bodyText,
      signalType: article.signalType,
    },
  });

  if (skippedBudget) return { status: "skipped", reason: "budget" };

  if (!extraction) {
    await db.article.update({
      where: { id: article.id },
      data: { rejectReason: "Extractor returned no valid response after retry" },
    });
    return { status: "skipped", reason: "extraction-failed" };
  }

  const signalType = article.signalType ?? "unspecified";
  const { score, breakdown } = scoreLead(profile, {
    signalType,
    companyText: `${extraction.companyName} ${extraction.whyItsALead}`,
    suburb: extraction.suburb,
    state: extraction.state,
    publishedAt: article.publishedAt,
    contactName: extraction.contactName,
    contactRole: extraction.contactRole,
  });

  const contactSource = extraction.contactName ? "ARTICLE" : "NONE";

  const lead = await db.lead.create({
    data: {
      articleId: article.id,
      profileId: profile.id,
      companyName: extraction.companyName,
      suburb: extraction.suburb,
      state: extraction.state,
      siteAddress: extraction.siteAddress,
      signalType,
      whyItsALead: extraction.whyItsALead,
      estimatedTimeframe: extraction.estimatedTimeframe,
      score,
      scoreBreakdown: breakdown,
      contactName: extraction.contactName,
      contactRole: extraction.contactRole,
      contactSource,
      contactConfidence: extraction.contactName ? 0.9 : null,
      sourceUrl: article.url,
      publishedAt: article.publishedAt,
      // organizationId is injected by the tenant client's scopeArgs;
      // Prisma's static create() type can't see that (src/lib/db.ts).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any,
  });

  await db.article.update({
    where: { id: article.id },
    data: { stage: "LEAD_EXTRACTED", processedAt: new Date() },
  });

  await db.run.update({
    where: { id: runId },
    data: { leadsCreated: { increment: 1 } },
  });

  const needsEnrichment = contactSource === "NONE" && score > WEB_LOOKUP_SCORE_THRESHOLD;

  return { status: "created", leadId: lead.id, score, needsEnrichment };
}

/**
 * contact.enrich from BUILD_ORDER.md.txt step 7: runs steps 2-3 of contact
 * enrichment (web lookup, then role inference) for a Lead that extraction
 * found no article contact for, then re-scores it to include the
 * contactAvailability points. Idempotent — a Lead whose contactSource is no
 * longer NONE (already enriched by an earlier attempt) is left untouched.
 */
export async function enrichAndRescoreLead(
  db: PrismaClient,
  params: { organizationId: string; runId: string; leadId: string; profile: LeadProfile },
): Promise<void> {
  const { organizationId, runId, leadId, profile } = params;

  const lead = await db.lead.findUnique({ where: { id: leadId } });
  if (!lead || lead.contactSource !== "NONE") return;

  const contact = await enrichContact(db, {
    organizationId,
    runId,
    score: lead.score,
    articleContact: { contactName: null, contactRole: null },
    profile: { buyerRoles: profile.buyerRoles },
    lead: {
      companyName: lead.companyName,
      suburb: lead.suburb,
      state: lead.state,
      whyItsALead: lead.whyItsALead,
    },
  });

  const { score, breakdown } = scoreLead(profile, {
    signalType: lead.signalType,
    companyText: `${lead.companyName} ${lead.whyItsALead}`,
    suburb: lead.suburb,
    state: lead.state,
    publishedAt: lead.publishedAt,
    contactName: contact.contactName,
    contactRole: contact.contactRole,
  });

  await db.lead.update({
    where: { id: leadId },
    data: {
      contactName: contact.contactName,
      contactRole: contact.contactRole,
      contactSource: contact.contactSource,
      contactConfidence: contact.contactConfidence,
      score,
      scoreBreakdown: breakdown,
    },
  });
}
