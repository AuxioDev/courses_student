import type { Metadata, Viewport } from "next";
import { Onest, Caveat } from "next/font/google";
import { lang } from "next/root-params";
import { locales } from "@/i18n/config";
import { getI18n } from "@/i18n";
import "../globals.css";
import "../role-theme.css";
import "../motion.css";
import { ServiceWorkerRegister } from "@/components/pwa/sw-register";

const bodyFont = Onest({
  // The shared stylesheet names its sans and mono variables after Geist, so these keep those names.
  variable: "--font-geist-sans",
  subsets: ["latin", "latin-ext", "cyrillic"],
  display: "swap",
});

// Marks and scores are written in pen, like a teacher in a paper diary. Only digits use it, and digits are plain
// ASCII, so the one Latin subset is enough and it is preloaded: the marks are the first thing a student looks for,
// and with the font loaded late they first showed in a fallback cursive and then jumped.
const penFont = Caveat({
  variable: "--font-pen",
  subsets: ["latin"],
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.appName, template: `%s · ${t.meta.appName}` },
    description: t.meta.description,
    applicationName: t.meta.appName,
    appleWebApp: { capable: true, title: t.meta.appName, statusBarStyle: "default" },
    icons: { icon: "/icon.svg", apple: "/icons/apple-touch-icon.png" },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfcff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1830" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/[lang]">) {
  return (
    <html lang={await lang()} className={`${bodyFont.variable} ${penFont.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
