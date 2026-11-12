import type { Metadata } from "next";
import { getCurrentStudent } from "@/lib/auth";
import { getI18n } from "@/i18n";
import { localePath } from "@/i18n/config";
import { Card, PageTitle } from "@/components/ui";
import { cancelDeletion, logout, logoutEverywhere, requestDeletion } from "@/app/actions";
import Link from "next/link";
import { fmt } from "@/i18n/format";
import { formatDateTime } from "@/lib/dates";
import { PasswordForm } from "@/components/password-form";
import { TimezoneForm } from "./timezone-form";
import { NotificationSettings } from "./notification-settings";
import { getNotificationPreferences } from "@/lib/data";
import { InstallPrompt } from "@/components/pwa/install-prompt";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmForm } from "@/components/confirm-dialog";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.profile.title };
}

// Data is ready in tens of milliseconds; waiting for it beats flashing a skeleton
// (React holds streamed sections back ~300 ms, which delayed the real content).
export const instant = false;

export default function ProfilePage() {
  return <Profile />;
}

async function Profile() {
  const [{ locale, t }, student, notificationPrefs] = await Promise.all([
    getI18n(),
    getCurrentStudent(),
    getNotificationPreferences(),
  ]);
  const timezones = Intl.supportedValuesOf("timeZone");
  // Set per deployment, e.g. a Google Form. Only https links are shown.
  const feedbackUrl = process.env.FEEDBACK_URL?.startsWith("https://") ? process.env.FEEDBACK_URL : null;

  return (
    <>
      <PageTitle title={t.profile.title} />
      <div className="gap-4 lg:columns-2 [&>*]:break-inside-avoid">
        <Card className="mb-4">
          <p className="text-lg font-semibold">{student.name}</p>
          <p className="text-sm text-muted">{student.email}</p>
        </Card>
        <Card className="mb-4">
          <TimezoneForm
            current={student.timezone}
            timezones={timezones}
            labels={{ timezone: t.profile.timezone, search: t.profile.timezoneSearch, save: t.common.save, saving: t.common.saving }}
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
          <PasswordForm mode="change" username={student.email} labels={t.password} errors={t.errors} ok={t.ok} />
        </Card>
        <Card className="mb-4">
          <h2 className="text-sm font-semibold">{t.profile.security}</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">{t.profile.logoutEverywhereHint}</p>
          <form action={logoutEverywhere}>
            <SubmitButton className="btn-ghost">{t.profile.logoutEverywhere}</SubmitButton>
          </form>
        </Card>
        <Card className="mb-4">
          <h2 className="text-sm font-semibold">{t.privacy.sectionTitle}</h2>
          <p className="mb-3 mt-0.5 text-xs text-muted">{t.privacy.downloadHint}</p>
          <a href="/api/privacy/export" download className="btn-ghost">
            {t.privacy.download}
          </a>
          <div className="mt-4 border-t border-line pt-3">
            {student.deletionRequestedAt ? (
              <form action={cancelDeletion}>
                <p className="mb-2 text-sm text-warn">
                  {fmt(t.privacy.deletionPending, {
                    date: formatDateTime(student.deletionRequestedAt, student.timezone, locale),
                  })}
                </p>
                <SubmitButton className="btn-ghost">{t.privacy.cancelDeletion}</SubmitButton>
              </form>
            ) : (
              <ConfirmForm action={requestDeletion} message={t.privacy.requestDeletionConfirm} labels={t.dialog}>
                <p className="mb-2 text-xs text-muted">{t.privacy.deletionHint}</p>
                <SubmitButton className="btn-ghost text-bad">{t.privacy.requestDeletion}</SubmitButton>
              </ConfirmForm>
            )}
          </div>
          <Link href={localePath(locale, "/privacy")} className="mt-3 inline-flex min-h-11 items-center text-sm text-accent sm:min-h-6">
            {t.privacy.link}
          </Link>
        </Card>
        {feedbackUrl && (
          <Card className="mb-4">
            <h2 className="mb-1 text-sm font-semibold">{t.profile.feedbackTitle}</h2>
            <a href={feedbackUrl} target="_blank" rel="noreferrer" className="text-sm text-accent">
              {t.profile.feedbackLink}
            </a>
          </Card>
        )}
        <form action={logout}>
          <SubmitButton className="btn-ghost w-full text-bad">{t.profile.logout}</SubmitButton>
        </form>
      </div>
    </>
  );
}
