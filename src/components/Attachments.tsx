import { useRef, useState } from "react";
import { ApiError, api, type Attachment } from "../api";
import { Icon } from "./Icon";
import { Button, Dialog, useToast } from "./ui";

// Must match the server's allowlist (server/src/services/attachments.ts).
const ACCEPT = ".jpg,.jpeg,.png,.gif,.webp,.mp4,.webm,.mov,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";
export const MAX_FILE_MB = 50;

export const fileUrl = (a: { id: string }, download = false) => `/api/attachments/${a.id}${download ? "?download=1" : ""}`;

const extOf = (name: string) => name.slice(name.lastIndexOf(".")).toLowerCase();

/** Checks a picked file against the allowed types and size; returns a message when it can't be attached. */
export function fileProblem(file: File): string | null {
  if (!ACCEPT.split(",").includes(extOf(file.name))) return `${file.name}: use a photo, video or document (PDF, Word, Excel, PowerPoint, text).`;
  if (file.size > MAX_FILE_MB * 1024 * 1024) return `${file.name} is larger than ${MAX_FILE_MB} MB.`;
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

export function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

/** Uploads one file to an entry, reporting progress from 0 to 1. */
export function uploadAttachment(entryId: string, file: File, onProgress?: (fraction: number) => void): Promise<Attachment> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/entries/${entryId}/attachments`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-Requested-With", "rnxa-web");
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      let data: { attachment?: Attachment; error?: { code?: string; message?: string } } | null = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data?.attachment) resolve(data.attachment);
      else reject(new ApiError(xhr.status, data?.error?.code ?? "ERROR", data?.error?.message ?? `Couldn't upload ${file.name}.`));
    };
    xhr.onerror = () => reject(new ApiError(0, "NETWORK", `Couldn't upload ${file.name}. Check your connection and try again.`));
    xhr.send(file);
  });
}

function KindIcon({ kind, size = 18 }: { kind: Attachment["kind"]; size?: number }) {
  return <Icon name={kind === "IMAGE" ? "image" : kind === "VIDEO" ? "video" : "file"} size={size} />;
}

/** Thumbnails of an entry's files. Tap one to view it; `onRemove` adds a remove button. */
export function AttachmentStrip({ attachments, onRemove }: { attachments: Attachment[]; onRemove?: (a: Attachment) => void }) {
  const [viewing, setViewing] = useState<Attachment | null>(null);
  if (!attachments.length) return null;
  return (
    <>
      <ul className="attach-strip" aria-label="Attached files">
        {attachments.map((a) => (
          <li key={a.id} className={`attach-tile kind-${a.kind.toLowerCase()}`}>
            <button type="button" className="attach-open" onClick={() => setViewing(a)} title={`${a.fileName} · ${formatSize(a.size)}`} aria-label={`Open ${a.fileName}`}>
              {a.kind === "IMAGE" ? (
                <img src={fileUrl(a)} alt="" loading="lazy" />
              ) : a.kind === "VIDEO" ? (
                <>
                  <video src={`${fileUrl(a)}#t=0.5`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} />
                  <span className="attach-play" aria-hidden="true">
                    <Icon name="play" size={14} />
                  </span>
                </>
              ) : (
                <span className="attach-doc">
                  <KindIcon kind={a.kind} size={20} />
                  <span className="attach-ext">{extOf(a.fileName).slice(1).toUpperCase()}</span>
                </span>
              )}
            </button>
            {onRemove && (
              <button type="button" className="attach-remove" aria-label={`Remove ${a.fileName}`} onClick={() => onRemove(a)}>
                <Icon name="x" size={12} />
              </button>
            )}
          </li>
        ))}
      </ul>
      <AttachmentViewer attachment={viewing} onClose={() => setViewing(null)} />
    </>
  );
}

/** Large view of one file: photos and PDFs inline, videos in a player, other documents as a download. */
export function AttachmentViewer({ attachment: a, onClose }: { attachment: Attachment | null; onClose: () => void }) {
  return (
    <Dialog
      open={a !== null}
      title={a?.fileName ?? ""}
      onClose={onClose}
      footer={
        a && (
          <>
            <span className="small muted" style={{ marginRight: "auto" }}>
              {formatSize(a.size)}
            </span>
            <a className="btn btn-secondary" href={fileUrl(a, true)} download={a.fileName}>
              <Icon name="download" size={16} /> Download
            </a>
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </>
        )
      }
    >
      {a && (
        <div className="attach-viewer">
          {a.kind === "IMAGE" ? (
            <img src={fileUrl(a)} alt={a.fileName} />
          ) : a.kind === "VIDEO" ? (
            <video src={fileUrl(a)} controls autoPlay playsInline />
          ) : a.mimeType === "application/pdf" ? (
            <iframe src={fileUrl(a)} title={a.fileName} />
          ) : (
            <div className="attach-viewer-doc">
              <KindIcon kind={a.kind} size={40} />
              <p>This document opens in its own app. Download it to read it.</p>
            </div>
          )}
        </div>
      )}
    </Dialog>
  );
}

/** "Attach" button: opens the file picker (camera on phones) and hands back the valid files. */
export function AttachButton({ onFiles, label = "Attach photo, video or document", disabled }: { onFiles: (files: File[]) => void; label?: string; disabled?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  return (
    <>
      <Button size="sm" icon="paperclip" disabled={disabled} onClick={() => input.current?.click()}>
        {label}
      </Button>
      <input
        ref={input}
        type="file"
        multiple
        accept={ACCEPT}
        hidden
        onChange={(e) => {
          const picked = [...(e.target.files ?? [])];
          e.target.value = "";
          const ok: File[] = [];
          for (const f of picked) {
            const problem = fileProblem(f);
            if (problem) toast("error", problem);
            else ok.push(f);
          }
          if (ok.length) onFiles(ok);
        }}
      />
    </>
  );
}

/**
 * Files on an entry that is already saved (e.g. submitted and waiting): add
 * or remove straight away. Used in timesheet day boxes.
 */
export function EntryFiles({ entryId, attachments, canChange, onChanged }: { entryId: string; attachments: Attachment[]; canChange: boolean; onChanged: () => void }) {
  const toast = useToast();
  const [progress, setProgress] = useState<string | null>(null);
  async function add(files: File[]) {
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadAttachment(entryId, files[i], (p) => setProgress(`Uploading ${files.length > 1 ? `${i + 1} of ${files.length} · ` : ""}${Math.round(p * 100)}%`));
      }
      toast("success", files.length === 1 ? "File attached." : `${files.length} files attached.`);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setProgress(null);
      onChanged();
    }
  }
  async function remove(a: Attachment) {
    try {
      await api.delete(`/attachments/${a.id}`);
      onChanged();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }
  if (!attachments.length && !canChange) return null;
  return (
    <div className="entry-files">
      <AttachmentStrip attachments={attachments} onRemove={canChange ? remove : undefined} />
      {canChange &&
        (progress ? (
          <span className="small muted" role="status">
            {progress}
          </span>
        ) : (
          <AttachButton onFiles={add} label={attachments.length ? "Add file" : "Attach file"} />
        ))}
    </div>
  );
}
