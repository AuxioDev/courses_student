import { Suspense } from "react";
import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localeNames, locales } from "@/i18n/config";
import { Card, PageTitle, Skeleton } from "@/components/ui";
import { logout, logoutEverywhere, updateLocale } from "@/app/actions";
import { PasswordForm } from "@/components/password-form";
import { TimezoneForm } from "./timezone-form";
import { NotificationSettings } from "./notification-settings";
import { getNotificationPreferences } from "@/lib/data";
import { InstallPrompt } from "@/components/pwa/install-prompt";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.profile.title };
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<Skeleton rows={2} />}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const [{ locale, t }, student, notificationPrefs] = await Promise.all([getI18n(), getCurrentStudent(), getNotificationPreferences()]);
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageTitle title={t.profile.title} />
      <Card className="mb-4">
        <p className="text-lg font-semibold">{student.name}</p>
        <p className="text-sm text-muted">{student.email}</p>
      </Card>
      <Card className="mb-4">
        <p className="mb-2 text-sm font-medium">{t.profile.language}</p>
        <div className="flex rounded-xl border border-line bg-surface-2 p-1 text-sm font-medium">
          {locales.map((l) => (
            <form key={l} action={updateLocale} className="flex-1">
              <input type="hidden" name="locale" value={l} />
              <button
                type="submit"
                lang={l}
                aria-pressed={l === locale}
                className={`w-full rounded-lg py-2 ${l === locale ? "bg-accent text-accent-ink" : "text-muted"}`}
              >
                {localeNames[l]}
              </button>
            </form>
          ))}
        </div>
      </Card>
      <Card className="mb-4">
        <TimezoneForm
          current={student.timezone}
          timezones={timezones}
          labels={{ timezone: t.profile.timezone, save: t.common.save, saving: t.common.saving }}
          errors={t.errors}
          ok={t.ok}
        />
      </Card>
      <Card className="mb-4">
        <NotificationSettings
          current={notificationPrefs}
          typeLabels={t.notifications.type}
          labels={t.pwa}
          saveLabels={{ save: t.common.save, saving: t.common.saving }}
          ok={t.ok}
        />
      </Card>
      <InstallPrompt mode="card" labels={t.pwa} />
      <Card className="mb-4">
        <h2 className="mb-3 text-sm font-semibold">{t.password.changeTitle}</h2>
        <PasswordForm mode="change" labels={t.password} errors={t.errors} ok={t.ok} />
      </Card>
      <Card className="mb-4">
        <h2 className="text-sm font-semibold">{t.profile.security}</h2>
        <p className="mb-3 mt-0.5 text-xs text-muted">{t.profile.logoutEverywhereHint}</p>
        <form action={logoutEverywhere}>
          <button type="submit" className="btn-ghost">
            {t.profile.logoutEverywhere}
          </button>
        </form>
      </Card>
      <form action={logout}>
        <button type="submit" className="btn-ghost w-full text-bad">
          {t.profile.logout}
        </button>
      </form>
    </>
  );
}
