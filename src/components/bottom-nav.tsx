"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookIcon, MenuIcon, StarIcon, SunIcon, TaskIcon } from "./icons";

const tabs = [
  { href: "/", label: "Today", Icon: SunIcon, match: (p: string) => p === "/" },
  { href: "/diary", label: "Diary", Icon: BookIcon, match: (p: string) => p.startsWith("/diary") },
  { href: "/homework", label: "Homework", Icon: TaskIcon, match: (p: string) => p.startsWith("/homework") },
  { href: "/marks", label: "Marks", Icon: StarIcon, match: (p: string) => p.startsWith("/marks") },
  {
    href: "/more",
    label: "More",
    Icon: MenuIcon,
    match: (p: string) =>
      ["/more", "/schedule", "/attendance", "/notes", "/notifications", "/profile"].some((r) => p.startsWith(r)),
  },
];

// The path is only known at request time on dynamic routes, so the static shell
// renders the bar without an active tab and the highlight streams in.
export function BottomNav() {
  return (
    <Suspense fallback={<NavBar pathname={null} />}>
      <ActiveNavBar />
    </Suspense>
  );
}

function ActiveNavBar() {
  return <NavBar pathname={usePathname()} />;
}

function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {tabs.map(({ href, label, Icon, match }) => {
          const active = pathname !== null && match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  active ? "text-accent" : "text-muted"
                }`}
              >
                <Icon strokeWidth={active ? 2.2 : 1.8} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
