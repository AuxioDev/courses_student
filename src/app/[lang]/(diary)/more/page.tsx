import Link from "next/link";
import type { Metadata } from "next";
import type { ComponentType, SVGProps } from "react";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { BellIcon, CalendarIcon, CheckIcon, ChevronRight, NoteIcon, UserIcon } from "@/components/icons";
import { PageTitle } from "@/components/ui";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.more.title };
}

export default async function MorePage() {
  const { locale, t } = await getI18n();
  const links: { path: string; label: string; hint: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
    { path: "/schedule", label: t.schedule.title, hint: t.more.scheduleHint, Icon: CalendarIcon },
    { path: "/attendance", label: t.attendance.title, hint: t.more.attendanceHint, Icon: CheckIcon },
    { path: "/notes", label: t.notes.title, hint: t.more.notesHint, Icon: NoteIcon },
    { path: "/notifications", label: t.notifications.title, hint: t.more.notificationsHint, Icon: BellIcon },
    { path: "/profile", label: t.profile.title, hint: t.more.profileHint, Icon: UserIcon },
  ];

  return (
    <>
      <PageTitle title={t.more.title} />
      <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
        {links.map(({ path, label, hint, Icon }) => (
          <li key={path} className="border-b border-line last:border-b-0">
            <Link href={localePath(locale, path)} className="flex items-center gap-3 px-4 py-3.5">
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
