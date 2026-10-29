import Link from "next/link";
import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import { BellIcon, CalendarIcon, CheckIcon, NoteIcon, UserIcon } from "@/components/icons";
import { ChevronRight } from "@/components/icons";
import { PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "More" };

const links: { href: string; label: string; hint: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { href: "/schedule", label: "Schedule", hint: "Week and month view", Icon: CalendarIcon },
  { href: "/attendance", label: "Attendance", hint: "Per lesson and % per course", Icon: CheckIcon },
  { href: "/notes", label: "Notes & to-dos", hint: "Private to you", Icon: NoteIcon },
  { href: "/notifications", label: "Notifications", hint: "Homework, marks, lesson changes", Icon: BellIcon },
  { href: "/profile", label: "Profile", hint: "Timezone, log out", Icon: UserIcon },
];

export default function MorePage() {
  return (
    <>
      <PageTitle title="More" />
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {links.map(({ href, label, hint, Icon }) => (
          <li key={href} className="border-b border-line last:border-b-0">
            <Link href={href} className="flex items-center gap-3 px-4 py-3.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                <Icon width={20} height={20} />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{label}</span>
                <span className="block text-xs text-muted">{hint}</span>
              </span>
              <ChevronRight width={18} height={18} className="text-muted" />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
