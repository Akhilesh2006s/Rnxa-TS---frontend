import { api, qs, type EntryStatus } from "../api";
import { useUser } from "../auth";
import { useUrlPatch, useUrlState } from "../useUrlState";
import { Icon } from "../components/Icon";
import { Alert, Card, Field, Loading, Meter, PageHeader, Stat, useLoad } from "../components/ui";
import { TeamPerformance, periodPresets } from "./TeamPerformance";
import { STATUS_LABEL, addDaysIso, formatFullDate, formatHours, todayIso, weekStartIso } from "../format";

type GroupBy = "project" | "phase" | "employee" | "date" | "status";

interface Options {
  projects: { id: string; code: string; name: string; phases: { id: string; name: string }[] }[];
  users: { id: string; name: string }[];
}

export function Reports() {
  const user = useUser();
  const today = todayIso();
  const [view, setView] = useUrlState<"performance" | "hours">("view", "performance");
  const [from, setFrom] = useUrlState<string>("from", addDaysIso(weekStartIso(today), -28));
  const [to, setTo] = useUrlState<string>("to", today);
  const [projectId] = useUrlState<string>("projectId", "");
  const [phaseId, setPhaseId] = useUrlState<string>("phaseId", "");
  const [userId, setUserId] = useUrlState<string>("userId", "");
  const [status, setStatus] = useUrlState<EntryStatus | "">("status", "");
  const [groupBy, setGroupBy] = useUrlState<GroupBy>("groupBy", "project");
  const patch = useUrlPatch();

  const options = useLoad(() => api.get<Options>("/reports/options"), []);
  const report = useLoad(
    () =>
      api.get<{ rows: { label: string; minutes: number }[]; totalMinutes: number; entryCount: number }>(
        `/reports/hours${qs({ from, to, projectId, phaseId, userId, status, groupBy })}`,
      ),
    [from, to, projectId, phaseId, userId, status, groupBy],
  );
  const phases = options.data?.projects.find((p) => p.id === projectId)?.phases ?? [];
  const max = Math.max(1, ...(report.data?.rows.map((r) => r.minutes) ?? [1]));
  const scopeText =
    user.role === "EMPLOYEE" ? "Your own time." : user.role === "MANAGER" ? "Projects you review, plus your own time." : "All projects.";

  const presets = periodPresets(today);
  const exportQs = qs({ from, to, projectId, phaseId, userId, status });

  return (
    <div className="page report-page">
      <PageHeader
        title="Team reports"
        description={
          view === "performance"
            ? "How each person's timesheet is going: hours against expected (after leave and holidays), days with no time, how promptly time is submitted, and entries sent back."
            : `Logged hours by period. ${scopeText}`
        }
        actions={
          <details className="menu no-print">
            <summary className="btn btn-secondary">
              <Icon name="download" size={16} /> Export
            </summary>
            <div className="menu-panel" role="menu">
              <a role="menuitem" href={`/api/reports/team.csv${qs({ from, to })}`} download>
                <strong>Team scorecard</strong>
                <span>CSV for Excel: one row per person, with reasons</span>
              </a>
              <a role="menuitem" href={`/api/reports/entries.csv${exportQs}`} download>
                <strong>All entries</strong>
                <span>CSV: every entry in the period{view === "hours" ? " with these filters" : ""}</span>
              </a>
              <a role="menuitem" href={`/api/reports/leave.csv${qs({ from, to })}`} download>
                <strong>Leave</strong>
                <span>CSV: approved and pending leave</span>
              </a>
              <button type="button" role="menuitem" onClick={() => window.print()}>
                <strong>Print or save as PDF</strong>
                <span>This page, formatted for paper</span>
              </button>
            </div>
          </details>
        }
      />
      <div className="row no-print" style={{ justifyContent: "space-between" }}>
        <div className="segmented" role="group" aria-label="Report">
          <button type="button" aria-pressed={view === "performance"} onClick={() => setView("performance")}>
            Performance
          </button>
          <button type="button" aria-pressed={view === "hours"} onClick={() => setView("hours")}>
            Hours breakdown
          </button>
        </div>
        <div className="row" role="group" aria-label="Period">
          {presets.map((p) => (
            <button key={p.key} type="button" className="chip" aria-pressed={from === p.from && to === p.to} onClick={() => patch({ from: p.from, to: p.to })}>
              {p.label}
            </button>
          ))}
        </div>
      </div>
      <p className="print-only small">
        RNXA Timesheet · {view === "performance" ? "Team performance" : "Hours"} · {formatFullDate(from)} – {formatFullDate(to)} · printed by {user.name}
      </p>
      {view === "performance" ? (
        <>
          <Card>
            <div className="toolbar no-print">
              <Field label="From">{(p) => <input {...p} className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />}</Field>
              <Field label="To">{(p) => <input {...p} className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />}</Field>
            </div>
          </Card>
          <TeamPerformance from={from} to={to} />
        </>
      ) : (
      <>
      <Card>
        <div className="toolbar">
          <Field label="From">{(p) => <input {...p} className="input" type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} />}</Field>
          <Field label="To">{(p) => <input {...p} className="input" type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} />}</Field>
          <Field label="Project">
            {(p) => (
              <select
                {...p}
                className="select"
                value={projectId}
                onChange={(e) => patch({ projectId: e.target.value, phaseId: null })}
              >
                <option value="">All projects</option>
                {options.data?.projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.code} · {pr.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Phase">
            {(p) => (
              <select {...p} className="select" value={phaseId} disabled={!phases.length} onChange={(e) => setPhaseId(e.target.value)}>
                <option value="">All phases</option>
                {phases.map((ph) => (
                  <option key={ph.id} value={ph.id}>
                    {ph.name}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {user.role !== "EMPLOYEE" && (
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
          )}
          <Field label="Status">
            {(p) => (
              <select {...p} className="select" value={status} onChange={(e) => setStatus(e.target.value as EntryStatus | "")}>
                <option value="">All except rejected</option>
                {(Object.keys(STATUS_LABEL) as EntryStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Group by">
            {(p) => (
              <select {...p} className="select" value={groupBy} onChange={(e) => setGroupBy(e.target.value as GroupBy)}>
                <option value="project">Project</option>
                <option value="phase">Phase</option>
                {user.role !== "EMPLOYEE" && <option value="employee">Employee</option>}
                <option value="date">Date</option>
                <option value="status">Status</option>
              </select>
            )}
          </Field>
        </div>
      </Card>

      {report.error && <Alert tone="error">{report.error}</Alert>}
      {!report.data ? (
        <Loading />
      ) : (
        <>
          <div className="grid grid-4">
            <Stat label="Total hours" value={formatHours(report.data.totalMinutes)} meta={`${formatFullDate(from)} – ${formatFullDate(to)}`} />
            <Stat label="Entries" value={report.data.entryCount} />
          </div>
          <Card title="Breakdown" flush>
            {report.data.rows.length === 0 ? (
              <div className="empty">No time matches these filters.</div>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>{groupBy.charAt(0).toUpperCase() + groupBy.slice(1)}</th>
                      <th className="right">Hours</th>
                      <th className="right">Share</th>
                      <th style={{ width: "35%" }}>
                        <span className="sr-only">Relative hours</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.data.rows.map((r) => (
                      <tr key={r.label}>
                        <td className="cell-title">{groupBy === "status" ? STATUS_LABEL[r.label as EntryStatus] : groupBy === "date" ? formatFullDate(r.label) : r.label}</td>
                        <td className="right num">{formatHours(r.minutes)}</td>
                        <td className="right num muted">{Math.round((r.minutes / report.data!.totalMinutes) * 100)}%</td>
                        <td>
                          <Meter value={r.minutes} max={max} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      </>
      )}
    </div>
  );
}
