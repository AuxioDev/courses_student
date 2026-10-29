import Link from "next/link";
import { getUnreadNotificationCount } from "@/lib/data";
import { BellIcon } from "./icons";

export async function NotificationBell() {
  const unread = await getUnreadNotificationCount();
  return (
    <Link
      href="/notifications"
      className="relative rounded-full p-2 text-ink"
      aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
    >
      <BellIcon />
      {unread > 0 && (
        <span className="absolute right-1 top-1 min-w-4 rounded-full bg-bad px-1 text-center text-[10px] font-bold leading-4 text-white">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}

export function NotificationBellPlaceholder() {
  return (
    <span className="p-2 text-muted">
      <BellIcon />
    </span>
  );
}
