import { useState } from "react";
import { api, type Permission, type Role } from "../../api";
import { Icon } from "../../components/Icon";
import { Alert, Button, Card, Dialog, Field, Loading, PageHeader, useLoad, useToast } from "../../components/ui";

interface AccessData {
  permissions: { key: Permission; description: string }[];
  roles: Record<Role, Permission[]>;
  defaults: Record<Role, Permission[]>;
  people: { id: string; name: string; email: string; role: Role; permissions: Permission[] }[];
}

const ROLE_COLUMNS: { role: Role; label: string }[] = [
  { role: "ADMIN", label: "Admin" },
  { role: "MANAGER", label: "Manager (sub-admin)" },
  { role: "EMPLOYEE", label: "Employee" },
];

const LABEL: Record<Permission, string> = {
  MANAGE_USERS: "Manage users",
  MANAGE_PROJECTS: "Manage projects & phases",
  CLOSE_PHASES: "Close phases",
  MANAGE_POLICY: "Change policy",
  VIEW_AUDIT: "See audit log",
};

/** Super admin only: who may do what. Changes apply straight away and are audited. */
export function Access() {
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.get<AccessData>("/access"), []);
  const [saving, setSaving] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);

  async function toggleRole(role: Role, permission: Permission, on: boolean) {
    if (!data) return;
    const next = on ? [...new Set([...data.roles[role], permission])] : data.roles[role].filter((p) => p !== permission);
    setSaving(`${role}:${permission}`);
    try {
      await api.put(`/access/roles/${role}`, { permissions: next });
      toast("success", `${LABEL[permission]} ${on ? "given to" : "taken from"} ${ROLE_COLUMNS.find((r) => r.role === role)!.label.toLowerCase()}s.`);
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  async function setPerson(id: string, permissions: Permission[]) {
    try {
      await api.put(`/access/users/${id}`, { permissions });
      toast("success", "Access updated.");
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Access control"
        description="Decide who can do what. You (the super admin) always have everything. Changes apply immediately and are recorded in the audit log."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setGranting(true)}>
            Give a person access
          </Button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      {!data ? (
        <Loading />
      ) : (
        <>
          <Card title="By role" description="Everyone with the role gets these permissions." flush>
            <div className="table-wrap">
              <table className="table access-table">
                <thead>
                  <tr>
                    <th>Permission</th>
                    <th className="center">Super admin</th>
                    {ROLE_COLUMNS.map((c) => (
                      <th key={c.role} className="center">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.permissions.map((p) => (
                    <tr key={p.key}>
                      <td>
                        <div className="cell-title">{LABEL[p.key]}</div>
                        <div className="cell-sub">{p.description}</div>
                      </td>
                      <td className="center">
                        <span className="badge tone-success" title="The super admin always has every permission">
                          <Icon name="check" size={12} /> Always
                        </span>
                      </td>
                      {ROLE_COLUMNS.map((c) => {
                        const on = data.roles[c.role].includes(p.key);
                        return (
                          <td key={c.role} className="center">
                            <label className="switch" title={on ? "Allowed" : "Not allowed"}>
                              <input
                                type="checkbox"
                                role="switch"
                                aria-label={`${LABEL[p.key]} for ${c.label}`}
                                checked={on}
                                disabled={saving === `${c.role}:${p.key}`}
                                onChange={(e) => toggleRole(c.role, p.key, e.target.checked)}
                              />
                              <span className="switch-track" aria-hidden="true">
                                <span className="switch-thumb" />
                              </span>
                            </label>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="Individual people" description="Extra permissions for one person, on top of their role." flush>
            {data.people.length === 0 ? (
              <p className="muted small" style={{ padding: 20 }}>
                Nobody has individual access yet. Use “Give a person access” to grant one person something their role doesn't have.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <tbody>
                    {data.people.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="cell-title">{u.name}</div>
                          <div className="cell-sub">
                            {u.email} · {u.role.toLowerCase()}
                          </div>
                        </td>
                        <td>
                          <div className="row">
                            {u.permissions.map((p) => (
                              <span key={p} className="badge tone-info">
                                {LABEL[p]}
                                <button
                                  type="button"
                                  className="badge-x"
                                  aria-label={`Remove ${LABEL[p]} from ${u.name}`}
                                  onClick={() => setPerson(u.id, u.permissions.filter((x) => x !== p))}
                                >
                                  <Icon name="x" size={12} />
                                </button>
                              </span>
                            ))}
                          </div>
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
      {data && (
        <GrantDialog
          open={granting}
          permissions={data.permissions.map((p) => p.key)}
          onClose={() => setGranting(false)}
          onGrant={async (id, perms) => {
            const current = data.people.find((p) => p.id === id)?.permissions ?? [];
            await setPerson(id, [...new Set([...current, ...perms])]);
            setGranting(false);
          }}
        />
      )}
    </div>
  );
}

function GrantDialog({
  open,
  permissions,
  onClose,
  onGrant,
}: {
  open: boolean;
  permissions: Permission[];
  onClose: () => void;
  onGrant: (userId: string, permissions: Permission[]) => Promise<void>;
}) {
  const users = useLoad(
    () => (open ? api.get<{ users: { id: string; name: string; email: string; role: Role; active: boolean }[] }>("/admin/users").then((r) => r.users) : Promise.resolve([])),
    [open],
  );
  const [userId, setUserId] = useState("");
  const [chosen, setChosen] = useState<Permission[]>([]);
  return (
    <Dialog
      open={open}
      title="Give a person access"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!userId || !chosen.length} onClick={() => onGrant(userId, chosen)}>
            Give access
          </Button>
        </>
      }
    >
      <Field label="Person">
        {(p) => (
          <select {...p} className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose someone</option>
            {(users.data ?? [])
              .filter((u) => u.active)
              .map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role.toLowerCase()})
                </option>
              ))}
          </select>
        )}
      </Field>
      <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="field-label" style={{ marginBottom: 8 }}>
          Permissions
        </legend>
        <div className="stack" style={{ gap: 8 }}>
          {permissions.map((p) => (
            <label key={p} className="checkbox">
              <input type="checkbox" checked={chosen.includes(p)} onChange={(e) => setChosen(e.target.checked ? [...chosen, p] : chosen.filter((x) => x !== p))} />
              {LABEL[p]}
            </label>
          ))}
        </div>
      </fieldset>
    </Dialog>
  );
}
