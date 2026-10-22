import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { api, type Role } from "../api";
import { useUser } from "../auth";
import { Icon } from "../components/Icon";
import { Alert, Button, Card, Dialog, Empty, Field, Loading, Meter, PageHeader, useLoad, useToast } from "../components/ui";
import { formatStamp } from "../format";

interface Options {
  broadcast: boolean;
  people: { id: string; name: string; role: Role }[];
  teams: { id: string; name: string; size: number }[];
  myTeamSize: number;
}

interface SentAlert {
  id: string;
  title: string;
  body: string;
  priority: "NORMAL" | "URGENT";
  audience: string;
  recipientCount: number;
  readCount: number;
  createdAt: string;
}

type AudienceType = "everyone" | "role" | "team" | "people";

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admins", MANAGER: "Managers", EMPLOYEE: "Employees" };

/** Send alerts down the hierarchy and see who has read them. */
export function Alerts() {
  const user = useUser();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const options = useLoad(() => api.get<Options>("/alerts/options"), []);
  const [version, setVersion] = useState(0);
  const sent = useLoad(() => api.get<{ alerts: SentAlert[] }>("/alerts/sent"), [version]);
  const prefillTo = params.get("to")?.split(",").filter(Boolean) ?? [];

  const [type, setType] = useState<AudienceType>(prefillTo.length ? "people" : "team");
  const [role, setRole] = useState<Role>("EMPLOYEE");
  const [managerId, setManagerId] = useState("");
  const [chosen, setChosen] = useState<string[]>(prefillTo);
  const [title, setTitle] = useState(params.get("title") ?? "");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [receiptsFor, setReceiptsFor] = useState<SentAlert | null>(null);

  // Admins usually broadcast; managers usually alert their team.
  useEffect(() => {
    if (options.data?.broadcast && !prefillTo.length) setType("everyone");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.data?.broadcast]);

  // Arriving from a report with people pre-chosen: start on the message.
  useEffect(() => {
    if (prefillTo.length) document.querySelector<HTMLTextAreaElement>("textarea[data-alert-body]")?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const o = options.data;
  const reach = useMemo(() => {
    if (!o) return 0;
    if (type === "everyone") return o.people.length;
    if (type === "role") return o.people.filter((p) => p.role === role).length;
    if (type === "team") return managerId ? (o.teams.find((t) => t.id === managerId)?.size ?? 0) : o.myTeamSize;
    return chosen.length;
  }, [o, type, role, managerId, chosen]);

  async function send(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const audience =
      type === "everyone"
        ? { type }
        : type === "role"
          ? { type, role }
          : type === "team"
            ? { type, ...(managerId ? { managerId } : {}) }
            : { type, userIds: chosen };
    try {
      const r = await api.post<{ alert: SentAlert }>("/alerts", { title: title.trim(), body: body.trim(), priority: urgent ? "URGENT" : "NORMAL", audience });
      toast("success", `Alert sent to ${r.alert.recipientCount} ${r.alert.recipientCount === 1 ? "person" : "people"}.`);
      setTitle("");
      setBody("");
      setUrgent(false);
      setChosen([]);
      if (params.has("to")) setParams({}, { replace: true });
      setVersion((v) => v + 1);
    } catch (err) {
      toast("error", (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visiblePeople = (o?.people ?? []).filter((p) => p.name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="page">
      <PageHeader
        title="Alerts"
        description={
          user.role === "ADMIN"
            ? "Send a message to everyone, a role, a manager's team or chosen people. Urgent alerts stay on their screen until they acknowledge them."
            : "Send a message to the people you verify. Urgent alerts stay on their screen until they acknowledge them."
        }
      />
      {options.error && <Alert tone="error">{options.error}</Alert>}
      {!o ? (
        <Loading />
      ) : (
        <div className="grid grid-2-1">
          <Card title="New alert">
            <form className="stack" onSubmit={send}>
              <div className="field">
                <span className="field-label">Send to</span>
                <div className="segmented" role="group" aria-label="Audience">
                  {o.broadcast && (
                    <button type="button" aria-pressed={type === "everyone"} onClick={() => setType("everyone")}>
                      Everyone
                    </button>
                  )}
                  {o.broadcast && (
                    <button type="button" aria-pressed={type === "role"} onClick={() => setType("role")}>
                      A role
                    </button>
                  )}
                  <button type="button" aria-pressed={type === "team"} onClick={() => setType("team")}>
                    {o.broadcast ? "A team" : "My team"}
                  </button>
                  <button type="button" aria-pressed={type === "people"} onClick={() => setType("people")}>
                    Chosen people
                  </button>
                </div>
              </div>

              {type === "role" && (
                <Field label="Role">
                  {(p) => (
                    <select {...p} className="select" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          All {ROLE_LABEL[r].toLowerCase()}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
              )}
              {type === "team" && o.broadcast && (
                <Field label="Whose team">
                  {(p) => (
                    <select {...p} className="select" value={managerId} onChange={(e) => setManagerId(e.target.value)}>
                      <option value="">People I verify ({o.myTeamSize})</option>
                      {o.teams
                        .filter((t) => t.id !== user.id)
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}'s team ({t.size})
                          </option>
                        ))}
                    </select>
                  )}
                </Field>
              )}
              {type === "people" && (
                <div className="field">
                  <span className="field-label">People ({chosen.length} chosen)</span>
                  <input className="input" placeholder="Search by name" aria-label="Search people" value={filter} onChange={(e) => setFilter(e.target.value)} />
                  <div className="people-picker">
                    {visiblePeople.length === 0 ? (
                      <p className="small muted">Nobody matches.</p>
                    ) : (
                      visiblePeople.map((p) => (
                        <label key={p.id} className="checkbox">
                          <input type="checkbox" checked={chosen.includes(p.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, p.id] : chosen.filter((x) => x !== p.id))} />
                          {p.name} <span className="muted small">· {p.role.toLowerCase()}</span>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}

              <Field label="Title">{(p) => <input {...p} className="input" maxLength={120} value={title} placeholder="e.g. Submit this week's time by Friday 5pm" onChange={(e) => setTitle(e.target.value)} />}</Field>
              <Field label="Message">
                {(p) => <textarea {...p} data-alert-body className="textarea" rows={4} maxLength={2000} value={body} placeholder="What do they need to know or do?" onChange={(e) => setBody(e.target.value)} />}
              </Field>
              <label className="checkbox">
                <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
                Urgent: show it on their screen until they acknowledge it
              </label>
              <div className="row">
                <Button type="submit" variant="primary" icon="send" busy={busy} disabled={!title.trim() || !body.trim() || reach === 0}>
                  Send alert
                </Button>
                <span className="small muted">
                  Goes to {reach} {reach === 1 ? "person" : "people"}
                </span>
              </div>
            </form>
          </Card>

          <Card title="Sent" description="Read receipts update as people open the alert." flush>
            {!sent.data ? (
              <Loading />
            ) : sent.data.alerts.length === 0 ? (
              <Empty title="No alerts yet">Alerts you send appear here.</Empty>
            ) : (
              <ul className="sent-list">
                {sent.data.alerts.map((a) => (
                  <li key={a.id}>
                    <button type="button" className="sent-item" onClick={() => setReceiptsFor(a)}>
                      <span className="row" style={{ gap: 6 }}>
                        {a.priority === "URGENT" && <span className="badge tone-error">Urgent</span>}
                        <strong>{a.title}</strong>
                      </span>
                      <span className="small muted">
                        {a.audience} · {formatStamp(a.createdAt)}
                      </span>
                      <Meter value={a.readCount} max={a.recipientCount || 1} />
                      <span className="small">
                        Read by {a.readCount} of {a.recipientCount}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}
      <Receipts alert={receiptsFor} onClose={() => setReceiptsFor(null)} />
    </div>
  );
}

function Receipts({ alert, onClose }: { alert: SentAlert | null; onClose: () => void }) {
  const data = useLoad(
    () =>
      alert
        ? api.get<{ receipts: { user: { id: string; name: string; role: string }; readAt: string | null }[] }>(`/alerts/${alert.id}/receipts`)
        : Promise.resolve(null),
    [alert?.id],
  );
  return (
    <Dialog open={alert !== null} title={alert?.title ?? ""} onClose={onClose}>
      {alert && <p className="alert-body-text">{alert.body}</p>}
      {!data.data ? (
        <Loading />
      ) : (
        <ul className="receipt-list">
          {data.data.receipts.map((r) => (
            <li key={r.user.id}>
              <span>{r.user.name}</span>
              <span className="spacer" />
              {r.readAt ? (
                <span className="badge tone-success">
                  <Icon name="check" size={12} /> Read {formatStamp(r.readAt)}
                </span>
              ) : (
                <span className="badge tone-neutral">Not read yet</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
