import { NextResponse, type NextRequest } from "next/server";
import { getStudentOrNull } from "@/lib/auth";
import { isValidKey, storageDriver, writeLocalObject } from "@/lib/storage";
import { MAX_FILE_BYTES, contentTypeFor } from "@/lib/upload-policy";
import { checkCanUpload, keyBelongsTo } from "@/lib/uploads";

// Development stand-in for the direct-to-Blob upload. Disabled when Blob is configured.
export async function PUT(request: NextRequest) {
  if (storageDriver() !== "local") return NextResponse.json({ error: "not found" }, { status: 404 });

  const student = await getStudentOrNull();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const key = request.nextUrl.searchParams.get("key") ?? "";
  const homeworkId = key.split("/")[1] ?? "";
  if (!isValidKey(key) || !keyBelongsTo(key, student.id, homeworkId) || !contentTypeFor(key)) {
    return NextResponse.json({ error: "uploadFailed" }, { status: 400 });
  }
  const problem = await checkCanUpload(student.id, homeworkId);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const length = Number(request.headers.get("content-length"));
  if (!length || length > MAX_FILE_BYTES) return NextResponse.json({ error: "fileTooBig" }, { status: 413 });
  const data = new Uint8Array(await request.arrayBuffer());
  if (data.byteLength > MAX_FILE_BYTES) return NextResponse.json({ error: "fileTooBig" }, { status: 413 });

  try {
    await writeLocalObject(key, data);
  } catch {
    return NextResponse.json({ error: "uploadFailed" }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
