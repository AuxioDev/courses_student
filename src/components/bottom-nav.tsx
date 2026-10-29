"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { localePath, type Locale } from "@/i18n/config";
import { BookIcon, MenuIcon, StarIcon, SunIcon, TaskIcon } from "./icons";

export type NavLabels = { today: string; diary: string; homework: string; marks: string; more: string; main: string };

const tabs = [
  { path: "/", key: "today", Icon: SunIcon, match: (p: string) => p === "/" },
  { path: "/diary", key: "diary", Icon: BookIcon, match: (p: string) => p.startsWith("/diary") },
  { path: "/homework", key: "homework", Icon: TaskIcon, match: (p: string) => p.startsWith("/homework") },
  { path: "/marks", key: "marks", Icon: StarIcon, match: (p: string) => p.startsWith("/marks") },
  {
    path: "/more",
    key: "more",
    Icon: MenuIcon,
    match: (p: string) =>
      ["/more", "/schedule", "/attendance", "/notes", "/notifications", "/profile"].some((r) => p.startsWith(r)),
  },
] as const;

type Props = { locale: Locale; labels: NavLabels };

// The path is only known at request time on dynamic routes, so the static shell
// renders the bar without an active tab and the highlight streams in.
export function BottomNav(props: Props) {
  return (
    <Suspense fallback={<NavBar {...props} pathname={null} />}>
      <ActiveNavBar {...props} />
    </Suspense>
  );
}

function ActiveNavBar(props: Props) {
  // Strip the /az, /en or /ru prefix before matching.
  const path = usePathname().replace(/^\/[^/]+/, "") || "/";
  return <NavBar {...props} pathname={path} />;
}

function NavBar({ locale, labels, pathname }: Props & { pathname: string | null }) {
  return (
    <nav
      aria-label={labels.main}
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map(({ path, key, Icon, match }) => {
          const active = pathname !== null && match(pathname);
          return (
            <li key={path}>
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
