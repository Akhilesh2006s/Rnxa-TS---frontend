import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Entry, type WeekSummary } from "../api";
import { useAssistant } from "../assistant/AssistantContext";
import { EntryDialog } from "../components/EntryDialog";
import type { Prefill } from "../components/EntryForm";
import { entryStatus } from "../components/entryStatus";
import { Icon } from "../components/Icon";
import { EntryFiles } from "../components/Attachments";
import { Alert, Button, IconButton, Loading, Meter, PageHeader, useLoad, useToast } from "../components/ui";
import { LEAVE_LABEL } from "./Leave";
import { addDaysIso, formatDay, formatFullDate, formatHours, formatLongDate, formatMinutes, todayIso, weekStartIso } from "../format";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const EDITABLE = new Set(["DRAFT", "CHANGES_REQUESTED"]);

/**
 * The detailed timesheet: day boxes for the week, then one day at a time,
 * either as a list of what was filled or hour by hour across all 24 hours.
 */
export function Timesheet() {
  const toast = useToast();
  const { dataVersion } = useAssistant();
  const [params, setParams] = useSearchParams();
  const today = todayIso();
  const thisWeek = weekStartIso(today);
  const dayParam = params.get("day");
  const weekStart = weekStartIso(params.get("week") ?? dayParam ?? today);
  const isCurrent = weekStart === thisWeek;
  const [day, setDay] = useState(() => dayParam ?? (isCurrent ? today : weekStart));
  const [view, setView] = useState<"day" | "week">(() => {
    try {
      return localStorage.getItem("rnxa.tsView") === "week" ? "week" : "day";
    } catch {
      return "day";
    }
  });
  const setViewMode = (v: "day" | "week") => {
    setView(v);
    try {
      localStorage.setItem("rnxa.tsView", v);
    } catch {
      // Preference only.
    }
  };
  const [hourly, setHourly] = useState(() => {
    try {
      return localStorage.getItem("rnxa.hourly") === "1";
    } catch {
      return false;
    }
  });
  const [version, setVersion] = useState(0);
  const reload = () => setVersion((v) => v + 1);
  const [editing, setEditing] = useState<Entry | "new" | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const week = useLoad(() => api.get<WeekSummary>(`/weeks/${weekStart}`), [weekStart, dataVersion, version]);
  const w = week.data;

  useEffect(() => {
    if (dayParam && weekStartIso(dayParam) === weekStart) setDay(dayParam);
    else setDay(weekStart === thisWeek ? today : weekStart);
  }, [weekStart, thisWeek, today, dayParam]);

  const setHourlyMode = (on: boolean) => {
    setHourly(on);
    try {
      localStorage.setItem("rnxa.hourly", on ? "1" : "0");
    } catch {
      // Preference only.
    }
  };

  const dayEntries = useMemo(() => (w?.entries ?? []).filter((e) => e.workDate === day), [w, day]);
  const dayInfo = w?.days.find((d) => d.date === day);
  const lockedSet = new Set(w?.lockedDays ?? []);
  const onFullLeave = !!dayInfo?.leave && !dayInfo.leave.halfDay;
  const dayLocked = lockedSet.has(day);
  const verifierName = w?.verifier?.name ?? "an admin";
  const toSubmit = (w?.entries ?? []).filter((e) => EDITABLE.has(e.status) && e.workDate <= today);
  const suggestStart = (date: string) =>
    (w?.entries ?? [])
      .filter((e) => e.workDate === date && e.endTime)
      .map((e) => e.endTime!)
      .sort()
      .at(-1) ?? null;

  const addAt = (hour?: number, date?: string) => {
    if (date) setDay(date);
    setPrefill(hour === undefined ? null : { startTime: `${pad(hour)}:00`, endTime: hour === 23 ? "24:00" : `${pad(hour + 1)}:00` });
    setEditing("new");
  };

  async function submitWeek() {
    setSubmitting(true);
    try {
      const r = await api.post<{ submitted: number; autoVerified: number }>(`/weeks/${weekStart}/submit`);
      const waiting = r.submitted - r.autoVerified;
      toast("success", waiting ? `Submitted. ${r.autoVerified} verified automatically, ${waiting} waiting for ${verifierName}.` : "Submitted and verified automatically.");
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function recall(e: Entry) {
    await api.post(`/entries/${e.id}/recall`).catch((err) => toast("error", (err as Error).message));
    toast("info", "Taken back. You can edit it now.");
    reload();
  }

  async function remove(e: Entry) {
    if (!window.confirm("Delete this draft?")) return;
    await api.delete(`/entries/${e.id}`).catch((err) => toast("error", (err as Error).message));
    reload();
  }

  const goWeek = (start: string) => setParams(start === thisWeek ? {} : { week: start });
  const openDay = (date: string) => {
    setDay(date);
    setViewMode("day");
  };

  return (
    <div className="page timesheet">
      <PageHeader
        title="Timesheet"
        description={`Week of ${formatFullDate(weekStart)}`}
        actions={
          <>
            <div className="week-nav" role="group" aria-label="Change week">
              <IconButton icon="left" label="Previous week" onClick={() => goWeek(addDaysIso(weekStart, -7))} />
              <span className="week-label">{isCurrent ? "This week" : `Week of ${formatFullDate(weekStart)}`}</span>
              <IconButton icon="right" label="Next week" onClick={() => goWeek(addDaysIso(weekStart, 7))} disabled={isCurrent} />
            </div>
            <Button variant="primary" icon="send" busy={submitting} disabled={!toSubmit.length} onClick={submitWeek}>
              Submit week{toSubmit.length ? ` (${toSubmit.length})` : ""}
            </Button>
          </>
        }
      />

      {week.error && <Alert tone="error">{week.error}</Alert>}
      {!w ? (
        <Loading />
      ) : (
        <>
          <div className="week-strip" aria-label="Days of the week">
            {w.days.map((d) => (
              <button
                key={d.date}
                type="button"
                className={`day ${d.expectedMinutes === 0 ? "off" : ""} ${d.leave && !d.leave.halfDay ? "leave" : ""} ${d.holiday ? "holiday" : ""}`}
                aria-pressed={view === "day" && day === d.date}
                onClick={() => openDay(d.date)}
              >
                <span className="day-name">
                  {formatDay(d.date)} {Number(d.date.slice(8))}
                </span>
                <span className="day-hours">{formatHours(d.minutes)}</span>
                <span className={`day-meta ${d.missing ? "missing" : ""} ${lockedSet.has(d.date) ? "verified" : ""}`}>
                  {lockedSet.has(d.date) ? <Icon name="checkCircle" size={12} /> : d.missing && <Icon name="alert" size={12} />}
                  {lockedSet.has(d.date)
                    ? "Verified"
                    : d.holiday
                      ? d.holiday
                      : d.leave && !d.leave.halfDay
                        ? "On leave"
                        : d.expectedMinutes
                          ? `of ${formatHours(d.expectedMinutes)}${d.leave ? " · ½ leave" : ""}`
                          : d.date > today
                            ? "Upcoming"
                            : "Day off"}
                </span>
                {d.expectedMinutes > 0 && <Meter value={d.minutes} max={d.expectedMinutes} />}
              </button>
            ))}
          </div>

          <section className="card day-panel" aria-labelledby="day-title">
            <header className="day-panel-head">
              <div>
                <h2 id="day-title">{view === "week" ? `Week of ${formatFullDate(weekStart)}` : formatLongDate(day)}</h2>
                <p className="muted small">
                  {view === "week" ? (
                    `${formatHours(w.totalMinutes)} of ${formatHours(w.expectedMinutes)} logged`
                  ) : (
                    <>
                      {formatHours(dayInfo?.minutes ?? 0)}
                      {dayInfo?.expectedMinutes ? ` of ${formatHours(dayInfo.expectedMinutes)}` : ""} logged
                      {day === today && " · today"}
                    </>
                  )}
                </p>
              </div>
              {view === "day" && dayInfo?.leave && (
                <span className="badge tone-info lock-badge">
                  <Icon name="calendar" size={12} /> {LEAVE_LABEL[dayInfo.leave.type]}
                  {dayInfo.leave.halfDay ? " · half day" : ""}
                </span>
              )}
              {view === "day" && dayInfo?.holiday && (
                <span className="badge tone-info lock-badge">
                  <Icon name="calendar" size={12} /> Holiday · {dayInfo.holiday}
                </span>
              )}
              {view === "day" && dayLocked && (
                <span className="badge tone-success lock-badge">
                  <Icon name="checkCircle" size={12} /> Verified · locked
                </span>
              )}
              <span className="spacer" />
              <div className="segmented" role="group" aria-label="View">
                <button type="button" aria-pressed={view === "day"} onClick={() => setViewMode("day")}>
                  Day
                </button>
                <button type="button" aria-pressed={view === "week"} onClick={() => setViewMode("week")}>
                  Whole week
                </button>
              </div>
              <label className="switch">
                <input type="checkbox" role="switch" aria-label="Hourly" checked={hourly} onChange={(e) => setHourlyMode(e.target.checked)} />
                <span className="switch-track" aria-hidden="true">
                  <span className="switch-thumb" />
                </span>
                Hourly
              </label>
              {view === "day" && !dayLocked && !onFullLeave && (
                <Button size="sm" variant="primary" icon="plus" onClick={() => addAt()}>
                  Add time
                </Button>
              )}
            </header>

            {view === "day" && onFullLeave && (
              <p className="lock-note small">You're on approved leave this day, so no time is expected. Cancel the leave on the Leave page if you worked.</p>
            )}
            {view === "day" && dayLocked && (
              <p className="lock-note small">
                This day is verified, so it can't be changed. If something is wrong, ask {verifierName} to reopen it.
              </p>
            )}

            {view === "week" ? (
              <WeekView
                week={w}
                hourly={hourly}
                locked={lockedSet}
                today={today}
                verifierName={verifierName}
                onOpenDay={openDay}
                onAdd={(date, hour) => addAt(hour, date)}
                onEdit={setEditing}
              />
            ) : hourly ? (
              <HourlyDay entries={dayEntries} verifierName={verifierName} locked={dayLocked} onAdd={addAt} onEdit={setEditing} onRecall={recall} />
            ) : dayEntries.length === 0 ? (
              <div className="empty">
                <strong>{dayLocked ? "Nothing on this day" : "Nothing filled for this day"}</strong>
                {!dayLocked && (
                  <>
                    Tap <em>Add time</em>, or turn on <em>Hourly</em> to fill it hour by hour.
                  </>
                )}
              </div>
            ) : (
              <ul className="box-list">
                {dayEntries.map((e) => (
                  <EntryBox key={e.id} entry={e} verifierName={verifierName} onEdit={setEditing} onRecall={recall} onDelete={remove} onChanged={reload} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <EntryDialog
        entry={editing}
        prefill={prefill}
        suggestStart={suggestStart}
        defaultDate={day}
        onClose={() => {
          setEditing(null);
          setPrefill(null);
        }}
        onSaved={() => {
          setEditing(null);
          setPrefill(null);
          reload();
        }}
      />
    </div>
  );
}

/** One entry as a box: what, when, how long, and whether it can still be changed. */
function EntryBox({
  entry: e,
  verifierName,
  compact,
  onEdit,
  onRecall,
  onDelete,
  onChanged,
}: {
  entry: Entry;
  verifierName: string;
  compact?: boolean;
  onEdit: (e: Entry) => void;
  onRecall: (e: Entry) => void;
  onDelete?: (e: Entry) => void;
  onChanged?: () => void;
}) {
  const s = entryStatus(e, verifierName);
  const editable = EDITABLE.has(e.status);
  return (
    <li className={`entry-box ${compact ? "compact" : ""} ${editable ? "editable" : ""}`}>
      <button type="button" className="entry-box-main" onClick={() => editable && onEdit(e)} disabled={!editable} aria-label={editable ? `Edit ${e.project.code} entry` : undefined}>
        <span className="entry-box-top">
          {e.startTime && (
            <span className="entry-time num">
              {e.startTime}–{e.endTime}
            </span>
          )}
          <span className="entry-project">
            {e.project.code}
            {e.phase && <span className="muted"> · {e.phase.name}</span>}
          </span>
          <span className="spacer" />
          <span className="num entry-hours">{formatMinutes(e.minutes)}</span>
        </span>
        <span className="entry-desc">{e.description || <em className="muted">No description</em>}</span>
        {e.reviewerComment && (e.status === "CHANGES_REQUESTED" || e.status === "REJECTED") && (
          <span className="entry-comment">
            <strong>{e.reviewer?.name ?? "Verifier"}:</strong> {e.reviewerComment}
          </span>
        )}
      </button>
      {!compact && (
        <EntryFiles
          entryId={e.id}
          attachments={e.attachments ?? []}
          // Drafts get files through Edit; while waiting for a verifier, evidence can still be added here.
          canChange={e.status === "SUBMITTED" && !!onChanged}
          onChanged={() => onChanged?.()}
        />
      )}
      {compact && !!e.attachments?.length && (
        <span className="small muted entry-file-count">
          <Icon name="paperclip" size={12} /> {e.attachments.length} {e.attachments.length === 1 ? "file" : "files"}
        </span>
      )}
      <span className="entry-box-foot">
        <span className={`badge tone-${s.tone}`}>
          <Icon name={s.icon} size={12} />
          {s.text}
        </span>
        <span className="spacer" />
        {editable && (
          <Button size="sm" variant="ghost" icon="edit" onClick={() => onEdit(e)}>
            Edit
          </Button>
        )}
        {e.status === "DRAFT" && onDelete && <IconButton icon="trash" label="Delete draft" onClick={() => onDelete(e)} />}
        {e.status === "SUBMITTED" && (
          <Button size="sm" variant="ghost" icon="undo" onClick={() => onRecall(e)}>
            Take back to edit
          </Button>
        )}
        {e.status === "APPROVED" && <span className="small muted locked">Locked</span>}
      </span>
    </li>
  );
}

/** All 24 hours of the day. Filled hours show what was done; empty hours can be tapped to fill. */
function HourlyDay({
  entries,
  verifierName,
  locked,
  onAdd,
  onEdit,
  onRecall,
}: {
  entries: Entry[];
  verifierName: string;
  locked: boolean;
  onAdd: (hour: number) => void;
  onEdit: (e: Entry) => void;
  onRecall: (e: Entry) => void;
}) {
  const timed = entries.filter((e) => e.startTime && e.endTime);
  const untimed = entries.filter((e) => !e.startTime);
  const scroller = useRef<HTMLDivElement>(null);
  const firstHour = timed.length ? Math.floor(Math.min(...timed.map((e) => toMin(e.startTime!))) / 60) : 8;

  // Open at the working part of the day rather than midnight.
  useEffect(() => {
    const row = scroller.current?.querySelector<HTMLElement>(`[data-hour="${Math.max(0, firstHour - 1)}"]`);
    if (row && scroller.current) scroller.current.scrollTop = row.offsetTop;
  }, [firstHour]);

  return (
    <div className="hourly">
      {untimed.length > 0 && (
        <div className="untimed">
          <span className="field-label">Without a time</span>
          <ul className="box-list">
            {untimed.map((e) => (
              <EntryBox key={e.id} compact entry={e} verifierName={verifierName} onEdit={onEdit} onRecall={onRecall} />
            ))}
          </ul>
        </div>
      )}
      <div className="hour-grid" ref={scroller}>
        {HOURS.map((h) => {
          const from = h * 60;
          const to = from + 60;
          const starting = timed.filter((e) => Math.floor(toMin(e.startTime!) / 60) === h);
          const covering = timed.filter((e) => toMin(e.startTime!) < to && toMin(e.endTime!) > from && Math.floor(toMin(e.startTime!) / 60) !== h);
          return (
            <div key={h} className={`hour-row ${starting.length || covering.length ? "filled" : ""}`} data-hour={h}>
              <span className="hour-label num">{pad(h)}:00</span>
              <div className="hour-slot">
                {starting.length > 0 ? (
                  <ul className="box-list">
                    {starting.map((e) => (
                      <EntryBox key={e.id} compact entry={e} verifierName={verifierName} onEdit={onEdit} onRecall={onRecall} />
                    ))}
                  </ul>
                ) : covering.length > 0 ? (
                  <span className="hour-continued">{covering.map((e) => `${e.project.code} continues (${e.startTime}–${e.endTime})`).join(" · ")}</span>
                ) : locked ? (
                  <span className="hour-empty" aria-hidden="true" />
                ) : (
                  <button type="button" className="hour-add" onClick={() => onAdd(h)} aria-label={`Fill ${pad(h)}:00 to ${pad(h + 1)}:00`}>
                    <Icon name="plus" size={14} /> Fill this hour
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** The whole week at once: seven day columns, or a 24-hour by 7-day grid when Hourly is on. */
function WeekView({
  week,
  hourly,
  locked,
  today,
  verifierName,
  onOpenDay,
  onAdd,
  onEdit,
}: {
  week: WeekSummary;
  hourly: boolean;
  locked: Set<string>;
  today: string;
  verifierName: string;
  onOpenDay: (date: string) => void;
  onAdd: (date: string, hour?: number) => void;
  onEdit: (e: Entry) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const byDay = (date: string) => week.entries.filter((e) => e.workDate === date);
  const timed = week.entries.filter((e) => e.startTime && e.endTime);
  const firstHour = timed.length ? Math.floor(Math.min(...timed.map((e) => toMin(e.startTime!))) / 60) : 8;

  useEffect(() => {
    if (!hourly || !scroller.current) return;
    const row = scroller.current.querySelector<HTMLElement>(`[data-hour="${Math.max(0, firstHour - 1)}"]`);
    if (row) scroller.current.scrollTop = row.offsetTop - 40;
  }, [hourly, firstHour]);

  const dayHead = (d: WeekSummary["days"][number]) => (
    <button type="button" className={`wk-head ${d.date === today ? "is-today" : ""}`} onClick={() => onOpenDay(d.date)} title="Open this day">
      <span className="wk-name">
        {formatDay(d.date)} {Number(d.date.slice(8))}
      </span>
      <span className="wk-hours num">
        {formatHours(d.minutes)}
        {locked.has(d.date) && <Icon name="checkCircle" size={12} label="Verified and locked" />}
      </span>
    </button>
  );

  if (!hourly) {
    return (
      <div className="wk-cols">
        {week.days.map((d) => (
          <div key={d.date} className={`wk-col ${locked.has(d.date) ? "locked-day" : ""}`}>
            {dayHead(d)}
            <ul className="wk-list">
              {byDay(d.date).map((e) => {
                const s = entryStatus(e, verifierName);
                const editable = EDITABLE.has(e.status) && !locked.has(d.date);
                return (
                  <li key={e.id}>
                    <button type="button" className={`wk-entry tone-${s.tone}`} disabled={!editable} onClick={() => onEdit(e)} title={`${e.description} · ${s.text}`}>
                      {e.startTime && <span className="num wk-time">{e.startTime}–{e.endTime}</span>}
                      <strong>{e.project.code}</strong>
                      <span className="wk-desc">{e.description}</span>
                      <span className="num">{formatMinutes(e.minutes)}</span>
                    </button>
                  </li>
                );
              })}
              {!byDay(d.date).length && <li className="muted small wk-none">—</li>}
            </ul>
            {!locked.has(d.date) && (
              <button type="button" className="hour-add wk-add" onClick={() => onAdd(d.date)}>
                <Icon name="plus" size={14} /> Add
              </button>
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="wk-grid-wrap" ref={scroller}>
      <table className="wk-grid">
        <thead>
          <tr>
            <th className="wk-corner" />
            {week.days.map((d) => (
              <th key={d.date} className={locked.has(d.date) ? "locked-day" : ""}>
                {dayHead(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {week.entries.some((e) => !e.startTime) && (
            <tr className="wk-untimed">
              <th className="hour-label small">No set time</th>
              {week.days.map((d) => (
                <td key={d.date} className={`wk-cell ${locked.has(d.date) ? "locked-day" : ""}`}>
                  {week.entries
                    .filter((e) => e.workDate === d.date && !e.startTime)
                    .map((e) => {
                      const s = entryStatus(e, verifierName);
                      const editable = EDITABLE.has(e.status) && !locked.has(d.date);
                      return (
                        <button key={e.id} type="button" className={`wk-entry tone-${s.tone}`} disabled={!editable} onClick={() => onEdit(e)} title={`${e.description} · ${s.text}`}>
                          <strong>{e.project.code}</strong>
                          <span className="num">{formatMinutes(e.minutes)}</span>
                        </button>
                      );
                    })}
                </td>
              ))}
            </tr>
          )}
          {HOURS.map((h) => (
            <tr key={h} data-hour={h}>
              <th className="hour-label num">{pad(h)}:00</th>
              {week.days.map((d) => {
                const here = timed.filter((e) => e.workDate === d.date && toMin(e.startTime!) < (h + 1) * 60 && toMin(e.endTime!) > h * 60);
                const isLocked = locked.has(d.date);
                if (here.length) {
                  const e = here[0]!;
                  const s = entryStatus(e, verifierName);
                  const first = Math.floor(toMin(e.startTime!) / 60) === h;
                  const editable = EDITABLE.has(e.status) && !isLocked;
                  return (
                    <td key={d.date} className={`wk-cell filled tone-${s.tone} ${first ? "first" : ""}`}>
                      <button type="button" disabled={!editable} onClick={() => onEdit(e)} title={`${e.startTime}–${e.endTime} ${e.project.code} · ${e.description} · ${s.text}`}>
                        {first ? (
                          <>
                            <strong>{e.project.code}</strong> <span className="wk-desc">{e.description}</span>
                          </>
                        ) : (
                          <span className="sr-only">{e.project.code} continues</span>
                        )}
                      </button>
                    </td>
                  );
                }
                return (
                  <td key={d.date} className={`wk-cell ${isLocked ? "locked-day" : ""}`}>
                    {!isLocked && (
                      <button type="button" className="wk-fill" onClick={() => onAdd(d.date, h)} aria-label={`Fill ${formatDay(d.date)} ${pad(h)}:00`}>
                        <Icon name="plus" size={12} />
                      </button>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
