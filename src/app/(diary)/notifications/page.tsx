import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import type { NotificationType } from "@/generated/prisma/enums";
import { getCurrentStudent } from "@/lib/auth";
import { getNotifications } from "@/lib/data";
import { formatDateTime } from "@/lib/dates";
import { Empty, PageTitle, Skeleton } from "@/components/ui";
import { markAllNotificationsRead } from "../../actions";

export const metadata: Metadata = { title: "Notifications" };

type Payload = { title?: string; body?: string; homeworkId?: string; date?: string };

const typeLabel: Record<NotificationType, string> = {
  new_homework: "New homework",
  deadline: "Deadline",
  new_mark: "New mark",
  lesson_changed: "Lesson changed",
  homework_returned: "Homework returned",
};

function linkFor(payload: Payload) {
  if (payload.homeworkId) return `/homework/${payload.homeworkId}`;
  if (payload.date) return `/diary?date=${payload.date}`;
  return null;
}

export default function NotificationsPage() {
  return (
    <Suspense fallback={<Skeleton rows={4} />}>
      <Notifications />
    </Suspense>
  );
}

async function Notifications() {
  const student = await getCurrentStudent();
  const items = await getNotifications();
  const unread = items.some((n) => !n.readAt);

  return (
    <>
      <PageTitle
        title="Notifications"
        action={
          unread && (
            <form action={markAllNotificationsRead}>
              <button type="submit" className="btn-ghost">
                Mark all read
              </button>
            </form>
          )
        }
      />
      {items.length === 0 ? (
        <Empty>No notifications.</Empty>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
          {items.map((n) => {
            const payload = (n.payload ?? {}) as Payload;
            const href = linkFor(payload);
            const body = (
              <div className="flex gap-3 px-4 py-3">
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? "bg-transparent" : "bg-accent"}`}
                  aria-label={n.readAt ? undefined : "Unread"}
                />
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{typeLabel[n.type]}</p>
                  <p className={`text-sm ${n.readAt ? "" : "font-semibold"}`}>{payload.title ?? typeLabel[n.type]}</p>
                  {payload.body && <p className="text-sm text-muted">{payload.body}</p>}
                  <p className="mt-0.5 text-xs text-muted">{formatDateTime(n.createdAt, student.timezone)}</p>
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
