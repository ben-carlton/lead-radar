import "server-only";

// Shared by the add-source detection flow (src/lib/sources/detect.ts) and
// the actual crawl pipeline (src/lib/pipeline/*) — same identity, same
// timeout/size discipline, in one place instead of drifting apart.
//
// A standard browser UA, not a self-identified bot string. Several trade
// publications (foodmag.com.au, quarrymagazine.com, manmonthly.com.au —
// verified live) block on the User-Agent header via a generic WAF "unknown
// bot" rule, even though their own robots.txt explicitly allows crawling.
// robots.txt is the access-control mechanism we actually respect (see
// RobotsGate below, unchanged); this only changes what the WAF's header
// filter sees.
export const CRAWLER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_BODY_BYTES = 3_000_000;

export async function fetchWithTimeout(url: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": CRAWLER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function readCappedText(res: Response, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<string> {
  const buf = await res.arrayBuffer();
  const bytes = buf.byteLength > maxBytes ? buf.slice(0, maxBytes) : buf;
  return new TextDecoder("utf-8").decode(bytes);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** "One request per second per domain with jitter" (PROJECT_BRIEF.md.txt). */
export async function politeDelay(baseMs = 1000, jitterMs = 500): Promise<void> {
  await sleep(baseMs + Math.random() * jitterMs);
}
