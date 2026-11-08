import { NextResponse, type NextRequest } from "next/server";
import { isCronRequest } from "@/lib/cron-auth";
import { runRetention } from "@/lib/retention";

// Called once a day by Vercel Cron (see vercel.json).
export async function GET(request: NextRequest) {
  if (!isCronRequest(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json(await runRetention());
}
