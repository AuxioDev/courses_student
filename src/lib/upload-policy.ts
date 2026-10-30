// What students may upload. Shared by the browser (early checks, file picker)
// and the server (the checks that count).

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_HOMEWORK = 5;

// The content type is always derived from the extension, never taken from the browser.
export const ALLOWED_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  heif: "image/heif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
};

export const ACCEPT_ATTRIBUTE = Object.keys(ALLOWED_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match ? match[1].toLowerCase() : "";
}

export function contentTypeFor(name: string): string | null {
  return ALLOWED_TYPES[extensionOf(name)] ?? null;
}

// Browsers can show these inline; everything else downloads.
export function isPreviewable(contentType: string) {
  return ["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain"].includes(contentType);
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type UploadErrorCode = "fileTooBig" | "fileType" | "tooManyFiles" | "uploadFailed" | "alreadyGraded" | "termLocked" | "homeworkNotFound";
