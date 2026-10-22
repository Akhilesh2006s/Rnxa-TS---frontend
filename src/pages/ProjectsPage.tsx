import { useState } from "react";
import { api } from "../api";
import { useUser } from "../auth";
import { Icon } from "../components/Icon";
import { Alert, Empty, Loading, Meter, PageHeader, useLoad } from "../components/ui";
import { formatFullDate, formatHours, formatShortDate, todayIso } from "../format";

export interface PhaseDetail {
  id: string;
  name: string;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "DONE";
  active: boolean;
  minutes: number;
}

export interface ProjectDetail {
  id: string;
  code: string;
  name: string;
  client: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  phasesEnabled: boolean;
  totalMinutes: number;
  thisWeekMinutes: number;
  verifiedMinutes: number;
  lastActivity: string | null;
  people: { id: string; name: string }[];
  phases: PhaseDetail[];
}

export const PHASE_STATUS: Record<PhaseDetail["status"], { tone: string; text: string; icon: "checkCircle" | "clock" | "history" }> = {
  PLANNED: { tone: "neutral", text: "Planned", icon: "history" },
  IN_PROGRESS: { tone: "info", text: "In progress", icon: "clock" },
  DONE: { tone: "success", text: "Done", icon: "checkCircle" },
};

const range = (from: string | null, to: string | null) =>
  from && to ? `${formatShortDate(from)} – ${formatShortDate(to)}` : from ? `From ${formatShortDate(from)}` : to ? `Until ${formatShortDate(to)}` : null;

/** Where a project stands, read from its phases and dates. */
function projectProgress(p: ProjectDetail) {
  if (!p.active) return { tone: "neutral", text: "Closed" };
  const phases = p.phases.filter((ph) => ph.active || ph.status === "DONE");
  if (phases.length && phases.every((ph) => ph.status === "DONE")) return { tone: "success", text: "Complete" };
  if (p.endDate && p.endDate < todayIso()) return { tone: "warning", text: "Past end date" };
  if (p.startDate && p.startDate > todayIso()) return { tone: "neutral", text: "Not started" };
  return { tone: "info", text: "In progress" };
}

/** Project and phase details for everyone, as filled in by admins. */
export function ProjectsPage() {
  const user = useUser();
  const { data, error } = useLoad(() => api.get<{ scope: "mine" | "team" | "all"; projects: ProjectDetail[] }>("/project-details"), []);
  const [open, setOpen] = useState<string | null>(null);
  const hoursLabel = data?.scope === "mine" ? "My hours" : data?.scope === "team" ? "Team hours" : "Hours";

  return (
    <div className="page projects-page">
      <PageHeader
        title="Projects"
        description={
          user.role === "EMPLOYEE"
            ? "The projects you're on: what they are, their phases and dates, and your hours."
            : user.role === "MANAGER"
              ? "Projects your team works on, with phases, dates and team hours."
              : "Every project with its phases, dates and hours. Edit details under Projects & phases."
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Loading />
      ) : data.projects.length === 0 ? (
        <section className="card">
          <Empty title="No projects yet">{user.role === "EMPLOYEE" ? "An admin adds you to projects. They'll show up here." : "Projects appear here once they're set up."}</Empty>
        </section>
      ) : (
        data.projects.map((p) => {
          const prog = projectProgress(p);
          const done = p.phases.filter((ph) => ph.status === "DONE").length;
          const expanded = open === null ? data.projects.length === 1 || p === data.projects[0] : open === p.id;
          return (
            <section key={p.id} className="card project-detail">
              <button type="button" className="project-detail-head" aria-expanded={expanded} onClick={() => setOpen(expanded ? "" : p.id)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span className="project-code">{p.code}</span>
                  <h2>{p.name}</h2>
                  <p className="muted small">
                    {p.client ?? "Internal"}
                    {range(p.startDate, p.endDate) && ` · ${range(p.startDate, p.endDate)}`}
                  </p>
                </div>
                <div className="project-detail-stats">
                  <span className={`badge tone-${prog.tone}`}>{prog.text}</span>
                  <span className="small muted num">
                    {hoursLabel}: <strong>{formatHours(p.totalMinutes)}</strong> · this week {formatHours(p.thisWeekMinutes)}
                  </span>
                  {p.phases.length > 0 && (
                    <span className="small muted">
                      {done} of {p.phases.length} phases done
                    </span>
                  )}
                </div>
                <Icon name={expanded ? "left" : "right"} />
              </button>
              {expanded && (
                <div className="project-detail-body">
                  {p.description ? <p className="project-desc">{p.description}</p> : <p className="muted small">No description yet.</p>}

                  {p.phasesEnabled && p.phases.length > 0 && (
                    <>
                      <h3>Phases</h3>
                      <ol className="phase-timeline">
                        {p.phases.map((ph) => {
                          const s = PHASE_STATUS[ph.status];
                          return (
                            <li key={ph.id} className={`phase-step ${ph.status.toLowerCase()}`}>
                              <span className="phase-dot" aria-hidden="true">
                                <Icon name={s.icon} size={14} />
                              </span>
                              <div className="phase-body">
                                <div className="row" style={{ gap: 8 }}>
                                  <strong>{ph.name}</strong>
                                  <span className={`badge tone-${s.tone}`}>{s.text}</span>
                                  {!ph.active && <span className="badge tone-neutral">Closed for logging</span>}
                                  <span className="spacer" />
                                  <span className="num small">{formatHours(ph.minutes)}</span>
                                </div>
                                {range(ph.startDate, ph.endDate) && <span className="small muted">{range(ph.startDate, ph.endDate)}</span>}
                                {ph.description && <p className="small">{ph.description}</p>}
                                {p.totalMinutes > 0 && <Meter value={ph.minutes} max={p.totalMinutes} />}
                              </div>
                            </li>
                          );
                        })}
                      </ol>
                    </>
                  )}

                  <div className="grid grid-2 project-facts">
                    <div>
                      <h3>Hours</h3>
                      <p className="small">
                        {formatHours(p.totalMinutes)} logged · {formatHours(p.verifiedMinutes)} verified
                        {p.lastActivity && ` · last activity ${formatFullDate(p.lastActivity)}`}
                      </p>
                    </div>
                    {p.people.length > 0 && (
                      <div>
                        <h3>People</h3>
                        <p className="small">{p.people.map((u) => u.name).join(", ")}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
