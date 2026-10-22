import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, type Entry, type LoggableProject, type WeekSummary } from "../api";
import { useUser } from "../auth";
import { useAssistant } from "../assistant/AssistantContext";
import { QuickLog } from "../assistant/QuickLog";
import { canListen } from "../assistant/voice";
import { EntryDialog } from "../components/EntryDialog";
import type { Prefill } from "../components/EntryForm";
import { entryStatus } from "../components/entryStatus";
import { Icon } from "../components/Icon";
import { Alert, Button, Dialog, Loading, Meter, useLoad, useToast } from "../components/ui";
import { formatDay, formatHours, formatLongDate, formatMinutes, formatShortDate, todayIso, weekStartIso } from "../format";
import { PHASE_STATUS, type ProjectDetail } from "./ProjectsPage";

const checkinPrompt = "Start my end-of-day check-in: ask me what I worked on today, then log it for me.";

/**
 * The personal dashboard: write with AI, see where today and the week stand,
 * submit, and keep an eye on your projects and their phases.
 */
export function MyWeek() {
  const user = useUser();
  const toast = useToast();
  const navigate = useNavigate();
  const { dataVersion, startVoice } = useAssistant();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const weekStart = weekStartIso(today);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);

  const week = useLoad(() => api.get<WeekSummary>(`/weeks/${weekStart}`), [dataVersion, version]);
  const projects = useLoad(
    () =>
      Promise.all([api.get<{ projects: LoggableProject[] }>("/projects"), api.get<{ projects: ProjectDetail[] }>("/project-details")]).then(([mine, details]) =>
        mine.projects.map((p) => ({ ...p, detail: details.projects.find((d) => d.id === p.id) ?? null })),
      ),
    [dataVersion, version],
  );
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [newFor, setNewFor] = useState<Prefill | null>(null);
  const [repeat, setRepeat] = useState<{ plan: { workDate: string; label: string; minutes: number; description: string }[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState(false);

  const w = week.data;

  // Opened from the end-of-day reminder: start the spoken check-in straight away.
  useEffect(() => {
    if (params.get("checkin") !== "1") return;
    setParams({}, { replace: true });
    if (canListen()) startVoice(checkinPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const verifierName = w?.verifier?.name ?? "an admin";
  const todayDay = w?.days.find((d) => d.date === today);
  const toSubmit = useMemo(() => w?.entries.filter((e) => (e.status === "DRAFT" || e.status === "CHANGES_REQUESTED") && e.workDate <= today) ?? [], [w, today]);
  const minutesBy = (status: string) => (w?.entries ?? []).filter((e) => e.status === status).reduce((s, e) => s + e.minutes, 0);
  const returned = (w?.entries ?? []).filter((e) => e.status === "CHANGES_REQUESTED");
  const recent = useMemo(
    () => [...(w?.entries ?? [])].sort((a, b) => b.workDate.localeCompare(a.workDate) || (b.startTime ?? "").localeCompare(a.startTime ?? "")).slice(0, 6),
    [w],
  );
  const showCheckin =
    !!w && w.hasProjects && w.checkin.enabled && !!todayDay && todayDay.expectedMinutes > 0 && todayDay.minutes < todayDay.expectedMinutes && new Date().getHours() >= w.checkin.reminderHour;
  const suggestStart = (date: string) =>
    (w?.entries ?? [])
      .filter((e) => e.workDate === date && e.endTime)
      .map((e) => e.endTime!)
      .sort()
      .at(-1) ?? null;

  async function submit() {
    setBusy(true);
    try {
      const r = await api.post<{ submitted: number; autoVerified: number }>(`/weeks/${weekStart}/submit`);
      const waiting = r.submitted - r.autoVerified;
      toast(
        "success",
        r.autoVerified === r.submitted
          ? `Submitted and verified automatically (${r.submitted} ${r.submitted === 1 ? "entry" : "entries"}).`
          : `Submitted. ${r.autoVerified ? `${r.autoVerified} verified automatically, ` : ""}${waiting} waiting for ${verifierName}.`,
      );
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function previewRepeat() {
    setBusy(true);
    try {
      const r = await api.post<{ plan: { workDate: string; label: string; minutes: number; description: string }[] }>(`/weeks/${weekStart}/repeat-previous`, { preview: true });
      if (!r.plan.length) toast("info", "Nothing to copy: last week had no time on the days that are still empty.");
      else setRepeat(r);
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function applyRepeat() {
    setBusy(true);
    try {
      const r = await api.post<{ created: number }>(`/weeks/${weekStart}/repeat-previous`, {});
      toast("success", `Added ${r.created} draft ${r.created === 1 ? "entry" : "entries"} from last week. Adjust anything, then submit.`);
      setRepeat(null);
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const addFor = (prefill: Prefill | null) => {
    setNewFor(prefill);
    setEditing("new");
  };

  return (
    <div className="page dashboard">
      <header className="myweek-head">
        <div>
          <h1>Hi {user.name.split(" ")[0]}</h1>
          <p className="muted">
            {formatLongDate(today)}
            {w && (
              <>
                {" · "}your time is verified by <strong>{w.verifier?.name ?? "an admin"}</strong>
              </>
            )}
          </p>
        </div>
        <Link to="/timesheet" className="btn btn-secondary">
          <Icon name="clock" /> Open timesheet
        </Link>
      </header>

      {week.error && <Alert tone="error">{week.error}</Alert>}
      {!w ? (
        <Loading />
      ) : !w.hasProjects ? (
        <NoProjects
          asked={asked}
          onAsk={async () => {
            try {
              await api.post("/me/request-projects");
              setAsked(true);
            } catch (e) {
              toast("error", (e as Error).message);
            }
          }}
        />
      ) : (
        <>
          {showCheckin && (
            <section className="checkin" aria-label="End-of-day check-in">
              <span className="assistant-mark" aria-hidden="true">
                <Icon name="sparkle" size={16} />
              </span>
              <div style={{ flex: 1 }}>
                <strong>End of the day: what did you work on today?</strong>
                <p className="small muted">
                  You've logged {formatHours(todayDay!.minutes)} of {formatHours(todayDay!.expectedMinutes)} today. Tell RNXA and it writes it up for you.
                </p>
              </div>
              {canListen() && (
                <Button variant="primary" icon="mic" onClick={() => startVoice(checkinPrompt)}>
                  Talk
                </Button>
              )}
            </section>
          )}

          <QuickLog
            title="Write with AI"
            hint={"Say what you did in your own words, with times if you like (“9 to 11 on Acme build”). RNXA writes tidy entries for you to approve."}
            placeholder="e.g. 9 to 12 on Acme build fixing the discount rule, then 1h client call"
          >
            <div className="row quick-actions">
              <Button size="sm" icon="history" onClick={previewRepeat} busy={busy && !repeat}>
                Repeat last week
              </Button>
              <Button size="sm" variant="ghost" icon="plus" onClick={() => addFor(null)}>
                Add manually
              </Button>
            </div>
          </QuickLog>

          <div className="grid grid-4 dash-stats">
            <div className="card stat">
              <div className="stat-label">Today</div>
              <div className="stat-value">{formatHours(todayDay?.minutes ?? 0)}</div>
              <Meter value={todayDay?.minutes ?? 0} max={todayDay?.expectedMinutes || 1} />
              <div className="stat-meta">{todayDay?.expectedMinutes ? `of ${formatHours(todayDay.expectedMinutes)}` : "Day off"}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">This week</div>
              <div className="stat-value">{formatHours(w.totalMinutes)}</div>
              <Meter value={w.totalMinutes} max={w.expectedMinutes || 1} />
              <div className="stat-meta">of {formatHours(w.expectedMinutes)}</div>
            </div>
            <div className="card stat">
              <div className="stat-label">Verified</div>
              <div className="stat-value">{formatHours(minutesBy("APPROVED"))}</div>
              <div className="stat-meta">
                {formatHours(minutesBy("SUBMITTED"))} waiting for {verifierName}
              </div>
            </div>
            <div className="card stat stat-action">
              <div className="stat-label">Ready to submit</div>
              <div className="stat-value">{toSubmit.length}</div>
              {toSubmit.length ? (
                <Button size="sm" variant="primary" icon="send" busy={busy} onClick={submit}>
                  Submit {formatMinutes(toSubmit.reduce((s, e) => s + e.minutes, 0))}
                </Button>
              ) : (
                <div className="stat-meta">Nothing waiting</div>
              )}
            </div>
          </div>

          {returned.length > 0 && (
            <Alert tone="warning" title={`${verifierName} asked for changes on ${returned.length} ${returned.length === 1 ? "entry" : "entries"}`}>
              {returned.map((e) => `${formatShortDate(e.workDate)} ${e.project.code}: ${e.reviewerComment ?? ""}`).join(" · ")} <Link to="/timesheet">Fix in timesheet</Link>
            </Alert>
          )}

          <div className="grid dash-grid">
            <section className="card" aria-labelledby="week-boxes">
              <div className="card-header">
                <h2 id="week-boxes">This week</h2>
                <Link to="/timesheet" className="small">
                  Open timesheet
                </Link>
              </div>
              <div className="mini-week">
                {w.days.map((d) => {
                  const locked = w.lockedDays?.includes(d.date);
                  return (
                    <button
                      key={d.date}
                      type="button"
                      className={`mini-day ${d.date === today ? "is-today" : ""} ${d.missing ? "short" : ""} ${locked ? "locked-day" : ""}`}
                      onClick={() => navigate(`/timesheet?day=${d.date}`)}
                      aria-label={`${formatLongDate(d.date)}: ${formatHours(d.minutes)}${locked ? ", verified and locked" : ""}`}
                    >
                      <span className="mini-name">{formatDay(d.date)}</span>
                      <span className="mini-date">{Number(d.date.slice(8))}</span>
                      <span className="mini-hours num">{formatHours(d.minutes)}</span>
                      {locked ? <Icon name="checkCircle" size={14} /> : d.missing ? <Icon name="alert" size={14} /> : <span className="mini-gap" />}
                    </button>
                  );
                })}
              </div>
              <h3 className="dash-sub">Recent activity</h3>
              {recent.length === 0 ? (
                <p className="muted small" style={{ padding: "0 20px 20px" }}>
                  Nothing logged this week yet. Tell RNXA what you did above.
                </p>
              ) : (
                <ul className="activity">
                  {recent.map((e) => {
                    const s = entryStatus(e, verifierName);
                    return (
                      <li key={e.id}>
                        <span className="activity-when num">
                          {formatDay(e.workDate)} {e.startTime ? `${e.startTime}–${e.endTime}` : formatShortDate(e.workDate)}
                        </span>
                        <span className="activity-what">
                          <strong>{e.project.code}</strong>
                          {e.phase && <span className="muted"> · {e.phase.name}</span>} — {e.description || <em className="muted">No description</em>}
                        </span>
                        <span className="num">{formatMinutes(e.minutes)}</span>
                        <span className={`badge tone-${s.tone}`}>
                          <Icon name={s.icon} size={12} />
                          {s.text}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section aria-labelledby="my-projects" className="stack">
              <div className="row section-head">
                <h2 id="my-projects">My projects</h2>
                <span className="spacer" />
                <Link to="/projects" className="small">
                  All details
                </Link>
              </div>
              {(projects.data ?? []).map((p) => {
                const phases = p.detail?.phases ?? [];
                const current = phases.find((ph) => ph.status === "IN_PROGRESS");
                return (
                  <article key={p.id} className="card project-card">
                    <div className="project-pick" style={{ cursor: "default" }}>
                      <span className="project-code">{p.code}</span>
                      <span className="project-name">{p.name}</span>
                      <span className="muted small">
                        {p.client ?? "Internal"}
                        {current && ` · now in ${current.name}`}
                      </span>
                      <span className="project-hours">
                        <span>
                          <strong className="num">{formatHours(p.myMinutesThisWeek ?? 0)}</strong> this week
                        </span>
                        <span>
                          <strong className="num">{formatHours(p.myMinutesTotal ?? 0)}</strong> total
                        </span>
                      </span>
                    </div>
                    {phases.length > 0 && (
                      <ol className="phase-chips" aria-label={`${p.code} phases`}>
                        {phases.map((ph) => (
                          <li key={ph.id} className={`phase-chip ${ph.status.toLowerCase()}`} title={ph.description ?? undefined}>
                            <Icon name={PHASE_STATUS[ph.status].icon} size={12} />
                            {ph.name}
                          </li>
                        ))}
                      </ol>
                    )}
                    <Button size="sm" icon="plus" onClick={() => addFor({ projectId: p.id, phaseId: current?.id ?? null })}>
                      Log time
                    </Button>
                  </article>
                );
              })}
            </section>
          </div>
        </>
      )}

      <EntryDialog
        entry={editing}
        prefill={newFor}
        suggestStart={suggestStart}
        defaultDate={today}
        onClose={() => {
          setEditing(null);
          setNewFor(null);
        }}
        onSaved={() => {
          setEditing(null);
          setNewFor(null);
          reload();
        }}
      />

      <Dialog
        open={!!repeat}
        title="Repeat last week"
        onClose={() => setRepeat(null)}
        footer={
          <>
            <Button onClick={() => setRepeat(null)}>Cancel</Button>
            <Button variant="primary" busy={busy} onClick={applyRepeat}>
              Add {repeat?.plan.length} {repeat?.plan.length === 1 ? "draft" : "drafts"}
            </Button>
          </>
        }
      >
        <p>These will be added as drafts on the same days this week. Days that already have time are left alone. Nothing is submitted.</p>
        <ul className="repeat-list">
          {repeat?.plan.map((p, i) => (
            <li key={i}>
              <strong>
                {formatDay(p.workDate)} {formatShortDate(p.workDate)}
              </strong>
              <span>{p.label}</span>
              <span className="num">{formatMinutes(p.minutes)}</span>
              <span className="muted small">{p.description}</span>
            </li>
          ))}
        </ul>
      </Dialog>
    </div>
  );
}

function NoProjects({ asked, onAsk }: { asked: boolean; onAsk: () => void }) {
  return (
    <section className="card empty-projects">
      <Icon name="folder" size={28} />
      <h2>You're not on a project yet</h2>
      <p className="muted">To log time you need to be added to at least one project. An admin does this under Projects &amp; phases. It takes them a minute.</p>
      {asked ? (
        <p className="row" style={{ justifyContent: "center", color: "var(--color-status-success)" }}>
          <Icon name="checkCircle" /> We've let the admins know. You'll see your projects here as soon as you're added.
        </p>
      ) : (
        <Button variant="primary" icon="bell" onClick={onAsk}>
          Ask an admin to add me
        </Button>
      )}
    </section>
  );
}
