"use client";

import { Suspense, type ComponentType, type ReactNode, type SVGProps } from "react";
import Link from "next/link";
import { LinkPending } from "./link-pending";
import { usePathname } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  CheckIcon,
  MenuIcon,
  NoteIcon,
  StarIcon,
  SunIcon,
  TaskIcon,
  UserIcon,
} from "./icons";

export type NavLabels = {
  today: string;
  diary: string;
  homework: string;
  marks: string;
  more: string;
  main: string;
  schedule: string;
  attendance: string;
  notes: string;
  notifications: string;
  profile: string;
  appName: string;
};

type Item = { path: string; key: keyof NavLabels; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const moreSections = ["/more", "/schedule", "/attendance", "/notes", "/notifications", "/profile"];

// Phones and tablets: four main pages plus More, in a bar at the bottom.
const barItems: Item[] = [
  { path: "/", key: "today", Icon: SunIcon },
  { path: "/diary", key: "diary", Icon: BookIcon },
  { path: "/homework", key: "homework", Icon: TaskIcon },
  { path: "/marks", key: "marks", Icon: StarIcon },
  { path: "/more", key: "more", Icon: MenuIcon },
];

// Desktop: everything is one click away, so More isn't needed.
const sideItems: Item[] = [
  ...barItems.slice(0, 4),
  { path: "/schedule", key: "schedule", Icon: CalendarIcon },
  { path: "/attendance", key: "attendance", Icon: CheckIcon },
  { path: "/notes", key: "notes", Icon: NoteIcon },
  { path: "/notifications", key: "notifications", Icon: BellIcon },
  { path: "/profile", key: "profile", Icon: UserIcon },
];

function isActive(path: string, pathname: string | null, inBar: boolean) {
  if (pathname === null) return false;
  if (path === "/") return pathname === "/";
  if (inBar && path === "/more") return moreSections.some((s) => pathname.startsWith(s));
  return pathname.startsWith(path);
}

// `footer` is shown at the foot of the desktop sidebar (the signed-in student), rendered by the layout.
type Props = { locale: Locale; labels: NavLabels; footer?: ReactNode };
type ViewProps = Props & { pathname: string | null };

function Bar({ locale, labels, pathname }: ViewProps) {
  return (
    <nav
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5 md:max-w-3xl">
        {barItems.map(({ path, key, Icon }) => {
          const active = isActive(path, pathname, true);
          return (
            <li key={path} className="min-w-0">
              <Link
                href={localePath(locale, path)}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 py-1.5 text-xs font-medium transition-colors ${
                  active ? "text-accent" : "text-muted hover:text-ink"
                }`}
              >
                <span
                  className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${
                    active ? "bg-accent-soft" : ""
                  }`}
                >
                  <Icon strokeWidth={active ? 2.2 : 1.8} />
                </span>
                <span className="max-w-full truncate px-0.5">{labels[key]}</span>
                <LinkPending />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Side({ locale, labels, pathname, footer }: ViewProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface lg:flex">
      <Link href={localePath(locale, "/")} className="flex h-14 shrink-0 items-center gap-2.5 px-5 text-[0.9375rem] font-semibold tracking-tight">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-ink">
          <BookIcon width={18} height={18} />
        </span>
        {labels.appName}
      </Link>
      <nav aria-label={labels.main} className="flex-1 overflow-y-auto px-3 pt-2 pb-4">
        <ul className="space-y-0.5">
          {sideItems.map(({ path, key, Icon }) => {
            const active = isActive(path, pathname, false);
            return (
              <li key={path}>
                <Link
                  href={localePath(locale, path)}
                  aria-current={active ? "page" : undefined}
                  className={`flex min-h-9 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.2 : 1.8} />
                  {labels[key]}
                  <LinkPending />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {footer && <div className="shrink-0 border-t border-line p-3">{footer}</div>}
    </aside>
  );
}

function Views(props: ViewProps) {
  return (
    <>
      <Bar {...props} />
      <Side {...props} />
    </>
  );
}

function ActiveViews(props: Props) {
  // Strip the /az, /en or /ru prefix before matching.
  const path = usePathname().replace(/^\/[^/]+/, "") || "/";
  return <Views {...props} pathname={path} />;
}

// The path is only known at request time on dynamic routes, so the static shell
// renders the navigation without an active item and the highlight streams in.
export function AppNav(props: Props) {
  return (
    <Suspense fallback={<Views {...props} pathname={null} />}>
      <ActiveViews {...props} />
    </Suspense>
  );
}
