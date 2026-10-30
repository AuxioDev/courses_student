import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import {
  encryptSession,
  SESSION_RENEW_AFTER_SECONDS,
  sessionCookieOptions,
  verifySession,
} from "@/lib/session-token";
import { defaultLocale, hasLocale, LOCALE_COOKIE, localePath, matchLocale } from "@/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;
const PUBLIC_PAGES = new Set(["login", "forgot-password", "reset-password"]);

// 1. Every page lives under /az, /en or /ru; add the prefix when it's missing.
// 2. Optimistic login check only: real authorization happens in getCurrentStudent().
// 3. Sessions last 30 days from last use: renew the cookie at most once a day.
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const [, first, ...rest] = pathname.split("/");

  if (!hasLocale(first)) {
    const saved = request.cookies.get(LOCALE_COOKIE)?.value;
    const locale = hasLocale(saved)
      ? saved
      : (matchLocale(request.headers.get("accept-language")) ?? defaultLocale);
    return NextResponse.redirect(new URL(`${localePath(locale, pathname)}${search}`, request.url));
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  const isPublic = PUBLIC_PAGES.has(rest.join("/"));

  const response =
    !session && !isPublic
      ? NextResponse.redirect(new URL(localePath(first, "/login"), request.url))
      : NextResponse.next();

  if (session && Date.now() / 1000 - session.issuedAt > SESSION_RENEW_AFTER_SECONDS) {
    const renewed = await encryptSession({ userId: session.userId, role: session.role, v: session.v });
    response.cookies.set(SESSION_COOKIE, renewed, sessionCookieOptions);
  }

  // Server Actions can't read the URL segment, so they read this cookie instead.
  if (request.cookies.get(LOCALE_COOKIE)?.value !== first) {
    response.cookies.set(LOCALE_COOKIE, first, { path: "/", maxAge: ONE_YEAR, sameSite: "lax" });
  }
  return response;
}

export const config = {
  // API routes do their own auth checks and have no language prefix.
  // Files with an extension (sw.js, icons, offline.html, manifest) are served as they are.
  matcher: ["/((?!_next/|api/|.*\\..*).*)"],
};
