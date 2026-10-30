"use client";

import { useRef, useState, useTransition } from "react";
import { put } from "@vercel/blob/client";
import type { Dictionary } from "@/i18n/dictionaries/en";
import { fmt } from "@/i18n/format";
import { attachUpload, removeUpload } from "@/app/actions";
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_BYTES,
  MAX_FILES_PER_HOMEWORK,
  contentTypeFor,
  formatBytes,
  type UploadErrorCode,
} from "@/lib/upload-policy";
import { TrashIcon } from "./icons";

// Files uploaded but not handed in yet (they go in with the next Submit).
export type UploadedFile = { id: string; name: string; size: number };

type Ticket =
  | { driver: "blob"; key: string; contentType: string; token: string }
  | { driver: "local"; key: string; contentType: string; uploadUrl: string };

const MB = MAX_FILE_BYTES / 1024 / 1024;

// Local development: plain PUT with progress (XHR, since fetch has no upload progress).
function putLocal(url: string, file: File, contentType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => (xhr.status < 300 ? resolve() : reject(new Error(String(xhr.status))));
    xhr.onerror = () => reject(new Error("network"));
    xhr.send(file);
  });
}

class UploadError extends Error {
  constructor(public code: UploadErrorCode) {
    super(code);
  }
}

async function uploadOne(homeworkId: string, file: File, onProgress: (pct: number) => void) {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ homeworkId, name: file.name, size: file.size }),
  });
  const ticket = (await res.json().catch(() => ({ error: "uploadFailed" }))) as Ticket | { error: UploadErrorCode };
  if (!res.ok || "error" in ticket) throw new UploadError("error" in ticket ? ticket.error : "uploadFailed");

  if (ticket.driver === "blob") {
    await put(ticket.key, file, {
      access: "private",
      token: ticket.token,
      contentType: ticket.contentType,
      multipart: file.size > 5 * 1024 * 1024,
      onUploadProgress: ({ percentage }) => onProgress(Math.round(percentage)),
    });
  } else {
    await putLocal(ticket.uploadUrl, file, ticket.contentType, onProgress);
  }

  const result = await attachUpload({ homeworkId, key: ticket.key, name: file.name });
  if (result.error) throw new UploadError(result.error);
}

export function FileUploader({
  homeworkId,
  files,
  labels,
}: {
  homeworkId: string;
  files: UploadedFile[];
  labels: Dictionary["files"];
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [removing, startRemoving] = useTransition();
  const busy = progress !== null || removing;
  const vars = (name = "") => ({ name, mb: MB, max: MAX_FILES_PER_HOMEWORK });

  async function onPick(picked: FileList | null) {
    if (!picked?.length) return;
    const problems: string[] = [];
    let room = MAX_FILES_PER_HOMEWORK - files.length;
    // Files go up one at a time so the server's count check stays accurate.
    for (const file of Array.from(picked)) {
      if (room <= 0) {
        problems.push(fmt(labels.errors.tooManyFiles, vars()));
        break;
      }
      if (!contentTypeFor(file.name)) {
        problems.push(fmt(labels.errors.fileType, vars(file.name)));
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        problems.push(fmt(labels.errors.fileTooBig, vars(file.name)));
        continue;
      }
      setProgress({ name: file.name, pct: 0 });
      try {
        await uploadOne(homeworkId, file, (pct) => setProgress({ name: file.name, pct }));
        room--;
      } catch (e) {
        const code = e instanceof UploadError ? e.code : "uploadFailed";
        problems.push(fmt(labels.errors[code], vars(file.name)));
      }
    }
    setProgress(null);
    setErrors(problems);
    if (input.current) input.current.value = "";
  }

  function onRemove(file: UploadedFile) {
    startRemoving(async () => {
      const result = await removeUpload(file.id);
      setErrors(result.error ? [fmt(labels.errors[result.error], vars(file.name))] : []);
    });
  }

  return (
    <div>
      <span className="mb-1 block text-sm font-medium">{labels.title}</span>
      {files.length > 0 && (
        <ul className="mb-2 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <a href={`/api/files/${file.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm font-medium text-accent">
                  {file.name}
                </a>
                <span className="text-xs text-muted">
                  {formatBytes(file.size)}
                  <span className="ml-1 font-semibold text-warn">· {labels.pending}</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => onRemove(file)}
                disabled={busy}
                className="icon-btn"
                aria-label={fmt(labels.remove, { name: file.name })}
              >
                <TrashIcon width={18} height={18} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && <p className="mb-2 text-xs text-warn">{labels.pendingHint}</p>}

      {progress ? (
        <div className="rounded-xl border border-line bg-surface px-3 py-2 text-sm" aria-live="polite">
          <p className="truncate">{fmt(labels.uploading, { name: progress.name, pct: progress.pct })}</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${progress.pct}%` }} />
          </div>
        </div>
      ) : (
        files.length < MAX_FILES_PER_HOMEWORK && (
          <label className={`btn-ghost w-full cursor-pointer ${busy ? "pointer-events-none opacity-60" : ""}`}>
            + {labels.add}
            <input
              ref={input}
              type="file"
              multiple
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={(e) => onPick(e.target.files)}
            />
          </label>
        )
      )}
      <p className="mt-1 text-xs text-muted">{fmt(labels.hint, vars())}</p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
