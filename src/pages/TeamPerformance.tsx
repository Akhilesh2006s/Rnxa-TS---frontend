import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, qs } from "../api";
import { useUser } from "../auth";
import { Icon } from "../components/Icon";
import { Alert, BarList, Button, Card, Dialog, Empty, Loading, Meter, useLoad } from "../components/ui";
import { addDaysIso, formatDay, formatFullDate, formatHours, formatShortDate, todayIso } from "../format";
import { LEAVE_LABEL, type LeaveType } from "./Leave";

type Rating = "STRONG" | "ON_TRACK" | "NEEDS_ATTENTION" | "NO_DATA";

interface Person {
  user: { id: string; name: string; email: string; role: string };
  verifier: { id: string; name: string } | null;
  expectedMinutes: number;
  loggedMinutes: number;
  verifiedMinutes: number;
  waitingMinutes: number;
  draftMinutes: number;
  utilization: number | null;
  emptyDays: number;
  shortDays: number;
  leaveDays: number;
  entries: number;
  submitted: number;
  onTime: number;
  late: number;
  overdueDrafts: number;
  avgSubmitDelayDays: number | null;
  sentBack: number;
  rejected: number;
  timeliness: number | null;
  quality: number | null;
  score: number | null;
  rating: Rating;
  reasons: string[];
  byProject: { label: string; minutes: number }[];
  days: { date: string; minutes: number; expectedMinutes: number; holiday: string | null; leave: { type: LeaveType; halfDay: boolean } | null }[];
}

interface TeamReport {
  from: string;
  to: string;
  countedTo: string;
  summary: {
    people: number;
    expectedMinutes: number;
    loggedMinutes: number;
    verifiedMinutes: number;
    averageScore: number | null;
    needsAttention: number;
    emptyDays: number;
    leaveDays: number;
    sentBack: number;
  };
  people: Person[];
}

export const RATING: Record<Rating, { text: string; tone: string; icon: "checkCircle" | "check" | "alert" | "info" }> = {
  STRONG: { text: "Strong", tone: "success", icon: "checkCircle" },
  ON_TRACK: { text: "On track", tone: "info", icon: "check" },
  NEEDS_ATTENTION: { text: "Needs attention", tone: "warning", icon: "alert" },
  NO_DATA: { text: "No data yet", tone: "neutral", icon: "info" },
};

const pct = (n: number | null) => (n === null ? "–" : `${Math.round(n * 100)}%`);

export function RatingBadge({ rating, score }: { rating: Rating; score: number | null }) {
  const r = RATING[rating];
  return (
    <span className={`badge tone-${r.tone}`}>
      <Icon name={r.icon} size={12} />
      {r.text}
      {score !== null && <span className="num"> · {score}</span>}
    </span>
  );
}

/** Team performance for a period: who is on track, who needs a conversation and why. */
export function TeamPerformance({ from, to }: { from: string; to: string }) {
  const user = useUser();
  const navigate = useNavigate();
  const { data, error } = useLoad(() => api.get<TeamReport>(`/reports/team${qs({ from, to })}`), [from, to]);
  const [open, setOpen] = useState<Person | null>(null);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;
  const s = data.summary;
  const attention = data.people.filter((p) => p.rating === "NEEDS_ATTENTION");
  const alert = (people: Person[], title: string) =>
    navigate(`/alerts${qs({ to: people.map((p) => p.user.id).join(","), title })}`);

  if (!data.people.length) {
    return (
      <Card>
        <Empty title={user.role === "MANAGER" ? "Nobody is assigned to you yet" : "Nobody logs time yet"}>
          {user.role === "MANAGER" ? "An admin sets you as someone's verifier on the Users page." : "Add people and projects to get started."}
        </Empty>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-4">
        <div className="card stat">
          <div className="stat-label">Team hours</div>
          <div className="stat-value">{formatHours(s.loggedMinutes)}</div>
          <Meter value={s.loggedMinutes} max={s.expectedMinutes || 1} />
          <div className="stat-meta" style={{ marginTop: 6 }}>
            of {formatHours(s.expectedMinutes)} expected · {pct(s.expectedMinutes ? s.loggedMinutes / s.expectedMinutes : null)}
          </div>
        </div>
        <div className="card stat">
          <div className="stat-label">Average score</div>
          <div className="stat-value">{s.averageScore ?? "–"}</div>
          <div className="stat-meta">Hours 50 · on time 25 · clean entries 25</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Needs attention</div>
          <div className="stat-value">
            {s.needsAttention} <span className="stat-of">of {s.people}</span>
          </div>
          <div className="stat-meta">{s.needsAttention ? "Scored below 70 this period" : "Everyone scored 70 or more"}</div>
        </div>
        <div className="card stat">
          <div className="stat-label">Days with no time</div>
          <div className="stat-value">{s.emptyDays}</div>
          <div className="stat-meta">
            {s.leaveDays ? `${s.leaveDays} leave days excluded` : "Leave and holidays are excluded"} · {s.sentBack} sent back
          </div>
        </div>
      </div>

      {attention.length > 0 && (
        <Card
          title="Needs a conversation"
          description="Lowest scores first, with the reasons from their timesheets."
          actions={
            attention.length > 1 && (
              <Button size="sm" icon="bell" onClick={() => alert(attention, "Your timesheet needs attention")}>
                Alert all {attention.length}
              </Button>
            )
          }
          flush
        >
          <ul className="attention-list">
            {attention.map((p) => (
              <li key={p.user.id}>
                <span className="attention-icon tone-warning">
                  <Icon name="alert" size={14} />
                </span>
                <span className="attention-text">
                  <span>
                    <button type="button" className="link-button" onClick={() => setOpen(p)}>
                      <strong>{p.user.name}</strong>
                    </button>
                    <RatingBadge rating={p.rating} score={p.score} />
                  </span>
                  <span className="reason-list">{p.reasons.join(" · ")}</span>
                </span>
                <Button size="sm" icon="bell" onClick={() => alert([p], "Your timesheet needs attention")}>
                  Send alert
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Scorecard" description={`${formatShortDate(data.from)} – ${formatShortDate(data.countedTo)}${data.countedTo < data.to ? " (today and later aren't scored yet)" : ""}. Click a person for detail.`} flush>
        <div className="table-wrap">
          <table className="table scorecard">
            <thead>
              <tr>
                <th>Person</th>
                <th>Rating</th>
                <th style={{ width: "22%" }}>Hours vs expected</th>
                <th className="right">No-time days</th>
                <th className="right">On time</th>
                <th className="right">Sent back</th>
                <th className="right">Leave</th>
                <th className="right">Verified</th>
              </tr>
            </thead>
            <tbody>
              {data.people.map((p) => (
                <tr key={p.user.id} className={p.rating === "NEEDS_ATTENTION" ? "row-attention" : ""}>
                  <td>
                    <button type="button" className="link-button cell-title" onClick={() => setOpen(p)}>
                      {p.user.name}
                    </button>
                    <div className="cell-sub">{p.verifier ? `Verified by ${p.verifier.name}` : p.user.role.toLowerCase()}</div>
                  </td>
                  <td>
                    <RatingBadge rating={p.rating} score={p.score} />
                  </td>
                  <td>
                    <div className="num small">
                      {formatHours(p.loggedMinutes)} / {formatHours(p.expectedMinutes)} <span className="muted">· {pct(p.utilization)}</span>
                    </div>
                    <Meter value={p.loggedMinutes} max={p.expectedMinutes || 1} />
                  </td>
                  <td className={`right num ${p.emptyDays ? "text-warning" : ""}`}>{p.emptyDays}</td>
                  <td className="right num">{pct(p.timeliness)}</td>
                  <td className={`right num ${p.sentBack + p.rejected ? "text-warning" : ""}`}>{p.sentBack + p.rejected}</td>
                  <td className="right num">{p.leaveDays || "–"}</td>
                  <td className="right num">{formatHours(p.verifiedMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Day by day" description="Each square is one day: darker means closer to the expected hours. Hover for detail.">
        <Heatmap people={data.people} onOpen={setOpen} />
      </Card>

      <PersonDialog person={open} from={data.from} to={data.countedTo} onClose={() => setOpen(null)} onAlert={(p) => alert([p], "About your timesheet")} />
    </>
  );
}

/** Logged as a share of expected, bucketed onto a single-hue ramp. */
function heatClass(d: Person["days"][number]) {
  if (d.leave && !d.leave.halfDay) return "hm-leave";
  if (d.holiday) return "hm-holiday";
  if (!d.expectedMinutes) return d.minutes ? "hm-4" : "hm-off";
  // Today is still in progress; later days haven't happened.
  if (d.date >= todayIso() && !d.minutes) return "hm-off";
  const r = d.minutes / d.expectedMinutes;
  if (r === 0) return "hm-0";
  if (r < 0.5) return "hm-1";
  if (r < 0.9) return "hm-2";
  if (r <= 1.1) return "hm-3";
  return "hm-4";
}

function dayTitle(name: string, d: Person["days"][number]) {
  const what = d.holiday
    ? `holiday (${d.holiday})`
    : d.leave
      ? `${LEAVE_LABEL[d.leave.type].toLowerCase()}${d.leave.halfDay ? ", half day" : ""}`
      : d.expectedMinutes
        ? `${formatHours(d.minutes)} of ${formatHours(d.expectedMinutes)}`
        : d.minutes
          ? `${formatHours(d.minutes)} on a day off`
          : "day off";
  return `${name} · ${formatFullDate(d.date)}: ${what}`;
}

function Heatmap({ people, onOpen }: { people: Person[]; onOpen: (p: Person) => void }) {
  const days = people[0]?.days ?? [];
  return (
    <div className="heatmap-wrap">
      <table className="heatmap">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Person</span>
            </th>
            {days.map((d) => (
              <th key={d.date} scope="col" title={formatFullDate(d.date)}>
                {new Date(`${d.date}T00:00:00`).getDate()}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.user.id}>
              <th scope="row">
                <button type="button" className="link-button" onClick={() => onOpen(p)}>
                  {p.user.name}
                </button>
              </th>
              {p.days.map((d) => (
                <td key={d.date} className={heatClass(d)} title={dayTitle(p.user.name, d)}>
                  {d.leave && !d.leave.halfDay ? "L" : d.holiday ? "H" : ""}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tl-legend small muted">
        <span>
          <span className="tl-swatch hm-0" aria-hidden="true" /> No time
        </span>
        <span>
          <span className="tl-swatch hm-1" aria-hidden="true" /> Under half
        </span>
        <span>
          <span className="tl-swatch hm-2" aria-hidden="true" /> Under 90%
        </span>
        <span>
          <span className="tl-swatch hm-3" aria-hidden="true" /> Full day
        </span>
        <span>
          <span className="tl-swatch hm-4" aria-hidden="true" /> Over 110%
        </span>
        <span>
          <span className="tl-swatch hm-leave" aria-hidden="true" /> L = leave
        </span>
        <span>
          <span className="tl-swatch hm-holiday" aria-hidden="true" /> H = holiday
        </span>
      </div>
    </div>
  );
}

function PersonDialog({ person: p, from, to, onClose, onAlert }: { person: Person | null; from: string; to: string; onClose: () => void; onAlert: (p: Person) => void }) {
  return (
    <Dialog
      open={p !== null}
      title={p ? p.user.name : ""}
      onClose={onClose}
      footer={
        p && (
          <>
            <a className="btn btn-secondary" href={`/api/reports/entries.csv${qs({ from, to, userId: p.user.id })}`} download>
              <Icon name="download" size={16} /> Their entries (CSV)
            </a>
            <Button variant="primary" icon="bell" onClick={() => onAlert(p)}>
              Send alert
            </Button>
          </>
        )
      }
    >
      {p && (
        <div className="stack">
          <div className="row">
            <RatingBadge rating={p.rating} score={p.score} />
            <span className="small muted">
              {formatShortDate(from)} – {formatShortDate(to)} · {p.verifier ? `verified by ${p.verifier.name}` : "verified by any admin"}
            </span>
          </div>
          <div className="person-stats">
            <div>
              <span className="stat-label">Hours</span>
              <strong>
                {formatHours(p.loggedMinutes)} / {formatHours(p.expectedMinutes)}
              </strong>
              <span className="small muted">{pct(p.utilization)} of expected</span>
            </div>
            <div>
              <span className="stat-label">On time</span>
              <strong>{pct(p.timeliness)}</strong>
              <span className="small muted">{p.avgSubmitDelayDays === null ? "Nothing submitted" : `${p.avgSubmitDelayDays} days to submit on average`}</span>
            </div>
            <div>
              <span className="stat-label">Clean entries</span>
              <strong>{pct(p.quality)}</strong>
              <span className="small muted">
                {p.sentBack} sent back · {p.rejected} rejected
              </span>
            </div>
            <div>
              <span className="stat-label">Days</span>
              <strong>{p.emptyDays} with no time</strong>
              <span className="small muted">
                {p.shortDays} short · {p.leaveDays} on leave
              </span>
            </div>
          </div>
          {p.reasons.length > 0 ? (
            <Alert tone="warning" title="What stands out">
              <ul className="reasons">
                {p.reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </Alert>
          ) : (
            <Alert tone="success">Nothing stands out: hours, timing and entries are all in good shape.</Alert>
          )}
          <div>
            <h3 style={{ marginBottom: 8 }}>Where the time went</h3>
            {p.byProject.length ? <BarList rows={p.byProject} /> : <p className="muted small">No time logged.</p>}
          </div>
          <div>
            <h3 style={{ marginBottom: 8 }}>Day by day</h3>
            <div className="day-strip">
              {p.days
                .filter((d) => d.date <= to)
                .map((d) => (
                  <span key={d.date} className={`day-cell ${heatClass(d)}`} title={dayTitle(p.user.name, d)}>
                    <span className="day-cell-label">{formatDay(d.date).slice(0, 2)}</span>
                    <span className="num">{d.leave && !d.leave.halfDay ? "L" : d.holiday ? "H" : d.minutes ? formatHours(d.minutes) : "–"}</span>
                  </span>
                ))}
            </div>
          </div>
        </div>
      )}
    </Dialog>
  );
}

/** Period presets for reports. */
export function periodPresets(today: string) {
  const d = new Date(`${today}T00:00:00`);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const monday = addDaysIso(today, -((d.getDay() + 6) % 7));
  const monthStart = iso(new Date(d.getFullYear(), d.getMonth(), 1));
  const lastMonthStart = iso(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const lastMonthEnd = iso(new Date(d.getFullYear(), d.getMonth(), 0));
  return [
    { key: "week", label: "This week", from: monday, to: addDaysIso(monday, 6) },
    { key: "lastweek", label: "Last week", from: addDaysIso(monday, -7), to: addDaysIso(monday, -1) },
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "lastmonth", label: "Last month", from: lastMonthStart, to: lastMonthEnd },
    { key: "30", label: "Last 30 days", from: addDaysIso(today, -29), to: today },
  ];
}
