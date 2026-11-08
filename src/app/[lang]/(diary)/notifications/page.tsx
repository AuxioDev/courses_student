import Link from "next/link";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getNotifications } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { getI18n } from "@/i18n";
import { notificationHref, renderNotification } from "@/lib/notifications/types";
import { Empty, PageTitle } from "@/components/ui";
import { markAllNotificationsRead } from "@/app/actions";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.notifications.title };
}

// Data is ready in tens of milliseconds; waiting for it beats flashing a skeleton
// (React holds streamed sections back ~300 ms, which delayed the real content).
export const instant = false;

export default function NotificationsPage() {
  return <Notifications />;
}

async function Notifications() {
  const [{ locale, t }, student, items] = await Promise.all([getI18n(), getCurrentStudent(), getNotifications()]);
  const unread = items.some((n) => !n.readAt);

  return (
    <>
      <PageTitle
        title={t.notifications.title}
        action={
          unread && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="btn-ghost">
                {t.notifications.markAllRead}
              </button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <Empty>{t.notifications.none}</Empty>
      ) : (
        <ul className="max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((n) => {
            const rendered = renderNotification(n.type, n.payload, t, locale, student.timezone);
            const href = notificationHref(locale, rendered);
            const body = (
              <div className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`}
                  aria-label={n.readAt ? undefined : t.notifications.unread}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-muted">{t.notifications.type[n.type]}</p>
                  <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{rendered.title}</p>
                  {rendered.body && <p className="text-sm text-muted">{rendered.body}</p>}
                  <p className="mt-0.5 text-xs text-muted">{formatDateTime(n.createdAt, student.timezone, locale)}</p>
                </div>
              </div>
            );
            return (
              <li key={n.id} className="border-b border-line last:border-b-0">
                {href ? <Link href={href}>{body}</Link> : body}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
