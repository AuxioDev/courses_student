import "server-only";
import { Prisma } from "@/generated/prisma/client";
import type { NotificationType } from "@/generated/prisma/enums";
import { db } from "../db";
import { APP_URL, emailLayout, sendEmail } from "../email";
import { getDictionary } from "@/i18n";
import { defaultLocale, hasLocale, localePath } from "@/i18n/config";
import { fmt } from "@/i18n/format";
import { EMAIL_DEFAULTS, PUSH_DEFAULTS, renderNotification, type NotificationPayloads } from "./types";
import { sendPush } from "../push";

// Creates an in-app notification and, if the student wants this type by email,
// sends it in their language. With a dedupeKey the same event is only ever
// delivered once. Returns false when it was a duplicate.
export async function notify<T extends NotificationType>(
  userId: string,
  type: T,
  payload: NotificationPayloads[T],
  options: { dedupeKey?: string } = {},
): Promise<boolean> {
  let notification;
  try {
    notification = await db.notification.create({
      data: { userId, type, payload, dedupeKey: options.dedupeKey ?? null },
      include: { user: { select: { name: true, email: true, locale: true, timezone: true, active: true } } },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }

  const { user } = notification;
  if (!user.active) return true;
  const prefs = await deliveryPreferences(userId, type);
  if (!prefs.email && !prefs.push) return true;

  const locale = hasLocale(user.locale) ? user.locale : defaultLocale;
  const t = getDictionary(locale);
  const rendered = renderNotification(type, payload, t, locale, user.timezone);
  const url = `${APP_URL}${localePath(locale, rendered.path ?? "/notifications")}`;

  if (prefs.push) {
    await sendPush(userId, { title: rendered.title, body: rendered.body, url, tag: notification.id });
  }
  if (prefs.email) {
    const { html, text } = emailLayout({
      lang: locale,
      greeting: fmt(t.email.greeting, { name: user.name.split(" ")[0] }),
      title: rendered.title,
      body: rendered.body,
      buttonLabel: t.email.open,
      buttonUrl: url,
      footer: t.email.footer,
    });
    if (await sendEmail({ to: user.email, subject: rendered.title, html, text })) {
      await db.notification.update({ where: { id: notification.id }, data: { emailedAt: new Date() } });
    }
  }
  return true;
}

async function deliveryPreferences(userId: string, type: NotificationType) {
  const pref = await db.notificationPreference.findUnique({ where: { userId_type: { userId, type } } });
  return { email: pref?.email ?? EMAIL_DEFAULTS[type], push: pref?.push ?? PUSH_DEFAULTS[type] };
}
