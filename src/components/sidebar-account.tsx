import Link from "next/link";
import { getCurrentStudent } from "@/lib/auth";
import { localePath, type Locale } from "@/i18n/config";

function initials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? "");
  return letters.join("").toUpperCase();
}

// The signed-in student at the foot of the desktop sidebar. Opens Profile. getCurrentStudent is cached per request.
export async function SidebarAccount({ locale }: { locale: Locale }) {
  const student = await getCurrentStudent();
  return (
    <Link
      href={localePath(locale, "/profile")}
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-2"
    >
      <span
        aria-hidden="true"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
      >
        {initials(student.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-ink">{student.name}</span>
        <span className="block truncate text-xs text-muted">{student.email}</span>
      </span>
    </Link>
  );
}

// What the footer shows while the student is still loading: the same height, nothing to read.
export function SidebarAccountPlaceholder() {
  return <div aria-hidden="true" className="h-12 rounded-lg bg-surface-2" />;
}
