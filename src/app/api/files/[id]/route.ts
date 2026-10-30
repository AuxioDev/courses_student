import { NextResponse } from "next/server";
import { getStudentOrNull } from "@/lib/auth";
import { db } from "@/lib/db";
import { readObject } from "@/lib/storage";
import { isPreviewable } from "@/lib/upload-policy";

// Streams a private homework file to the student who uploaded it.
// The Teacher and Admin apps will add their own checks for their roles.
export async function GET(request: Request, { params }: RouteContext<"/api/files/[id]">) {
  const student = await getStudentOrNull();
  if (!student) return new NextResponse(null, { status: 401 });

  const { id } = await params;
  const file = await db.submissionFile.findFirst({ where: { id, studentId: student.id } });
  if (!file) return new NextResponse(null, { status: 404 });

  const stream = await readObject(file.storageKey);
  if (!stream) return new NextResponse(null, { status: 404 });

  const download = new URL(request.url).searchParams.has("download") || !isPreviewable(file.contentType);
  return new NextResponse(stream, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
      // Uploaded files never run as part of the site, even if they're HTML in disguise.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
