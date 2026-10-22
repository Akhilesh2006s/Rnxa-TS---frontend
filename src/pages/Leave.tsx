import { useState, type FormEvent } from "react";
import { api } from "../api";
import { useCan, useUser } from "../auth";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, Dialog, Empty, Field, Loading, Meter, PageHeader, useLoad, useToast } from "../components/ui";
import { addDaysIso, formatFullDate, formatShortDate, todayIso } from "../format";
import { useUrlState } from "../useUrlState";

export type LeaveType = "CASUAL" | "SICK" | "EARNED" | "UNPAID";
type LeaveStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export const LEAVE_LABEL: Record<LeaveType, string> = { CASUAL: "Casual leave", SICK: "Sick leave", EARNED: "Earned leave", UNPAID: "Unpaid leave" };

interface Leave {
  id: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  halfDay: boolean;
  days: number;
  reason: string;
  status: LeaveStatus;
  decisionComment: string | null;
  decidedAt: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
  approver: { id: string; name: string } | null;
}

interface Balance {
  type: LeaveType;
  label: string;
  allowance: number | null;
  used: number;
  pending: number;
  remaining: number | null;
}

interface MyLeave {
  year: number;
  balances: Balance[];
  requests: Leave[];
  holidays: { date: string; name: string }[];
  approver: { id: string; name: string } | null;
}

interface TeamLeave {
  from: string;
  to: string;
  pending: Leave[];
  upcoming: Leave[];
  recent: Leave[];
  holidays: { date: string; name: string }[];
}

const STATUS: Record<LeaveStatus, { text: string; tone: string; icon: "clock" | "checkCircle" | "xCircle" | "undo" }> = {
  PENDING: { text: "Waiting for approval", tone: "info", icon: "clock" },
  APPROVED: { text: "Approved", tone: "success", icon: "checkCircle" },
  REJECTED: { text: "Declined", tone: "error", icon: "xCircle" },
  CANCELLED: { text: "Cancelled", tone: "neutral", icon: "undo" },
};

export const leaveRange = (l: { startDate: string; endDate: string; halfDay: boolean }) =>
  l.halfDay ? `${formatShortDate(l.startDate)} · half day` : l.startDate === l.endDate ? formatShortDate(l.startDate) : `${formatShortDate(l.startDate)} – ${formatShortDate(l.endDate)}`;
const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;

export function LeavePage() {
  const user = useUser();
  const approver = user.role !== "EMPLOYEE";
  const [tab, setTab] = useUrlState<"mine" | "team">("tab", "mine");
  const [requesting, setRequesting] = useState(false);
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const current = approver ? tab : "mine";

  return (
    <div className="page">
      <PageHeader
        title="Leave"
        description="Request time off and see your balance. Approved leave lowers the hours you're expected to log."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setRequesting(true)}>
            Request leave
          </Button>
        }
      />
      {approver && (
        <div className="segmented" role="group" aria-label="Whose leave" style={{ alignSelf: "flex-start" }}>
          <button type="button" aria-pressed={current === "mine"} onClick={() => setTab("mine")}>
            My leave
          </button>
          <button type="button" aria-pressed={current === "team"} onClick={() => setTab("team")}>
            Team leave
          </button>
        </div>
      )}
      {current === "mine" ? <MyLeaveView version={version} onChanged={reload} /> : <TeamLeaveView version={version} onChanged={reload} />}
      <RequestDialog
        open={requesting}
        onClose={() => setRequesting(false)}
        onDone={() => {
          setRequesting(false);
          setTab("mine");
          reload();
        }}
      />
    </div>
  );
}

function MyLeaveView({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const { data, error } = useLoad(() => api.get<MyLeave>("/leave/me"), [version]);
  const today = todayIso();
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;

  async function cancel(l: Leave) {
    try {
      await api.post(`/leave/${l.id}/cancel`);
      toast("success", "Leave cancelled.");
      onChanged();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  const upcomingHolidays = data.holidays.filter((h) => h.date >= today);
  return (
    <>
      <div className="grid grid-4">
        {data.balances.map((b) => (
          <div key={b.type} className="card stat">
            <div className="stat-label">{b.label}</div>
            {b.allowance === null ? (
              <>
                <div className="stat-value">{b.used}</div>
                <div className="stat-meta">{b.used === 1 ? "day" : "days"} taken this year{b.pending ? ` · ${days(b.pending)} waiting` : ""}</div>
              </>
            ) : (
              <>
                <div className="stat-value">
                  {b.remaining} <span className="stat-of">of {b.allowance} left</span>
                </div>
                <Meter value={b.used + b.pending} max={b.allowance || 1} label={`${b.used + b.pending} of ${b.allowance} used or requested`} />
                <div className="stat-meta" style={{ marginTop: 6 }}>
                  {days(b.used)} taken{b.pending ? ` · ${days(b.pending)} waiting` : ""}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-2-1">
        <Card
          title={`My requests · ${data.year}`}
          description={data.approver ? `${data.approver.name} approves your leave.` : "An admin approves your leave."}
          flush
        >
          {data.requests.length === 0 ? (
            <Empty title="No leave yet">Use “Request leave” to ask for time off.</Empty>
          ) : (
            <ul className="leave-list">
              {data.requests.map((l) => (
                <li key={l.id}>
                  <span className={`leave-type type-${l.type.toLowerCase()}`} aria-hidden="true" />
                  <span className="leave-main">
                    <strong>{LEAVE_LABEL[l.type]}</strong> · {leaveRange(l)} <span className="muted">({days(l.days)})</span>
                    {l.reason && <span className="small muted leave-reason">{l.reason}</span>}
                    {l.decisionComment && (
                      <span className="small leave-reason">
                        <strong>{l.approver?.name}:</strong> {l.decisionComment}
                      </span>
                    )}
                  </span>
                  <span className={`badge tone-${STATUS[l.status].tone}`}>
                    <Icon name={STATUS[l.status].icon} size={12} />
                    {l.status === "APPROVED" && l.approver ? `Approved by ${l.approver.name.split(" ")[0]}` : STATUS[l.status].text}
                  </span>
                  {(l.status === "PENDING" || (l.status === "APPROVED" && l.startDate > today)) && (
                    <Button size="sm" variant="ghost" onClick={() => cancel(l)}>
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <HolidaysCard holidays={upcomingHolidays} year={data.year} onChanged={onChanged} />
      </div>
    </>
  );
}

function HolidaysCard({ holidays, year, onChanged }: { holidays: { date: string; name: string }[]; year: number; onChanged: () => void }) {
  const canEdit = useCan("MANAGE_POLICY");
  const toast = useToast();
  const all = useLoad(() => (canEdit ? api.get<{ holidays: { id: string; date: string; name: string }[] }>(`/holidays?year=${year}`) : Promise.resolve(null)), [canEdit, year, holidays.length]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const list = canEdit ? (all.data?.holidays ?? []).filter((h) => h.date >= todayIso()) : holidays;

  async function add(e: FormEvent) {
    e.preventDefault();
    try {
      await api.post("/holidays", { date, name });
      setDate("");
      setName("");
      toast("success", "Holiday added. Nobody is expected to log time that day.");
      onChanged();
      all.reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  }
  async function remove(id: string) {
    try {
      await api.delete(`/holidays/${id}`);
      onChanged();
      all.reload();
    } catch (err) {
      toast("error", (err as Error).message);
    }
  }

  return (
    <Card title="Upcoming holidays" description={canEdit ? "You can add or remove organisation holidays." : "No time is expected on these days."} flush>
      {list.length === 0 ? (
        <p className="muted small" style={{ padding: "0 20px 16px" }}>
          No holidays coming up.
        </p>
      ) : (
        <ul className="leave-list">
          {list.map((h) => (
            <li key={h.date}>
              <span className="leave-type type-holiday" aria-hidden="true" />
              <span className="leave-main">
                <strong>{h.name}</strong>
                <span className="small muted leave-reason">{formatFullDate(h.date)}</span>
              </span>
              {canEdit && "id" in h && (
                <button type="button" className="badge-x" aria-label={`Remove ${h.name}`} onClick={() => remove((h as { id: string }).id)}>
                  <Icon name="x" size={12} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && (
        <form className="row holiday-form" onSubmit={add}>
          <input className="input" type="date" aria-label="Holiday date" value={date} required onChange={(e) => setDate(e.target.value)} />
          <input className="input" aria-label="Holiday name" placeholder="Name, e.g. Diwali" value={name} required maxLength={80} onChange={(e) => setName(e.target.value)} />
          <Button type="submit" size="sm" icon="plus" disabled={!date || !name.trim()}>
            Add
          </Button>
        </form>
      )}
    </Card>
  );
}

function TeamLeaveView({ version, onChanged }: { version: number; onChanged: () => void }) {
  const toast = useToast();
  const today = todayIso();
  const { data, error } = useLoad(() => api.get<TeamLeave>(`/leave/team?from=${today}&to=${addDaysIso(today, 41)}`), [version]);
  const [declining, setDeclining] = useState<Leave | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  if (error) return <Alert tone="error">{error}</Alert>;
  if (!data) return <Loading />;

  async function decide(l: Leave, decision: "APPROVE" | "REJECT", why?: string) {
    setBusy(l.id);
    try {
      const r = await api.post<{ note: string | null }>(`/leave/${l.id}/decide`, { decision, comment: why });
      toast("success", decision === "APPROVE" ? `Approved ${l.user.name}'s leave.${r.note ? ` ${r.note}` : ""}` : `Declined ${l.user.name}'s leave.`);
      setDeclining(null);
      setComment("");
      onChanged();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <Card title="Waiting for you" description="Leave requests from the people you verify." flush>
        {data.pending.length === 0 ? (
          <Empty title="Nothing to approve">New requests show up here and in your notifications.</Empty>
        ) : (
          <ul className="leave-list">
            {data.pending.map((l) => (
              <li key={l.id}>
                <span className={`leave-type type-${l.type.toLowerCase()}`} aria-hidden="true" />
                <span className="leave-main">
                  <strong>{l.user.name}</strong> · {LEAVE_LABEL[l.type]} · {leaveRange(l)} <span className="muted">({days(l.days)})</span>
                  {l.reason && <span className="small muted leave-reason">“{l.reason}”</span>}
                </span>
                <Button size="sm" variant="primary" icon="check" busy={busy === l.id} onClick={() => decide(l, "APPROVE")}>
                  Approve
                </Button>
                <Button size="sm" onClick={() => setDeclining(l)}>
                  Decline
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Who's off" description={`Approved leave and holidays, ${formatShortDate(data.from)} – ${formatShortDate(data.to)}`}>
        <LeaveTimeline from={data.from} to={data.to} leave={data.upcoming} holidays={data.holidays} />
      </Card>

      {data.recent.length > 0 && (
        <Card title="Recently decided" flush>
          <ul className="leave-list">
            {data.recent.map((l) => (
              <li key={l.id}>
                <span className={`leave-type type-${l.type.toLowerCase()}`} aria-hidden="true" />
                <span className="leave-main">
                  <strong>{l.user.name}</strong> · {LEAVE_LABEL[l.type]} · {leaveRange(l)}
                </span>
                <span className={`badge tone-${STATUS[l.status].tone}`}>
                  <Icon name={STATUS[l.status].icon} size={12} />
                  {STATUS[l.status].text}
                  {l.approver ? ` · ${l.approver.name.split(" ")[0]}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Dialog
        open={declining !== null}
        title={declining ? `Decline ${declining.user.name}'s leave` : ""}
        onClose={() => setDeclining(null)}
        footer={
          <>
            <Button onClick={() => setDeclining(null)}>Cancel</Button>
            <Button variant="danger" disabled={!comment.trim()} busy={busy === declining?.id} onClick={() => declining && decide(declining, "REJECT", comment.trim())}>
              Decline leave
            </Button>
          </>
        }
      >
        {declining && (
          <p className="muted">
            {LEAVE_LABEL[declining.type]}, {leaveRange(declining)}.
          </p>
        )}
        <Field label="Reason" hint="Shared with them.">
          {(p) => <textarea {...p} className="textarea" maxLength={1000} value={comment} onChange={(e) => setComment(e.target.value)} />}
        </Field>
      </Dialog>
    </>
  );
}

/** People × days grid of approved leave, with holidays and weekends shaded. */
function LeaveTimeline({ from, to, leave, holidays }: { from: string; to: string; leave: Leave[]; holidays: { date: string; name: string }[] }) {
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDaysIso(d, 1)) dates.push(d);
  const people = [...new Map(leave.map((l) => [l.user.id, l.user])).values()];
  const holidayOn = new Map(holidays.map((h) => [h.date, h.name]));
  if (!people.length && !holidays.length) return <Empty title="Nobody is off">No approved leave or holidays in the next six weeks.</Empty>;
  return (
    <div className="timeline-wrap">
      <table className="timeline" aria-label="Who's off">
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">Person</span>
            </th>
            {dates.map((d) => {
              const day = new Date(`${d}T00:00:00`);
              const weekend = day.getDay() === 0 || day.getDay() === 6;
              return (
                <th key={d} scope="col" className={`${weekend ? "weekend" : ""} ${holidayOn.has(d) ? "holiday" : ""}`} title={holidayOn.get(d) ?? formatFullDate(d)}>
                  <span className="tl-dow">{day.toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
                  <span className="tl-day">{day.getDate()}</span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id}>
              <th scope="row">{p.name}</th>
              {dates.map((d) => {
                const l = leave.find((x) => x.user.id === p.id && x.startDate <= d && x.endDate >= d);
                const day = new Date(`${d}T00:00:00`).getDay();
                const weekend = day === 0 || day === 6;
                return (
                  <td
                    key={d}
                    className={`${weekend ? "weekend" : ""} ${holidayOn.has(d) ? "holiday" : ""} ${l && !weekend && !holidayOn.has(d) ? `off type-${l.type.toLowerCase()} ${l.halfDay ? "half" : ""}` : ""}`}
                    title={l ? `${p.name}: ${LEAVE_LABEL[l.type]}${l.halfDay ? " (half day)" : ""}` : (holidayOn.get(d) ?? "")}
                  />
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="tl-legend small muted">
        {(["CASUAL", "SICK", "EARNED", "UNPAID"] as LeaveType[]).map((t) => (
          <span key={t}>
            <span className={`tl-swatch type-${t.toLowerCase()}`} aria-hidden="true" /> {LEAVE_LABEL[t]}
          </span>
        ))}
        <span>
          <span className="tl-swatch holiday" aria-hidden="true" /> Holiday / weekend
        </span>
      </div>
    </div>
  );
}

function RequestDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const tomorrow = addDaysIso(todayIso(), 1);
  const [form, setForm] = useState({ type: "CASUAL" as LeaveType, startDate: tomorrow, endDate: tomorrow, halfDay: false, reason: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await api.post<{ leave: Leave }>("/leave", { ...form, endDate: form.halfDay ? form.startDate : form.endDate });
      toast("success", `Leave requested: ${days(r.leave.days)}. Your approver has been notified.`);
      setForm({ type: "CASUAL", startDate: tomorrow, endDate: tomorrow, halfDay: false, reason: "" });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="Request leave"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon="send" busy={busy} onClick={() => submit()}>
            Send request
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <div className="leave-types" role="radiogroup" aria-label="Type of leave">
          {(Object.keys(LEAVE_LABEL) as LeaveType[]).map((t) => (
            <button key={t} type="button" role="radio" aria-checked={form.type === t} className={`chip leave-chip type-${t.toLowerCase()}`} onClick={() => set({ type: t })}>
              <span className={`leave-type type-${t.toLowerCase()}`} aria-hidden="true" />
              {LEAVE_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="form-grid">
          <Field label="From">
            {(p) => (
              <input
                {...p}
                className="input"
                type="date"
                value={form.startDate}
                onChange={(e) => e.target.value && set({ startDate: e.target.value, endDate: form.endDate < e.target.value ? e.target.value : form.endDate })}
              />
            )}
          </Field>
          <Field label="To">
            {(p) => (
              <input {...p} className="input" type="date" min={form.startDate} disabled={form.halfDay} value={form.halfDay ? form.startDate : form.endDate} onChange={(e) => e.target.value && set({ endDate: e.target.value })} />
            )}
          </Field>
        </div>
        <label className="checkbox">
          <input type="checkbox" checked={form.halfDay} onChange={(e) => set({ halfDay: e.target.checked })} />
          Half day
        </label>
        <Field label="Reason" hint="Optional. Your approver sees it.">
          {(p) => <textarea {...p} className="textarea" rows={3} maxLength={1000} value={form.reason} onChange={(e) => set({ reason: e.target.value })} />}
        </Field>
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Dialog>
  );
}
