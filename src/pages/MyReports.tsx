import { api, type EntryStatus } from "../api";
import { Icon } from "../components/Icon";
import { Alert, BarList, Card, Empty, Field, Loading, Meter, PageHeader, Stat, useLoad } from "../components/ui";
import { addDaysIso, formatDay, formatFullDate, formatHours, formatMinutes, formatShortDate, todayIso, weekStartIso } from "../format";
import { useUrlPatch, useUrlState } from "../useUrlState";

interface MyReport {
  from: string;
  to: string;
  totals: {
    minutes: number;
    expectedMinutes: number;
    verifiedMinutes: number;
    waitingMinutes: number;
    draftMinutes: number;
    changesMinutes: number;
    daysLogged: number;
    entryCount: number;
  };
  byDay: { date: string; minutes: number }[];
  projects: {
    id: string;
    code: string;
    name: string;
    client: string | null;
    status: "active" | "not started" | "closed" | "removed";
    periodMinutes: number;
    verifiedMinutes: number;
    waitingMinutes: number;
    thisWeekMinutes: number;
    totalMinutes: number;
    lastWorked: string | null;
    phases: { name: string; minutes: number }[];
  }[];
  entries: {
    id: string;
    workDate: string;
    startTime: string | null;
    endTime: string | null;
    minutes: number;
    description: string;
    status: EntryStatus;
    autoVerified: boolean;
    project: { code: string; name: string };
    phase: { name: string } | null;
    reviewer: { name: string } | null;
  }[];
}

const today = todayIso();
const thisWeek = weekStartIso(today);
const monthStart = `${today.slice(0, 8)}01`;
const PRESETS: { label: string; from: string; to: string }[] = [
  { label: "This week", from: thisWeek, to: addDaysIso(thisWeek, 6) },
  { label: "Last week", from: addDaysIso(thisWeek, -7), to: addDaysIso(thisWeek, -1) },
  { label: "This month", from: monthStart, to: today },
  { label: "Last 30 days", from: addDaysIso(today, -29), to: today },
];

const PROJECT_STATUS: Record<MyReport["projects"][number]["status"], { tone: string; text: string }> = {
  active: { tone: "success", text: "Active" },
  "not started": { tone: "info", text: "Not started" },
  closed: { tone: "neutral", text: "Closed" },
  removed: { tone: "neutral", text: "No longer assigned" },
};

function statusText(e: MyReport["entries"][number]) {
  if (e.status === "APPROVED") return { tone: "success", text: e.autoVerified ? "Verified automatically" : `Verified by ${e.reviewer?.name ?? "admin"}` };
  if (e.status === "SUBMITTED") return { tone: "info", text: "Waiting to verify" };
  if (e.status === "CHANGES_REQUESTED") return { tone: "warning", text: "Needs changes" };
  return { tone: "neutral", text: "Draft" };
}

/** An employee's own report: what they did, project by project, and how much is verified. */
export function MyReports() {
  const [from] = useUrlState<string>("from", PRESETS[0]!.from);
  const [to] = useUrlState<string>("to", PRESETS[0]!.to);
  const patch = useUrlPatch();
  const report = useLoad(() => api.get<MyReport>(`/me/report?from=${from}&to=${to}`), [from, to]);
  const r = report.data;
  const active = PRESETS.find((p) => p.from === from && p.to === to);

  return (
    <div className="page myreports">
      <PageHeader title="My reports" description="What you've worked on, where each project stands, and how much is verified." />

      <div className="row period-bar" role="group" aria-label="Period">
        {PRESETS.map((p) => (
          <button key={p.label} type="button" className="chip" aria-pressed={active?.label === p.label} onClick={() => patch({ from: p.from, to: p.to })}>
            <span>{p.label}</span>
          </button>
        ))}
        <span className="spacer" />
        <Field label="From">{(p) => <input {...p} className="input input-sm" type="date" value={from} max={to} onChange={(e) => e.target.value && patch({ from: e.target.value })} />}</Field>
        <Field label="To">{(p) => <input {...p} className="input input-sm" type="date" value={to} min={from} onChange={(e) => e.target.value && patch({ to: e.target.value })} />}</Field>
      </div>

      {report.error && <Alert tone="error">{report.error}</Alert>}
      {!r ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-4">
            <Stat
              label="Hours logged"
              value={formatHours(r.totals.minutes)}
              meta={
                <>
                  <Meter value={r.totals.minutes} max={r.totals.expectedMinutes} />
                  <span style={{ display: "block", marginTop: 6 }}>of {formatHours(r.totals.expectedMinutes)} expected so far</span>
                </>
              }
            />
            <Stat
              label="Verified"
              value={formatHours(r.totals.verifiedMinutes)}
              meta={r.totals.minutes ? `${Math.round((r.totals.verifiedMinutes / r.totals.minutes) * 100)}% of your time` : "Nothing logged yet"}
            />
            <Stat
              label="Not verified yet"
              value={formatHours(r.totals.waitingMinutes + r.totals.draftMinutes + r.totals.changesMinutes)}
              meta={`${formatHours(r.totals.waitingMinutes)} waiting · ${formatHours(r.totals.draftMinutes)} draft${r.totals.changesMinutes ? ` · ${formatHours(r.totals.changesMinutes)} to fix` : ""}`}
            />
            <Stat label="Days logged" value={r.totals.daysLogged} meta={`${r.totals.entryCount} ${r.totals.entryCount === 1 ? "entry" : "entries"}`} />
          </div>

          <Card title="Project status" description={`${formatFullDate(r.from)} – ${formatFullDate(r.to)}, plus all-time totals`} flush>
            {r.projects.length === 0 ? (
              <Empty title="No projects yet">Once an admin adds you to a project, it shows up here.</Empty>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Project</th>
                      <th>Status</th>
                      <th className="right">This period</th>
                      <th>Verified</th>
                      <th className="right">This week</th>
                      <th className="right">All time</th>
                      <th>Last worked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.projects.map((p) => {
                      const s = PROJECT_STATUS[p.status];
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="cell-title">
                              {p.code} · {p.name}
                            </div>
                            <div className="cell-sub">
                              {p.client ?? "Internal"}
                              {p.phases.length > 0 && ` · ${p.phases.map((ph) => `${ph.name} ${formatHours(ph.minutes)}`).join(", ")}`}
                            </div>
                          </td>
                          <td>
                            <span className={`badge tone-${s.tone}`}>{s.text}</span>
                          </td>
                          <td className="right num">{formatHours(p.periodMinutes)}</td>
                          <td style={{ minWidth: 140 }}>
                            {p.periodMinutes ? (
                              <>
                                <Meter value={p.verifiedMinutes} max={p.periodMinutes} />
                                <span className="cell-sub">
                                  {formatHours(p.verifiedMinutes)} verified{p.waitingMinutes ? ` · ${formatHours(p.waitingMinutes)} waiting` : ""}
                                </span>
                              </>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                          <td className="right num">{formatHours(p.thisWeekMinutes)}</td>
                          <td className="right num">{formatHours(p.totalMinutes)}</td>
                          <td className="num">{p.lastWorked ? formatShortDate(p.lastWorked) : <span className="muted">Never</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid grid-2">
            <Card title="Hours by day">
              <BarList rows={r.byDay.map((d) => ({ label: `${formatDay(d.date)} ${formatShortDate(d.date)}`, minutes: d.minutes }))} empty="No time logged in this period." />
            </Card>
            <Card title="Hours by project">
              <BarList rows={r.projects.filter((p) => p.periodMinutes).map((p) => ({ label: `${p.code} · ${p.name}`, minutes: p.periodMinutes }))} empty="No time logged in this period." />
            </Card>
          </div>

          <Card title="What I did" description="Every entry in the period, newest first" flush>
            {r.entries.length === 0 ? (
              <Empty title="Nothing in this period">Pick another period above.</Empty>
            ) : (
              <ul className="done-list">
                {r.entries.map((e) => {
                  const s = statusText(e);
                  return (
                    <li key={e.id}>
                      <span className="done-when num">
                        {formatDay(e.workDate)} {formatShortDate(e.workDate)}
                        {e.startTime && (
                          <span className="muted">
                            {" "}
                            {e.startTime}–{e.endTime}
                          </span>
                        )}
                      </span>
                      <span className="done-what">
                        <span className="entry-project">
                          {e.project.code}
                          {e.phase && <span className="muted"> · {e.phase.name}</span>}
                        </span>
                        <span>{e.description || <em className="muted">No description</em>}</span>
                      </span>
                      <span className="num entry-hours">{formatMinutes(e.minutes)}</span>
                      <span className={`badge tone-${s.tone}`}>
                        <Icon name={e.status === "APPROVED" ? "checkCircle" : e.status === "SUBMITTED" ? "send" : e.status === "CHANGES_REQUESTED" ? "alert" : "draft"} size={12} />
                        {s.text}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
