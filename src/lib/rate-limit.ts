import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES_PER_EMAIL = 5;
const MAX_FAILURES_PER_IP = 20;

export async function clientIp() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown";
}

// Counts failed logins in the last 15 minutes, per email and per IP.
export async function isLoginBlocked(email: string, ip: string) {
  const since = new Date(Date.now() - WINDOW_MS);
  const [byEmail, byIp] = await Promise.all([
    db.loginAttempt.count({ where: { email, success: false, createdAt: { gte: since } } }),
    db.loginAttempt.count({ where: { ip, success: false, createdAt: { gte: since } } }),
  ]);
  return byEmail >= MAX_FAILURES_PER_EMAIL || byIp >= MAX_FAILURES_PER_IP;
}

export async function recordLoginAttempt(email: string, ip: string, success: boolean) {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await db.$transaction([
    db.loginAttempt.create({ data: { email, ip, success } }),
    // A successful login clears the email's failures; old rows are dropped.
    ...(success ? [db.loginAttempt.deleteMany({ where: { email, success: false } })] : []),
    db.loginAttempt.deleteMany({ where: { createdAt: { lt: dayAgo } } }),
  ]);
}
