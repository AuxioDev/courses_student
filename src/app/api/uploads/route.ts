import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getStudentOrNull } from "@/lib/auth";
import { createUploadToken, storageDriver } from "@/lib/storage";
import { MAX_FILE_BYTES, contentTypeFor } from "@/lib/upload-policy";
import { checkNewFile, newStorageKey } from "@/lib/uploads";

const bodySchema = z.object({
  homeworkId: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

// Step 1 of an upload: check the student may add this file, then hand out a key
// (and, in production, a Blob token limited to that key, type and size).
export async function POST(request: NextRequest) {
  const student = await getStudentOrNull();
  if (!student) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "uploadFailed" }, { status: 400 });
  const { homeworkId, name, size } = parsed.data;

  const problem = await checkNewFile(student.id, homeworkId, name, size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const key = newStorageKey(student.id, homeworkId, name);
  const contentType = contentTypeFor(name)!;
  if (storageDriver() === "blob") {
    const token = await createUploadToken(key, contentType, MAX_FILE_BYTES);
    return NextResponse.json({ driver: "blob", key, contentType, token });
  }
  return NextResponse.json({ driver: "local", key, contentType, uploadUrl: `/api/uploads/local?key=${encodeURIComponent(key)}` });
}
