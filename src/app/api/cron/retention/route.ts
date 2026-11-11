import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { sweepOrphanUploads } from "@/lib/orphan-uploads";
import { runRetention } from "@/lib/retention";

// Called once a day by Vercel Cron (see vercel.json).
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const retention = await runRetention();
  // Same daily run (Vercel Hobby allows only two cron jobs). A sweep failure must not hide the retention result.
  const uploads = await sweepOrphanUploads().catch((e) => {
    console.error(`[uploads] sweep failed: ${e instanceof Error ? e.name : "unknown"}`);
    return { error: true as const };
  });
  return NextResponse.json({ ...retention, uploads });
}
