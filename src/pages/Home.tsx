import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, type Entry } from "../api";
import { useUser } from "../auth";
import { useAssistant } from "../assistant/AssistantContext";
import { Icon } from "../components/Icon";
import { Alert, BarList, Button, Card, Empty, Loading, Meter, PageHeader, Stat, StatusBadge, useLoad, useToast } from "../components/ui";
import { formatFullDate, formatHours, formatMinutes, formatShortDate, formatStamp } from "../format";

interface Dashboard {
  employee: {
    weekStart: string;
    todayMinutes: number;
    weekMinutes: number;
    expectedWeekMinutes: number;
    expectedToDateMinutes: number;
    draftCount: number;
    submittedCount: number;
    approvedCount: number;
    returned: Entry[];
  };
  review: null | {
    weekStart: string;
    pendingApprovals: number;
    changesRequested: number;
    oldestPendingAt: string | null;
    expectedToDateMinutes: number;
    teamMinutes: number;
    verifiedMinutes: number;
    autoVerifiedMinutes: number;
    team: {
      user: { id: string; name: string };
      loggedMinutes: number;
      submittedMinutes: number;
      verifiedMinutes: number;
      waitingCount: number;
      expectedMinutes: number;
      expectedToDateMinutes: number;
    }[];
    byEmployee: { label: string; minutes: number }[];
    byProject: { label: string; minutes: number }[];
    byPhase: { label: string; minutes: number }[];
  };
  org: null | {
    trend: { weekStart: string; minutes: number; approvedMinutes: number }[];
    lastWeekStart: string;
    missing: { user: { id: string; name: string; email: string }; submittedMinutes: number; expectedMinutes: number }[];
    activeUsers: number;
    activeProjects: number;
    backlog: { project?: { id: string; code: string; name: string }; count: number }[];
  };
}

/** The team dashboard for managers (sub-admins) and admins. Personal time lives on "My dashboard". */
export function Home() {
  const user = useUser();
  const { dataVersion } = useAssistant();
  const [version, setVersion] = useState(0);
  const { data, error } = useLoad(() => api.get<Dashboard>("/dashboard"), [dataVersion, version]);
  const firstName = user.name.split(" ")[0];
  const people = data?.review?.team.length ?? 0;

  return (
    <div className="page">
      <PageHeader
        title={`Hello, ${firstName}`}
        description={
          data
            ? `${user.role === "ADMIN" ? "Organisation and team" : "Your team"} · week of ${formatFullDate(data.employee.weekStart)}${
                user.role === "MANAGER" ? ` · you verify ${people} ${people === 1 ? "person" : "people"}` : ""
              }`
            : undefined
        }
        actions={
          <Link to="/week" className="btn btn-secondary">
            My dashboard
          </Link>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <>
          {data.review && <ReviewSection review={data.review} isAdmin={user.role === "ADMIN"} onChanged={() => setVersion((v) => v + 1)} />}
          {data.org && <AdminSection org={data.org} />}
        </>
      )}
    </div>
  );
}

function EmployeeSection({ employee: e, compact }: { employee: Dashboard["employee"]; compact: boolean }) {
  const behind = e.weekMinutes < e.expectedToDateMinutes;
  return (
    <section className="stack" aria-labelledby="my-week">
      {compact && <h2 id="my-week">My week</h2>}
      {!compact && (
        <h2 id="my-week" className="sr-only">
          My week
        </h2>
      )}
      <div className="grid grid-4">
        <Stat label="Today" value={formatHours(e.todayMinutes)} meta="Logged so far" />
        <Stat
          label="This week"
          value={formatHours(e.weekMinutes)}
          meta={
            <>
              <Meter value={e.weekMinutes} max={e.expectedWeekMinutes} label={`${formatHours(e.weekMinutes)} of ${formatHours(e.expectedWeekMinutes)}`} />
              <span style={{ display: "block", marginTop: 6 }}>
                of {formatHours(e.expectedWeekMinutes)} expected{behind ? ` · ${formatHours(e.expectedToDateMinutes - e.weekMinutes)} behind to date` : ""}
              </span>
            </>
          }
        />
        <Stat label="Drafts" value={e.draftCount} meta={e.draftCount ? "Not yet submitted" : "Nothing waiting"} />
        <Stat label="Awaiting approval" value={e.submittedCount} meta={`${e.approvedCount} approved this week`} />
      </div>
      {e.returned.length > 0 && (
        <Card title="Returned to you" description="Your reviewer asked for changes. Update these entries and submit again." flush>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project · Phase</th>
                  <th>Reviewer comment</th>
                  <th className="right">Duration</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {e.returned.map((r) => (
                  <tr key={r.id}>
                    <td className="num">
                      <Link to={`/timesheet?week=${r.workDate}`}>{formatShortDate(r.workDate)}</Link>
                    </td>
                    <td>
                      <div className="cell-title">{r.project.code}</div>
                      <div className="cell-sub">{r.phase?.name ?? r.project.name}</div>
                    </td>
                    <td className="cell-desc">{r.reviewerComment}</td>
                    <td className="right num">{formatMinutes(r.minutes)}</td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}

function ReviewSection({ review: r, isAdmin, onChanged }: { review: NonNullable<Dashboard["review"]>; isAdmin: boolean; onChanged: () => void }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [reminding, setReminding] = useState<string | null>(null);
  const [reminded, setReminded] = useState<Set<string>>(new Set());
  const behind = r.team.filter((t) => t.loggedMinutes < t.expectedToDateMinutes);
  const waiting = r.team.filter((t) => t.waitingCount > 0);
  const autoShare = r.verifiedMinutes ? Math.round((r.autoVerifiedMinutes / r.verifiedMinutes) * 100) : 0;
  const expectedTeam = r.team.reduce((s, t) => s + t.expectedToDateMinutes, 0);

  async function remind(ids: string[], key: string) {
    setReminding(key);
    try {
      const res = await api.post<{ sent: number; skipped: number }>("/team/remind", { userIds: ids });
      toast(res.sent ? "success" : "info", res.sent ? `Reminder sent to ${res.sent} ${res.sent === 1 ? "person" : "people"}.` : "Already reminded today.");
      setReminded((s) => new Set([...s, ...ids]));
      onChanged();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setReminding(null);
    }
  }

  return (
    <section className="stack" aria-labelledby="team-heading">
      <h2 id="team-heading" className="sr-only">
        {isAdmin ? "Team and verification" : "My team"}
      </h2>
      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-label">Waiting for you to verify</div>
          <div className="stat-value">{r.pendingApprovals}</div>
          {r.pendingApprovals ? (
            <Link to="/reviews" className="btn btn-primary btn-sm" style={{ alignSelf: "flex-start", marginTop: 6 }}>
              Verify now
            </Link>
          ) : (
            <div className="stat-meta">Queue is clear</div>
          )}
        </div>
        <Stat
          label="Team hours this week"
          value={formatHours(r.teamMinutes)}
          meta={
            <>
              <Meter value={r.teamMinutes} max={expectedTeam || 1} />
              <span style={{ display: "block", marginTop: 6 }}>of {formatHours(expectedTeam)} expected so far</span>
            </>
          }
        />
        <Stat label="People behind" value={`${behind.length} / ${r.team.length}`} meta={behind.length ? "Below expected hours so far" : "Everyone is on track"} />
        <Stat label="Verified automatically" value={`${autoShare}%`} meta={`${formatHours(r.autoVerifiedMinutes)} of ${formatHours(r.verifiedMinutes)} verified`} />
      </div>

      <Card
        title="Needs your attention"
        description="People behind this week and time waiting for you. One click to remind or verify."
        actions={
          behind.length > 1 && (
            <Button size="sm" icon="bell" busy={reminding === "all"} onClick={() => remind(behind.map((b) => b.user.id), "all")}>
              Remind all {behind.length}
            </Button>
          )
        }
        flush
      >
        {behind.length === 0 && waiting.length === 0 ? (
          <Empty title="All clear">Everyone is on track and nothing is waiting for you.</Empty>
        ) : (
          <ul className="attention-list">
            {waiting.map((t) => (
              <li key={`w-${t.user.id}`}>
                <span className="attention-icon tone-info">
                  <Icon name="send" size={14} />
                </span>
                <span className="attention-text">
                  <strong>{t.user.name}</strong> has {t.waitingCount} {t.waitingCount === 1 ? "entry" : "entries"} waiting for you
                </span>
                <Button size="sm" variant="primary" icon="check" onClick={() => navigate(`/reviews?userId=${t.user.id}`)}>
                  Verify
                </Button>
              </li>
            ))}
            {behind.map((t) => (
              <li key={`b-${t.user.id}`}>
                <span className="attention-icon tone-warning">
                  <Icon name="alert" size={14} />
                </span>
                <span className="attention-text">
                  <strong>{t.user.name}</strong> has logged {formatHours(t.loggedMinutes)} of {formatHours(t.expectedToDateMinutes)} expected so far
                  <Meter value={t.loggedMinutes} max={t.expectedToDateMinutes || 1} />
                </span>
                {reminded.has(t.user.id) ? (
                  <span className="small muted">
                    <Icon name="check" size={12} /> Reminded
                  </span>
                ) : (
                  <Button size="sm" icon="bell" busy={reminding === t.user.id} onClick={() => remind([t.user.id], t.user.id)}>
                    Remind
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid grid-2">
        <Card title="Team this week" description="Logged, submitted and verified against expected hours" flush>
          {r.team.length === 0 ? (
            <Empty title={isAdmin ? "Nobody logs time yet" : "Nobody is assigned to you yet"}>
              {isAdmin ? "Add people and projects to get started." : "An admin sets you as someone's verifier on the Users page."}
            </Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="right">Logged</th>
                    <th className="right">Verified</th>
                    <th style={{ width: "30%" }}>
                      <span className="sr-only">Progress</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.team.map((t) => (
                    <tr key={t.user.id}>
                      <td className="cell-title">{t.user.name}</td>
                      <td className="right num">
                        {formatHours(t.loggedMinutes)} <span className="muted">/ {formatHours(t.expectedMinutes)}</span>
                      </td>
                      <td className="right num">{formatHours(t.verifiedMinutes)}</td>
                      <td>
                        <Meter value={t.loggedMinutes} max={t.expectedMinutes || 1} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <Card title="Where the time went" description="This week, excluding rejected time">
          <div className="stack">
            <div>
              <h3 style={{ marginBottom: 8 }}>By project</h3>
              <BarList rows={r.byProject} />
            </div>
            <div>
              <h3 style={{ marginBottom: 8 }}>By phase</h3>
              <BarList rows={r.byPhase.slice(0, 6)} />
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}

function AdminSection({ org }: { org: NonNullable<Dashboard["org"]> }) {
  const max = Math.max(1, ...org.trend.map((t) => t.minutes));
  const last = org.trend[org.trend.length - 1]!;
  const previous = org.trend[org.trend.length - 2];
  return (
    <section className="stack" aria-labelledby="org-heading">
      <h2 id="org-heading">Organisation</h2>
      <div className="grid grid-4">
        <Stat label="Hours this week" value={formatHours(last.minutes)} meta={previous ? `${formatHours(previous.minutes)} last week` : undefined} />
        <Stat label="Missing timesheets" value={org.missing.length} meta={`Week of ${formatShortDate(org.lastWeekStart)}`} />
        <Stat label="Approval backlog" value={org.backlog.reduce((s, b) => s + b.count, 0)} meta={`${org.backlog.length} projects`} />
        <Stat label="Active people · projects" value={`${org.activeUsers} · ${org.activeProjects}`} />
      </div>
      <div className="grid grid-2">
        <Card title="Logged hours, last 8 weeks" description="Current week is still in progress (lighter bar). Hover a bar for detail.">
          <div className="columns" role="list" aria-label="Logged hours per week">
            {org.trend.map((t, i) => (
              <div key={t.weekStart} className={`col ${i === org.trend.length - 1 ? "current" : ""}`} role="listitem" tabIndex={0} aria-label={`Week of ${formatShortDate(t.weekStart)}: ${formatHours(t.minutes)} logged, ${formatHours(t.approvedMinutes)} approved`}>
                <span className="tip">
                  {formatShortDate(t.weekStart)} · {formatHours(t.minutes)} logged · {formatHours(t.approvedMinutes)} approved
                </span>
                <span className="bar" style={{ height: `${(t.minutes / max) * 100}%` }} />
                <span className="tick">{formatShortDate(t.weekStart)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Missing timesheets" description={`Submitted less than expected for the week of ${formatShortDate(org.lastWeekStart)}`} flush>
          {org.missing.length === 0 ? (
            <Empty title="Everyone submitted">All active members met expected hours.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th className="right">Submitted</th>
                    <th className="right">Expected</th>
                  </tr>
                </thead>
                <tbody>
                  {org.missing.slice(0, 10).map((m) => (
                    <tr key={m.user.id}>
                      <td>
                        <div className="cell-title">{m.user.name}</div>
                        <div className="cell-sub">{m.user.email}</div>
                      </td>
                      <td className="right num">{formatHours(m.submittedMinutes)}</td>
                      <td className="right num muted">{formatHours(m.expectedMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      {org.backlog.length > 0 && (
        <Card title="Approval backlog by project" description="Submitted entries waiting for review">
          <BarList
            rows={org.backlog.map((b) => ({ label: b.project ? `${b.project.code} · ${b.project.name}` : "Unknown", minutes: b.count }))}
            format={(n) => `${n} ${n === 1 ? "entry" : "entries"}`}
          />
        </Card>
      )}
    </section>
  );
}
