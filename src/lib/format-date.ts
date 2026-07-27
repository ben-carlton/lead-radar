// Australia/Brisbane is fixed at UTC+10 year-round (Queensland doesn't
// observe daylight saving), so this is the same as a hardcoded GMT+10 offset
// without the DST edge cases a raw offset would get wrong for other AU
// states. Used everywhere a date/time is shown in the UI, per the user's
// request for Australian dd/mm/yyyy formatting.
const AU_TIMEZONE = "Australia/Brisbane";

export function formatDate(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AU_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatDateTime(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: AU_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}
