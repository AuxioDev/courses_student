import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>"; anything else is refused.
export function isCronRequest(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const given = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  return !!secret && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
