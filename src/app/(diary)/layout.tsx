import { Suspense } from "react";
import Link from "next/link";
import { BottomNav } from "@/components/bottom-nav";
import { NotificationBell, NotificationBellPlaceholder } from "@/components/notification-bell";

export default function DiaryLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh pb-24">
      <header className="sticky top-0 z-10 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-12 max-w-xl items-center justify-between px-4">
          <Link href="/" className="text-[15px] font-semibold tracking-tight">
            Student Diary
          </Link>
          <Suspense fallback={<NotificationBellPlaceholder />}>
            <NotificationBell />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-xl px-4 pt-5">{children}</main>
      <BottomNav />
    </div>
  );
}
