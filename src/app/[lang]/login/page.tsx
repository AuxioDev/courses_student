import type { Metadata } from "next";
import Link from "next/link";
import { getI18n } from "@/i18n";
import { localeNames, locales, localePath } from "@/i18n/config";
import { LoginForm } from "./login-form";
import { ClearPrivateData } from "@/components/pwa/clear-private-data";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.login.title };
}

export default async function LoginPage() {
  const { locale, t } = await getI18n();
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6">
      <div className="mb-8">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-ink">
          D
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.meta.appName}</h1>
        <p className="mt-1 text-sm text-muted">{t.login.subtitle}</p>
      </div>
      <ClearPrivateData />
      <LoginForm labels={t.login} errors={t.errors} />
      <Link href={localePath(locale, "/forgot-password")} className="mt-4 text-center text-sm text-accent">
        {t.forgot.link}
      </Link>
      <nav className="mt-8 flex justify-center gap-4 text-sm" aria-label={t.profile.language}>
        {locales.map((l) => (
          <Link
            key={l}
            href={localePath(l, "/login")}
            hrefLang={l}
            aria-current={l === locale ? "true" : undefined}
            className={l === locale ? "font-semibold text-accent" : "text-muted"}
          >
            {localeNames[l]}
          </Link>
        ))}
      </nav>
    </main>
  );
}
