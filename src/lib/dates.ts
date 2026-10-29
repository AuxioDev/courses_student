// Date helpers that work in the student's own timezone.

export type DayKey = string; // "YYYY-MM-DD"

function parts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const out: Record<string, number> = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

// Offset (ms) of `timeZone` from UTC at the given instant.
function tzOffset(date: Date, timeZone: string) {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function dayKey(date: Date, timeZone: string): DayKey {
  const p = parts(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

// The UTC instant at which local midnight of `key` starts in `timeZone`.
export function startOfDay(key: DayKey, timeZone: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d));
  const first = new Date(guess.getTime() - tzOffset(guess, timeZone));
  // Re-check once in case the offset differs across a DST change.
  return new Date(guess.getTime() - tzOffset(first, timeZone));
}

export function addDays(key: DayKey, days: number): DayKey {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function dayRange(key: DayKey, timeZone: string) {
  return { start: startOfDay(key, timeZone), end: startOfDay(addDays(key, 1), timeZone) };
}

// Weekday of a day key, 0 = Sunday.
export function weekday(key: DayKey) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

// Monday of the week containing `key`.
export function startOfWeek(key: DayKey): DayKey {
  return addDays(key, -((weekday(key) + 6) % 7));
}

export function startOfMonth(key: DayKey): DayKey {
  return `${key.slice(0, 7)}-01`;
}

export function addMonths(key: DayKey, months: number): DayKey {
  const [y, m] = key.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return date.toISOString().slice(0, 10);
}

export function formatTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit" }).format(date);
}

export function formatDateTime(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatDayKey(key: DayKey, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    ...options,
  }).format(new Date(`${key}T00:00:00Z`));
}

export function relativeDue(due: Date, now: Date) {
  const diffMs = due.getTime() - now.getTime();
  const hours = Math.round(diffMs / 36e5);
  if (diffMs < 0) {
    const ago = Math.abs(hours);
    return ago < 24 ? `${ago}h overdue` : `${Math.round(ago / 24)}d overdue`;
  }
  if (hours < 1) return "due within the hour";
  if (hours < 24) return `due in ${hours}h`;
  return `due in ${Math.round(hours / 24)}d`;
}
