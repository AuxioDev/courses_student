import Link from "next/link";
import { getUnreadNotificationCount } from "@/lib/data";
import { fmt, getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { BellIcon } from "./icons";

export async function NotificationBell() {
  const [{ locale, t }, unread] = await Promise.all([getI18n(), getUnreadNotificationCount()]);
  return (
    <Link
      href={localePath(locale, "/notifications")}
      className="relative rounded-full p-2 text-ink"
      aria-label={unread ? fmt(t.header.unread, { n: unread }) : t.header.notifications}
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
