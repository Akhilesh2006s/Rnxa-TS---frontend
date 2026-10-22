import { useEffect, useMemo, useState } from "react";
import { api, qs, type Entry, type EntryStatus } from "../api";
import { AttachmentStrip } from "../components/Attachments";
import {
  Alert,
  Button,
  Card,
  Dialog,
  Empty,
  Field,
  Loading,
  PageHeader,
  StatusBadge,
  useLoad,
  useToast,
} from "../components/ui";
import { useAssistant } from "../assistant/AssistantContext";
import { useUrlState } from "../useUrlState";
import { STATUS_LABEL, formatMinutes, formatShortDate, formatStamp } from "../format";

type Action = "APPROVE" | "REQUEST_CHANGES" | "REJECT" | "REOPEN";

const ACTION_COPY: Record<Action, { title: string; button: string; needsComment: boolean; label: string }> = {
  APPROVE: { title: "Verify entries", button: "Verify", needsComment: false, label: "Comment (optional)" },
  REQUEST_CHANGES: { title: "Request changes", button: "Request changes", needsComment: true, label: "What needs to change?" },
  REJECT: { title: "Reject entries", button: "Reject", needsComment: true, label: "Reason for rejection" },
  REOPEN: { title: "Reopen approved entries", button: "Reopen", needsComment: true, label: "Reason for reopening" },
};

export function Reviews() {
  const toast = useToast();
  const [status, setStatus] = useUrlState<EntryStatus>("status", "SUBMITTED");
  const [userId, setUserId] = useUrlState<string>("userId", "");
  const [projectId, setProjectId] = useUrlState<string>("projectId", "");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Filters can change from outside (links, the assistant); drop selections that no longer apply.
  useEffect(() => setSelected(new Set()), [status, userId, projectId]);
  const [action, setAction] = useState<Action | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const { dataVersion } = useAssistant();

  const { data, error, reload } = useLoad(
    () => api.get<{ entries: Entry[] }>(`/reviews${qs({ status, userId, projectId })}`).then((r) => r.entries),
    [status, userId, projectId, dataVersion],
  );
  const entries = data ?? [];

  // Filter options come from what the reviewer can already see.
  const options = useLoad(() => api.get<{ projects: { id: string; code: string; name: string }[]; users: { id: string; name: string }[] }>("/reports/options"), []);

  const groups = useMemo(() => {
    const map = new Map<string, { name: string; entries: Entry[] }>();
    for (const e of entries) {
      const g = map.get(e.userId) ?? { name: e.user.name, entries: [] };
      g.entries.push(e);
      map.set(e.userId, g);
    }
    return [...map.entries()];
  }, [entries]);

  const actionable = status === "SUBMITTED" || status === "APPROVED";
  const toggle = (ids: string[], on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  /** One click: verify everything this person has waiting. */
  async function verifyAll(ids: string[], name: string) {
    setBusy(true);
    try {
      const r = await api.post<{ updated: number }>("/reviews/actions", { ids, action: "APPROVE" });
      toast("success", `Verified ${r.updated} ${r.updated === 1 ? "entry" : "entries"} for ${name}.`);
      setSelected(new Set());
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function runAction() {
    if (!action) return;
    setBusy(true);
    setActionError(null);
    try {
      const r = await api.post<{ updated: number }>("/reviews/actions", { ids: [...selected], action, comment: comment.trim() || undefined });
      toast("success", `${ACTION_COPY[action].button}: ${r.updated} ${r.updated === 1 ? "entry" : "entries"}.`);
      setAction(null);
      setComment("");
      setSelected(new Set());
      reload();
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const selectedMinutes = entries.filter((e) => selected.has(e.id)).reduce((s, e) => s + e.minutes, 0);

  return (
    <div className="page">
      <PageHeader
        title="Verify time"
        description="Time submitted by the people you verify. Routine time is verified automatically, so what's here needs a look."
      />

      <Card>
        <div className="toolbar">
          <Field label="Status">
            {(p) => (
              <select
                {...p}
                className="select"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as EntryStatus);
                  setSelected(new Set());
                }}
              >
                {(["SUBMITTED", "CHANGES_REQUESTED", "APPROVED", "REJECTED"] as EntryStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Employee">
            {(p) => (
              <select {...p} className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
                <option value="">Everyone</option>
                {options.data?.users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Project">
            {(p) => (
              <select {...p} className="select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                <option value="">All projects</option>
                {options.data?.projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.code} · {pr.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Card>

      {error && <Alert tone="error">{error}</Alert>}

      {actionable && selected.size > 0 && (
        <div className="card" style={{ padding: "12px 16px", position: "sticky", top: 8, zIndex: 5 }}>
          <div className="row">
            <strong>
              {selected.size} selected · {formatMinutes(selectedMinutes)}
            </strong>
            <span className="spacer" />
            {status === "SUBMITTED" ? (
              <>
                <Button size="sm" variant="primary" icon="check" onClick={() => setAction("APPROVE")}>
                  Verify
                </Button>
                <Button size="sm" icon="undo" onClick={() => setAction("REQUEST_CHANGES")}>
                  Request changes
                </Button>
                <Button size="sm" variant="danger" icon="xCircle" onClick={() => setAction("REJECT")}>
                  Reject
                </Button>
              </>
            ) : (
              <Button size="sm" icon="undo" onClick={() => setAction("REOPEN")}>
                Reopen for correction
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {!data ? (
        <Loading />
      ) : groups.length === 0 ? (
        <Card>
          <Empty title={status === "SUBMITTED" ? "Nothing waiting for you to verify" : `No ${STATUS_LABEL[status].toLowerCase()} entries`}>
            {status === "SUBMITTED" ? "New submissions in your scope will appear here." : "Try a different filter."}
          </Empty>
        </Card>
      ) : (
        groups.map(([uid, g]) => {
          const ids = g.entries.map((e) => e.id);
          const allOn = ids.every((id) => selected.has(id));
          return (
            <Card
              key={uid}
              title={g.name}
              description={`${g.entries.length} ${g.entries.length === 1 ? "entry" : "entries"} · ${formatMinutes(g.entries.reduce((s, e) => s + e.minutes, 0))}`}
              actions={
                actionable && (
                  <>
                    <label className="checkbox small">
                      <input type="checkbox" checked={allOn} onChange={(e) => toggle(ids, e.target.checked)} />
                      Select
                    </label>
                    {status === "SUBMITTED" && (
                      <Button size="sm" variant="primary" icon="check" busy={busy} onClick={() => verifyAll(ids, g.name)}>
                        Verify all ({formatMinutes(g.entries.reduce((s, e) => s + e.minutes, 0))})
                      </Button>
                    )}
                  </>
                )
              }
              flush
            >
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      {actionable && (
                        <th className="shrink">
                          <span className="sr-only">Select</span>
                        </th>
                      )}
                      <th>Date</th>
                      <th>Project · Phase</th>
                      <th>Description</th>
                      <th className="right">Duration</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.entries.map((e) => (
                      <tr key={e.id}>
                        {actionable && (
                          <td className="shrink">
                            <input
                              type="checkbox"
                              aria-label={`Select ${formatShortDate(e.workDate)} ${e.project.code} ${formatMinutes(e.minutes)}`}
                              checked={selected.has(e.id)}
                              onChange={(ev) => toggle([e.id], ev.target.checked)}
                              style={{ width: 16, height: 16, accentColor: "var(--color-brand-primary)" }}
                            />
                          </td>
                        )}
                        <td className="num" style={{ whiteSpace: "nowrap" }}>
                          {formatShortDate(e.workDate)}
                        </td>
                        <td>
                          <div className="cell-title">{e.project.code}</div>
                          <div className="cell-sub">{e.phase?.name ?? e.project.name}</div>
                        </td>
                        <td>
                          <div className="cell-desc">{e.description}</div>
                          <AttachmentStrip attachments={e.attachments ?? []} />
                          {e.reviewerComment && (
                            <div className="cell-sub" style={{ marginTop: 4 }}>
                              <strong>{e.reviewer?.name}:</strong> {e.reviewerComment}
                            </div>
                          )}
                          {e.submittedAt && status === "SUBMITTED" && <div className="cell-sub">Submitted {formatStamp(e.submittedAt)}</div>}
                        </td>
                        <td className="right num">{formatMinutes(e.minutes)}</td>
                        <td>
                          <StatusBadge status={e.status} />
                          {e.status === "APPROVED" && (
                            <div className="cell-sub" style={{ marginTop: 4 }}>
                              {e.autoVerified ? "Automatically" : `By ${e.reviewer?.name ?? "admin"}`}
                              {e.reviewedAt ? ` · ${formatStamp(e.reviewedAt)}` : ""}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}

      <Dialog
        open={action !== null}
        title={action ? ACTION_COPY[action].title : ""}
        onClose={() => {
          setAction(null);
          setActionError(null);
        }}
        footer={
          action && (
            <>
              <Button onClick={() => setAction(null)}>Cancel</Button>
              <Button
                variant={action === "REJECT" ? "danger" : "primary"}
                busy={busy}
                disabled={ACTION_COPY[action].needsComment && !comment.trim()}
                onClick={runAction}
              >
                {ACTION_COPY[action].button} {selected.size} {selected.size === 1 ? "entry" : "entries"}
              </Button>
            </>
          )
        }
      >
        {action && (
          <>
            <p>
              {action === "REJECT"
                ? "Rejected entries are closed and cannot be edited. Use this for time that should not have been logged. To get a correction instead, request changes."
                : action === "REOPEN"
                  ? "Reopening returns approved entries to the employee for correction. The reason is recorded in the audit log."
                  : action === "REQUEST_CHANGES"
                    ? "The employee will see your comment and can edit and resubmit."
                    : "Verified entries are locked. Corrections then require reopening."}
            </p>
            {actionError && <Alert tone="error">{actionError}</Alert>}
            <Field label={ACTION_COPY[action].label}>
              {(p) => <textarea {...p} className="textarea" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />}
            </Field>
          </>
        )}
      </Dialog>
    </div>
  );
}
