import "server-only";
import Anthropic from "@anthropic-ai/sdk";

const globalForAnthropic = globalThis as unknown as { anthropicClient?: Anthropic };

export const anthropic =
  globalForAnthropic.anthropicClient ?? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

if (process.env.NODE_ENV !== "production") globalForAnthropic.anthropicClient = anthropic;

// claude-haiku-4-5 classifies keyword-filter survivors (cheap, high volume);
// claude-sonnet-5 extracts leads and enriches contacts (needs more reasoning).
export const CLASSIFY_MODEL = "claude-haiku-4-5";
export const EXTRACT_MODEL = "claude-sonnet-5";
export const ENRICH_MODEL = "claude-sonnet-5";
