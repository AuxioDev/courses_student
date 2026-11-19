import type { StudentTerm } from "@/lib/data";
import type { Locale } from "@/i18n/config";
import { localePath } from "@/i18n/config";
import { UnderlineTabs } from "./diary-ui";

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
    <UnderlineTabs
      label={label}
      items={terms.map((term) => ({
        key: term.id,
        href: localePath(locale, term.current ? path : `${path}?term=${term.id}`),
        label: (
          <>
            {term.name}
            {term.current && <span className="font-normal text-muted">· {currentLabel}</span>}
          </>
        ),
        active: term.id === selected,
      }))}
    />
  );
}
