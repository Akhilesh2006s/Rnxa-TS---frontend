import type { EntryStatus } from "./api";

export function formatMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

/** Hours with one decimal, for totals and charts. */
export const formatHours = (minutes: number) => `${(minutes / 60).toFixed(1).replace(/\.0$/, "")}h`;

/**
 * Parses durations typed in the forms people actually use:
 * "1:30", "1.5", "1.5h", "90m", "1h 30m", "2h", "45". A bare number of 10 or
 * less is read as hours; larger bare numbers as minutes.
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!s) return null;
  let m = s.match(/^(\d{1,2}):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = s.match(/^(?:(\d+(?:\.\d+)?) ?h(?:rs?|ours?)?)? ?(?:(\d+) ?m(?:in(?:s|utes?)?)?)?$/);
  if (m && (m[1] || m[2])) return Math.round(Number(m[1] ?? 0) * 60) + Number(m[2] ?? 0);
  m = s.match(/^\d+(?:\.\d+)?$/);
  if (m) {
    const n = Number(s);
    return n <= 10 ? Math.round(n * 60) : Math.round(n);
  }
  return null;
}

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", timeZone: "UTC" });
const dateFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const longFmt = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const fullFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const stampFmt = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

const asDate = (iso: string) => new Date(`${iso}T00:00:00Z`);
export const formatDay = (iso: string) => dayFmt.format(asDate(iso));
export const formatShortDate = (iso: string) => dateFmt.format(asDate(iso));
export const formatLongDate = (iso: string) => longFmt.format(asDate(iso));
export const formatFullDate = (iso: string) => fullFmt.format(asDate(iso));
export const formatStamp = (iso: string) => stampFmt.format(new Date(iso));

export function todayIso(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const d = asDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function weekStartIso(iso: string): string {
  const day = asDate(iso).getUTCDay();
  return addDaysIso(iso, day === 0 ? -6 : 1 - day);
}

export const STATUS_LABEL: Record<EntryStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Waiting to verify",
  CHANGES_REQUESTED: "Needs changes",
  APPROVED: "Verified",
  REJECTED: "Rejected",
};

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
