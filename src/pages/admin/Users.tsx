import { useState, type FormEvent } from "react";
import { api, type Role } from "../../api";
import { useNavigate } from "react-router-dom";
import { useAuth, useUser } from "../../auth";
import { Alert, Button, Card, Dialog, Field, Loading, PageHeader, useLoad, useToast } from "../../components/ui";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  verifierId: string | null;
  verifier: { id: string; name: string } | null;
  assignments: { id: string; role: "MEMBER" | "REVIEWER"; project: { id: string; code: string; name: string } }[];
}

const ROLE_LABEL: Record<Role, string> = { ADMIN: "Admin", MANAGER: "Manager", EMPLOYEE: "Employee" };

export function Users() {
  const me = useUser();
  const toast = useToast();
  const { data, error, reload } = useLoad(() => api.get<{ users: AdminUser[] }>("/admin/users").then((r) => r.users), []);
  const [editing, setEditing] = useState<AdminUser | "new" | null>(null);
  const { impersonate } = useAuth();
  const navigate = useNavigate();

  async function viewAs(u: AdminUser) {
    try {
      await impersonate(u.id);
      navigate("/");
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  async function toggleActive(u: AdminUser) {
    try {
      await api.patch(`/admin/users/${u.id}`, { active: !u.active });
      toast("success", `${u.name} ${u.active ? "deactivated" : "reactivated"}.`);
      reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  }

  return (
    <div className="page">
      <PageHeader
        title="Users"
        description={
          me.isSuperAdmin
            ? "Create accounts and set roles. Use View as to see the app exactly as someone else does (audited under your name)."
            : "Create accounts and set roles. Project access is managed under Projects & phases."
        }
        actions={
          <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
            Add user
          </Button>
        }
      />
      {error && <Alert tone="error">{error}</Alert>}
      <Card flush>
        {!data ? (
          <Loading />
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Verified by</th>
                  <th>Projects</th>
                  <th>Status</th>
                  <th className="shrink">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="cell-title">{u.name}</div>
                      <div className="cell-sub">{u.email}</div>
                    </td>
                    <td>{ROLE_LABEL[u.role]}</td>
                    <td>{u.verifier ? u.verifier.name : u.role === "ADMIN" ? <span className="muted">—</span> : <span className="muted">Any admin</span>}</td>
                    <td className="cell-sub">
                      {u.assignments.length ? (
                        u.assignments.map((a) => a.project.code).join(", ")
                      ) : u.role === "ADMIN" ? (
                        "—"
                      ) : (
                        <span className="badge tone-warning">No projects yet</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${u.active ? "tone-success" : "tone-neutral"}`}>{u.active ? "Active" : "Deactivated"}</span>
                    </td>
                    <td className="shrink">
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <Button size="sm" variant="ghost" icon="edit" onClick={() => setEditing(u)}>
                          Edit
                        </Button>
                        {me.isSuperAdmin && u.id !== me.id && u.active && (
                          <Button size="sm" variant="ghost" icon="eye" onClick={() => viewAs(u)}>
                            View as
                          </Button>
                        )}
                        {u.id !== me.id && (
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(u)}>
                            {u.active ? "Deactivate" : "Reactivate"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <UserDialog
        verifiers={(data ?? []).filter((u) => u.active && u.role !== "EMPLOYEE")}
        user={editing}
        isSelf={editing !== "new" && editing?.id === me.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
        }}
      />
    </div>
  );
}

function UserDialog({
  user,
  isSelf,
  verifiers,
  onClose,
  onSaved,
}: {
  user: AdminUser | "new" | null;
  isSelf: boolean;
  verifiers: AdminUser[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = user === "new";
  const existing = user && user !== "new" ? user : null;
  const [form, setForm] = useState({ name: "", email: "", role: "EMPLOYEE" as Role, password: "", verifierId: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState<string | null>(null);

  // Reset the form whenever a different user is opened.
  const currentKey = user === null ? null : isNew ? "new" : existing!.id;
  if (currentKey !== key) {
    setKey(currentKey);
    setForm({ name: existing?.name ?? "", email: existing?.email ?? "", role: existing?.role ?? "EMPLOYEE", password: "", verifierId: existing?.verifierId ?? "" });
    setError(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isNew) {
        await api.post("/admin/users", { ...form, verifierId: form.verifierId || null });
        toast("success", `${form.name} added. Share the temporary password with them securely.`);
      } else if (existing) {
        await api.patch(`/admin/users/${existing.id}`, {
          name: form.name,
          role: form.role,
          verifierId: form.verifierId || null,
          ...(form.password ? { password: form.password } : {}),
        });
        toast("success", "User updated.");
      }
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={user !== null}
      title={isNew ? "Add user" : "Edit user"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="user-form" busy={busy}>
            {isNew ? "Create user" : "Save changes"}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={submit} className="form-grid" noValidate>
        {error && (
          <div className="span-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <Field label="Full name" className="span-2">
          {(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}
        </Field>
        <Field label="Work email" className="span-2" hint={isNew ? undefined : "Email cannot be changed."}>
          {(p) => <input {...p} className="input" type="email" value={form.email} disabled={!isNew} onChange={(e) => setForm({ ...form, email: e.target.value })} required />}
        </Field>
        <Field label="Role" hint={isSelf ? "You cannot change your own role." : "Managers verify the time of the people who have them as verifier."}>
          {(p) => (
            <select {...p} className="select" value={form.role} disabled={isSelf} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="EMPLOYEE">Employee</option>
              <option value="MANAGER">Manager</option>
              <option value="ADMIN">Admin</option>
            </select>
          )}
        </Field>
        <Field label="Verified by" hint="Who checks this person's time. If nobody is set, any admin can.">
          {(p) => (
            <select {...p} className="select" value={form.verifierId} onChange={(e) => setForm({ ...form, verifierId: e.target.value })}>
              <option value="">Any admin</option>
              {verifiers
                .filter((v) => existing?.id !== v.id)
                .map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.role.toLowerCase()})
                  </option>
                ))}
            </select>
          )}
        </Field>
        <Field label={isNew ? "Temporary password" : "Reset password"} hint="At least 10 characters.">
          {(p) => (
            <input
              {...p}
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              placeholder={isNew ? "" : "Leave blank to keep"}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
