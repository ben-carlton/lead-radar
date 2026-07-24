/**
 * Industry-agnostic buying-signal phrases, per PROJECT_BRIEF.md.txt's "what
 * it does" section (facility expansions, greenfield sites, new plants,
 * relocations, capacity increases, capex) plus BUILD_ORDER.md.txt's seed
 * profile keywords. Combined with a Profile's own signalKeywords at filter
 * time — this list is the baseline every profile gets for free, not a
 * substitute for industry-specific terms.
 */
export const DEFAULT_SIGNAL_LEXICON: string[] = [
  "new facility",
  "new plant",
  "new factory",
  "new site",
  "greenfield",
  "greenfield site",
  "expansion",
  "expanding",
  "expands",
  "site expansion",
  "facility upgrade",
  "plant upgrade",
  "capacity increase",
  "increasing capacity",
  "doubling capacity",
  "capex",
  "capital expenditure",
  "relocating",
  "relocation",
  "relocates",
  "breaking ground",
  "breaks ground",
  "broke ground",
  "groundbreaking",
  "ground-breaking",
  "commissioning",
  "production line",
  "new production line",
  "manufacturing expansion",
  "invests in",
  "investment in new",
  "opens new",
  "new distribution center",
  "new distribution centre",
  "new warehouse",
];
