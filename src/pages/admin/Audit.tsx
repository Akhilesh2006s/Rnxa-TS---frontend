import { useState } from "react";
import { api, qs } from "../../api";
import { Alert, Card, Field, Loading, PageHeader, useLoad } from "../../components/ui";
import { formatStamp } from "../../format";

interface AuditEvent {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  changes: Record<string, unknown> | null;
  createdAt: string;
  actor: { id: string; name: string } | null;
}

const ENTITY_TYPES = ["TimesheetEntry", "User", "Project", "Phase", "ProjectAssignment", "OrgPolicy"];

function describe(changes: AuditEvent["changes"]) {
  if (!changes) return "";
  return Object.entries(changes)
    .map(([k, v]) => {
      if (v && typeof v === "object" && "from" in v && "to" in v) {
        const c = v as { from: unknown; to: unknown };
        return `${k}: ${String(c.from)} → ${String(c.to)}`;
      }
      return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .join("; ");
}

export function Audit() {
  const [entityType, setEntityType] = useState("");
  const { data, error } = useLoad(() => api.get<{ events: AuditEvent[] }>(`/admin/audit${qs({ entityType })}`).then((r) => r.events), [entityType]);

  return (
    <div className="page">
      <PageHeader title="Audit log" description="Who changed what and when: submissions, approvals, reopenings and administrative changes. Latest 200 events." />
      <Card>
        <div className="toolbar">
          <Field label="Record type">
            {(p) => (
              <select {...p} className="select" value={entityType} onChange={(e) => setEntityType(e.target.value)}>
                <option value="">All</option>
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
      </Card>
      {error && <Alert tone="error">{error}</Alert>}
      <Card flush>
        {!data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Record</th>
                  <th>Changes</th>
                </tr>
              </thead>
              <tbody>
                {data.map((e) => (
                  <tr key={e.id}>
                    <td className="num" style={{ whiteSpace: "nowrap" }}>
                      {formatStamp(e.createdAt)}
                    </td>
                    <td>{e.actor?.name ?? "System"}</td>
                    <td>
                      <code className="small">{e.action}</code>
                    </td>
                    <td className="cell-sub">
                      {e.entityType}
                      <br />
                      <code>{e.entityId.slice(-8)}</code>
                    </td>
                    <td className="cell-sub" style={{ maxWidth: 420 }}>
                      {describe(e.changes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
