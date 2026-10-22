import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type Attachment, type Entry, type LoggableProject } from "../api";
import { useUser } from "../auth";
import { formatLongDate, formatMinutes, formatStamp, parseDuration } from "../format";
import { AttachButton, AttachmentStrip, formatSize, uploadAttachment } from "./Attachments";
import { Icon } from "./Icon";
import { RewriteAssist } from "./RewriteAssist";
import { Alert, Button, Field, useToast } from "./ui";

export interface Recent {
  project: { id: string; code: string; name: string };
  phase: { id: string; name: string } | null;
}

/** Prefill for a new entry: project/phase/description, never hours. */
export interface Prefill {
  projectId?: string | null;
  phaseId?: string | null;
  description?: string;
  /** Start a new entry as a time slot, e.g. after tapping an empty hour. */
  startTime?: string;
  endTime?: string;
}

// Remembered per user, so people sharing a browser don't inherit each other's selection.
const lastKey = (userId: string) => `rnxa.lastProjectPhase.${userId}`;

function readLast(userId: string): Prefill | null {
  try {
    return JSON.parse(localStorage.getItem(lastKey(userId)) ?? "null");
  } catch {
    return null;
  }
}

function writeLast(userId: string, value: Prefill) {
  try {
    localStorage.setItem(lastKey(userId), JSON.stringify({ projectId: value.projectId, phaseId: value.phaseId }));
  } catch {
    // Storage unavailable: remembering the selection is a convenience only.
  }
}

interface Props {
  projects: LoggableProject[];
  recent: Recent[];
  date: string;
  maxDate: string;
  editing: Entry | null;
  prefill: Prefill | null;
  onSaved: (entry: Entry) => void;
  onCancelEdit: () => void;
  onDirtyChange: (dirty: boolean) => void;
  /** Suggested start time for a new time slot on a day, e.g. where the last slot ended. */
  suggestStart?: (date: string) => string | null;
}

type Mode = "total" | "slot";
const modeKey = (userId: string) => `rnxa.entryMode.${userId}`;
function readMode(userId: string): Mode {
  try {
    return localStorage.getItem(modeKey(userId)) === "slot" ? "slot" : "total";
  } catch {
    return "total";
  }
}
const toMin = (t: string) => (/^\d{2}:\d{2}$/.test(t) ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) : null);

export function EntryForm({ projects, recent, date, maxDate, editing, prefill, onSaved, onCancelEdit, onDirtyChange, suggestStart }: Props) {
  const user = useUser();
  const toast = useToast();
  const initial = useMemo(() => {
    if (editing) {
      return {
        workDate: editing.workDate,
        projectId: editing.projectId,
        phaseId: editing.phaseId ?? "",
        duration: formatMinutes(editing.minutes),
        description: editing.description,
        mode: (editing.startTime ? "slot" : "total") as Mode,
        start: editing.startTime ?? "",
        end: editing.endTime ?? "",
      };
    }
    const last = prefill?.projectId ? prefill : readLast(user.id);
    const valid = last && projects.some((p) => p.id === last.projectId) ? last : null;
    return {
      workDate: date,
      projectId: valid?.projectId ?? (projects.length === 1 ? projects[0]!.id : ""),
      phaseId: valid?.phaseId ?? "",
      duration: "",
      description: prefill?.description ?? "",
      mode: prefill?.startTime ? ("slot" as Mode) : readMode(user.id),
      start: prefill?.startTime ?? suggestStart?.(date) ?? "",
      end: prefill?.endTime ?? "",
    };
    // `date` is read once here; later day changes only move the date (effect below).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, prefill, projects, user.id]);

  const [form, setForm] = useState(initial);
  // Files already on the entry (when editing) and files picked but not yet uploaded.
  const [files, setFiles] = useState<Attachment[]>(editing?.attachments ?? []);
  const [pending, setPending] = useState<File[]>([]);
  const [uploading, setUploading] = useState<string | null>(null);
  const [baseline, setBaseline] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    setForm(initial);
    setBaseline(initial);
    setErrors({});
    setServerError(null);
  }, [initial]);

  // Picking another day in the week strip moves the date without discarding typed work.
  useEffect(() => {
    if (!editing && !prefill?.startTime) {
      const start = suggestStart?.(date) ?? "";
      setForm((f) => ({ ...f, workDate: date, start: f.start && f.workDate === date ? f.start : start }));
      setBaseline((b) => ({ ...b, workDate: date, start }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, editing]);

  const dirty = (["projectId", "phaseId", "duration", "description", "end"] as const).some((k) => form[k] !== baseline[k]);
  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  const project = projects.find((p) => p.id === form.projectId);
  const slotStart = toMin(form.start);
  const slotEnd = toMin(form.end);
  const parsedMinutes = form.mode === "slot" ? (slotStart !== null && slotEnd !== null ? slotEnd - slotStart : null) : parseDuration(form.duration);
  const setMode = (mode: Mode) => {
    set({ mode });
    try {
      localStorage.setItem(modeKey(user.id), mode);
    } catch {
      // Preference only.
    }
  };
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  function validate() {
    const next: Record<string, string> = {};
    if (!form.projectId) next.projectId = "Choose a project.";
    if (project?.phasesEnabled && !form.phaseId) next.phaseId = "Choose a phase.";
    if (form.mode === "slot") {
      if (slotStart === null || slotEnd === null) next.duration = "Pick a start and an end time.";
      else if (slotEnd <= slotStart) next.duration = "The end time must be after the start time.";
    } else if (parsedMinutes === null || parsedMinutes <= 0) next.duration = "Enter a duration such as 1:30, 1.5h or 90m.";
    else if (parsedMinutes > 24 * 60) next.duration = "A single entry cannot exceed 24 hours.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setServerError(null);
    const body = {
      workDate: form.workDate,
      projectId: form.projectId,
      phaseId: project?.phasesEnabled ? form.phaseId : null,
      ...(form.mode === "slot" ? { startTime: form.start, endTime: form.end } : { minutes: parsedMinutes!, startTime: null, endTime: null }),
      description: form.description.trim(),
    };
    try {
      const r = editing
        ? await api.patch<{ entry: Entry }>(`/entries/${editing.id}`, body)
        : await api.post<{ entry: Entry }>("/entries", body);
      writeLast(user.id, { projectId: body.projectId, phaseId: body.phaseId });
      // The entry is saved; now upload any picked files to it.
      const uploaded: Attachment[] = [];
      for (let i = 0; i < pending.length; i++) {
        try {
          uploaded.push(
            await uploadAttachment(r.entry.id, pending[i]!, (p) =>
              setUploading(`Uploading ${pending.length > 1 ? `${i + 1} of ${pending.length} · ` : ""}${Math.round(p * 100)}%`),
            ),
          );
        } catch (err) {
          toast("error", `Time saved, but ${(err as Error).message}`);
        }
      }
      setUploading(null);
      setPending([]);
      setFiles(editing ? [...files, ...uploaded] : []);
      setSavedAt(r.entry.updatedAt);
      onSaved({ ...r.entry, attachments: [...(r.entry.attachments ?? []), ...uploaded] });
      if (!editing) {
        // Keep date/project/phase so the next entry is quick; the next slot starts where this one ended.
        const next = { ...form, duration: "", description: "", start: form.mode === "slot" ? form.end : form.start, end: "" };
        setForm(next);
        setBaseline(next);
      }
    } catch (err) {
      setServerError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="stack" noValidate aria-label={editing ? "Edit entry" : "Log time"}>
      {editing?.status === "CHANGES_REQUESTED" && editing.reviewerComment && (
        <Alert tone="warning" title={`Changes requested by ${editing.reviewer?.name ?? "reviewer"}`}>
          {editing.reviewerComment}
        </Alert>
      )}
      {!editing && recent.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <span className="field-label">Reuse a recent project and phase</span>
          <div className="row">
            {recent.map((r) => {
              const pressed = form.projectId === r.project.id && (form.phaseId || null) === (r.phase?.id ?? null);
              return (
                <button
                  key={`${r.project.id}|${r.phase?.id ?? ""}`}
                  type="button"
                  className="chip"
                  aria-pressed={pressed}
                  onClick={() => set({ projectId: r.project.id, phaseId: r.phase?.id ?? "" })}
                >
                  <Icon name="history" size={14} />
                  <span>
                    {r.project.code}
                    {r.phase ? ` · ${r.phase.name}` : ""}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="form-grid">
        <Field label="Date" hint={formatLongDate(form.workDate)}>
          {(p) => (
            <input {...p} className="input" type="date" value={form.workDate} max={maxDate} required onChange={(e) => e.target.value && set({ workDate: e.target.value })} />
          )}
        </Field>
        <div className="field">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <span className="field-label">{form.mode === "slot" ? "Time" : "Hours"}</span>
            <div className="segmented" role="group" aria-label="How to enter time">
              <button type="button" aria-pressed={form.mode === "total"} onClick={() => setMode("total")}>
                Total hours
              </button>
              <button type="button" aria-pressed={form.mode === "slot"} onClick={() => setMode("slot")}>
                From – to
              </button>
            </div>
          </div>
          {form.mode === "total" ? (
            <input
              aria-label="Duration"
              aria-invalid={errors.duration ? true : undefined}
              className="input num"
              inputMode="decimal"
              autoComplete="off"
              placeholder="e.g. 1:30, 1.5h or 45m"
              value={form.duration}
              onChange={(e) => set({ duration: e.target.value })}
            />
          ) : (
            <div className="slot-inputs">
              <input aria-label="From" className="input num" type="time" step={300} value={form.start} onChange={(e) => set({ start: e.target.value })} />
              <span aria-hidden="true">to</span>
              <input aria-label="To" className="input num" type="time" step={300} value={form.end} onChange={(e) => set({ end: e.target.value })} />
            </div>
          )}
          {errors.duration ? (
            <span className="error-text">{errors.duration}</span>
          ) : (
            <span className="hint">{parsedMinutes && parsedMinutes > 0 ? `= ${formatMinutes(parsedMinutes)}` : form.mode === "slot" ? "Log what you did hour by hour" : "Or switch to From – to"}</span>
          )}
        </div>
        <Field label="Project" error={errors.projectId} className="span-2">
          {(p) => (
            <select {...p} className="select" value={form.projectId} onChange={(e) => set({ projectId: e.target.value, phaseId: "" })}>
              <option value="">Select a project</option>
              {projects.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.code} · {pr.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        {project?.phasesEnabled !== false && (
          <Field label="Phase" error={errors.phaseId} className="span-2">
            {(p) => (
              <select {...p} className="select" value={form.phaseId} disabled={!project} onChange={(e) => set({ phaseId: e.target.value })}>
                <option value="">{project ? "Select a phase" : "Choose a project first"}</option>
                {project?.phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        )}
        <Field label="Work description" className="span-2" hint="Plain language is fine. Required before you submit.">
          {(p) => (
            <textarea
              {...p}
              className="textarea"
              maxLength={4000}
              value={form.description}
              placeholder="What did you work on?"
              onChange={(e) => set({ description: e.target.value })}
            />
          )}
        </Field>
      </div>
      <RewriteAssist text={form.description} onApply={(t) => set({ description: t })} />

      <div className="field">
        <span className="field-label">Photos, videos or documents</span>
        <AttachmentStrip
          attachments={files}
          onRemove={async (a) => {
            try {
              await api.delete(`/attachments/${a.id}`);
              setFiles((list) => list.filter((x) => x.id !== a.id));
            } catch (err) {
              setServerError((err as Error).message);
            }
          }}
        />
        {pending.length > 0 && (
          <ul className="pending-files" aria-label="Files to attach">
            {pending.map((f, i) => (
              <li key={`${f.name}-${i}`}>
                <Icon name="paperclip" size={14} />
                <span className="pending-name">{f.name}</span>
                <span className="muted small">{formatSize(f.size)}</span>
                <button type="button" className="badge-x" aria-label={`Don't attach ${f.name}`} onClick={() => setPending((list) => list.filter((_, j) => j !== i))}>
                  <Icon name="x" size={12} />
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="row">
          <AttachButton onFiles={(picked) => setPending((list) => [...list, ...picked])} disabled={busy} />
          <span className="hint">{pending.length ? "Uploaded when you save." : "Optional proof of the work, up to 50 MB each."}</span>
        </div>
      </div>

      {serverError && <Alert tone="error">{serverError}</Alert>}

      <div className="row">
        <Button type="submit" variant="primary" icon={editing ? "check" : "plus"} busy={busy}>
          {editing ? "Save changes" : "Save draft"}
        </Button>
        {editing && <Button onClick={onCancelEdit}>Cancel</Button>}
        <span className="spacer" />
        {uploading ? (
          <span className="save-state" role="status">
            {uploading}
          </span>
        ) : dirty || pending.length ? (
          <span className="save-state dirty" role="status">
            <span className="dot" aria-hidden="true" />
            Unsaved changes
          </span>
        ) : savedAt ? (
          <span className="save-state" role="status">
            <Icon name="check" size={14} />
            Saved as draft · {formatStamp(savedAt)}
          </span>
        ) : null}
      </div>
    </form>
  );
}
