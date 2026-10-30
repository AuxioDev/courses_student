import Link from "next/link";
import type { StudentTerm } from "@/lib/data";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/config";

// Shown only when the student has courses in more than one term.
export function TermSwitcher({
  terms,
  selected,
  path,
  locale,
  label,
  currentLabel,
}: {
  terms: StudentTerm[];
  selected: string;
  path: string;
  locale: Locale;
  label: string;
  currentLabel: string;
}) {
  if (terms.length < 2) return null;
  return (
    <nav aria-label={label} className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
      {terms.map((term) => {
        const active = term.id === selected;
        return (
          <Link
            key={term.id}
            href={localePath(locale, term.current ? path : `${path}?term=${term.id}`)}
            aria-current={active ? "page" : undefined}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium ${
              active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface text-ink"
            }`}
          >
            {term.name}
            {term.current && <span className={active ? "ml-1 opacity-80" : "ml-1 text-muted"}>· {currentLabel}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
