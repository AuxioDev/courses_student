import { Suspense } from "react";
import Link from "next/link";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { AppNav } from "@/components/app-nav";
import { LanguageMenu } from "@/components/language-menu";
import { OfflineBanner } from "@/components/pwa/offline-banner";
import { NotificationBell, NotificationBellPlaceholder } from "@/components/notification-bell";

export default async function DiaryLayout({ children }: LayoutProps<"/[lang]">) {
  const { locale, t } = await getI18n();
  const labels = {
    ...t.nav,
    schedule: t.schedule.title,
    attendance: t.attendance.title,
    notes: t.notes.title,
    notifications: t.notifications.title,
    profile: t.profile.title,
    appName: t.meta.appName,
  };
  return (
    <div className="min-h-dvh pb-24 lg:pb-10 lg:pl-60">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-12 max-w-2xl items-center justify-between px-4 sm:px-6 lg:h-14 lg:max-w-5xl lg:justify-end">
          <Link href={localePath(locale, "/")} className="inline-flex min-h-11 items-center text-[0.9375rem] font-semibold tracking-tight lg:hidden">
            {t.meta.appName}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageMenu locale={locale} label={t.profile.language} saveToAccount />
            <Suspense fallback={<NotificationBellPlaceholder />}>
              <NotificationBell />
            </Suspense>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 pt-5 sm:px-6 lg:max-w-5xl lg:pt-8">
        <OfflineBanner text={t.pwa.offline} />
        {children}
      </main>
      <AppNav locale={locale} labels={labels} />
    </div>
  );
}
