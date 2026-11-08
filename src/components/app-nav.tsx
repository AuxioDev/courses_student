"use client";

import { Suspense, type ComponentType, type SVGProps } from "react";
import Link from "next/link";
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

type Props = { locale: Locale; labels: NavLabels };
type ViewProps = Props & { pathname: string | null };

function Bar({ locale, labels, pathname }: ViewProps) {
  return (
    <nav
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-5">
        {barItems.map(({ path, key, Icon }) => {
          const active = isActive(path, pathname, true);
          return (
            <li key={path} className="min-w-0">
              <Link
                href={localePath(locale, path)}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon strokeWidth={active ? 2.2 : 1.8} />
                <span className="max-w-full truncate px-0.5">{labels[key]}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function Side({ locale, labels, pathname }: ViewProps) {
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col border-r border-line bg-surface-2 lg:flex">
      <Link href={localePath(locale, "/")} className="flex h-14 items-center gap-2 px-5 text-[15px] font-semibold tracking-tight">
        <BookIcon className="text-accent" />
        {labels.appName}
      </Link>
      <nav aria-label={labels.main} className="overflow-y-auto px-3 pb-4">
        <ul className="space-y-0.5">
          {sideItems.map(({ path, key, Icon }) => {
            const active = isActive(path, pathname, false);
            return (
              <li key={path}>
                <Link
                  href={localePath(locale, path)}
                  aria-current={active ? "page" : undefined}
                  className={`flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium ${
                    active ? "border-accent bg-surface text-accent" : "border-transparent text-muted hover:text-ink"
                  }`}
                >
                  <Icon width={20} height={20} strokeWidth={active ? 2.2 : 1.8} />
                  {labels[key]}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
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
