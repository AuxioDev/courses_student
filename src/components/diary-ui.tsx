import Link from "next/link";
import type { ReactNode } from "react";
import type { Tone } from "./ui";

// The Diary's own presentation kit. components/ui.tsx is shared byte for byte with the Teacher and Admin apps, so the
// redesigned look lives here instead. Same props as ui.tsx where a component exists in both, so a page switches its
// import and nothing else. Skeleton is not repeated: it stays in ui.tsx.

// `children` is an optional row under the title for page controls (a pager, a segmented control).
export function PageTitle({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl leading-8 font-semibold tracking-tight md:text-[1.75rem] md:leading-9">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted first-letter:uppercase">{subtitle}</p>}
        </div>
        {action}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex min-h-6 items-center justify-between">
        <h2 className="text-[0.8125rem] leading-[1.125rem] font-semibold tracking-wide text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  // Lists pass "p-0" to run edge to edge; two padding classes would otherwise clash.
  const padding = className.includes("p-0") ? "" : "p-4 md:p-5";
  return <div className={`rounded-2xl border border-line bg-surface ${padding} ${className}`}>{children}</div>;
}

// A neutral glyph for an empty list: an open tray.
function EmptyGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 13l2.2-6.2A2 2 0 0 1 8.1 5.5h7.8a2 2 0 0 1 1.9 1.3L20 13" />
      <path d="M4 13v4.5A1.5 1.5 0 0 0 5.5 19h13a1.5 1.5 0 0 0 1.5-1.5V13h-4.5a1 1 0 0 0-1 .8 2.6 2.6 0 0 1-5 0 1 1 0 0 0-1-.8z" />
    </svg>
  );
}

// An empty list. With `action` (a link or button) it also says what to do next.
export function Empty({ children, action, icon }: { children: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-4 py-8 text-center">
      <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-surface-2 text-muted">{icon ?? <EmptyGlyph />}</span>
      <p className="max-w-xs text-sm text-muted">{children}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

const tones = {
  neutral: "bg-surface-2 text-muted",
  accent: "bg-accent-soft text-accent",
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
} as const satisfies Record<Tone, string>;

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs leading-4 font-medium whitespace-nowrap ${tones[tone]}`}>
      {children}
    </span>
  );
}

export type TabItem = { key: string; href: string; label: ReactNode; count?: number; active: boolean };

// One tab style for the whole app: an underline bar of links. Scrolls sideways when it does not fit.
export function UnderlineTabs({ items, label }: { items: TabItem[]; label: string }) {
  return (
    <nav
      aria-label={label}
      className="scroll-hint -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 [--scroll-cover:var(--bg)] sm:mx-0 sm:px-0"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`-mb-px inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors sm:min-h-10 ${
            item.active ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink"
          }`}
        >
          {item.label}
          {item.count != null && item.count > 0 && (
            <span
              className={`rounded-full px-1.5 text-xs leading-5 font-semibold tabular-nums ${
                item.active ? "bg-accent-soft text-accent" : "bg-surface-2 text-muted"
              }`}
            >
              {item.count}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

export type SegmentItem = { key: string; href: string; label: ReactNode; active: boolean };

// A two- or three-way switch between views of the same data (Week / Month). Neutral, so it does not compete with
// the primary button.
export function Segmented({ items, label }: { items: SegmentItem[]; label?: string }) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg bg-surface-2 p-1 text-sm font-medium">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={`flex min-h-9 flex-1 items-center justify-center rounded-md px-3 text-center transition-colors ${
            item.active ? "bg-surface text-ink shadow-sm" : "text-muted hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
