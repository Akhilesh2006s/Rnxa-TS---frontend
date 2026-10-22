import { useState, type FormEvent } from "react";
import { useUrlState } from "../../useUrlState";
import { api, type Role } from "../../api";
import { useCan } from "../../auth";
import { Alert, Button, Card, Dialog, Empty, Field, IconButton, Loading, PageHeader, useLoad, useToast } from "../../components/ui";

interface AdminPhase {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  status: "PLANNED" | "IN_PROGRESS" | "DONE";
}

const STATUS_TEXT: Record<AdminPhase["status"], string> = { PLANNED: "Planned", IN_PROGRESS: "In progress", DONE: "Done" };
const STATUS_TONE: Record<AdminPhase["status"], string> = { PLANNED: "neutral", IN_PROGRESS: "info", DONE: "success" };

interface AdminProject {
  id: string;
  code: string;
  name: string;
  client: string | null;
  description: string | null;
  startDate: string | null;
  endDate: string | null;
  phasesEnabled: boolean;
  active: boolean;
  phases: AdminPhase[];
  assignments: { id: string; role: "MEMBER" | "REVIEWER"; user: { id: string; name: string; email: string; role: Role } }[];
}

export function Projects() {
  const toast = useToast();
  const projects = useLoad(() => api.get<{ projects: AdminProject[] }>("/admin/projects").then((r) => r.projects), []);
  const users = useLoad(() => api.get<{ users: { id: string; name: string; role: Role; active: boolean }[] }>("/admin/users").then((r) => r.users), []);
  const [selectedParam, setSelectedParam] = useUrlState<string>("project", "");
  const selectedId = selectedParam || null;
  const setSelectedId = (id: string) => setSelectedParam(id);
  const [creating, setCreating] = useState(false);

  const list = projects.data ?? [];
  const selected = list.find((p) => p.id === selectedId) ?? list[0] ?? null;

  const run = async (fn: () => Promise<unknown>, message: string) => {
    try {
      await fn();
      toast("success", message);
      projects.reload();
    } catch (e) {
      toast("error", (e as Error).message);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Projects & phases"
        description="Define the work hierarchy and who can log or review time on each project."
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            New project
          </Button>
        }
      />
      {projects.error && <Alert tone="error">{projects.error}</Alert>}
      {!projects.data ? (
        <Loading />
      ) : list.length === 0 ? (
        <Card>
          <Empty title="No projects yet">Create a project, add its phases, then assign people.</Empty>
        </Card>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "minmax(220px, 300px) minmax(0, 1fr)", alignItems: "start" }}>
          <Card flush>
            <nav className="nav" style={{ padding: 8 }} aria-label="Projects">
              {list.map((p) => (
                <a
                  key={p.id}
                  href={`#${p.code}`}
                  aria-current={selected?.id === p.id ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    setSelectedId(p.id);
                  }}
                  style={{ height: "auto", padding: "8px 12px", flexDirection: "column", alignItems: "flex-start", gap: 0 }}
                >
                  <span>{p.code}</span>
                  <span className="cell-sub" style={{ fontWeight: 400 }}>
                    {p.name}
                    {!p.active ? " · inactive" : ""}
                  </span>
                </a>
              ))}
            </nav>
          </Card>
          {selected && <ProjectDetail key={selected.id} project={selected} users={users.data ?? []} run={run} />}
        </div>
      )}
      <CreateProjectDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          setSelectedId(id);
          projects.reload();
        }}
      />
    </div>
  );
}

function ProjectDetail({
  project,
  users,
  run,
}: {
  project: AdminProject;
  users: { id: string; name: string; role: Role; active: boolean }[];
  run: (fn: () => Promise<unknown>, message: string) => Promise<void>;
}) {
  const [assignUser, setAssignUser] = useState("");
  const [phaseEdit, setPhaseEdit] = useState<AdminPhase | "new" | null>(null);
  // Closing phases is the super admin's call unless they grant it; editing needs "manage projects".
  const canClose = useCan("CLOSE_PHASES");
  const canManage = useCan("MANAGE_PROJECTS");
  const [details, setDetails] = useState({ description: project.description ?? "", startDate: project.startDate ?? "", endDate: project.endDate ?? "" });
  const detailsDirty =
    details.description !== (project.description ?? "") || details.startDate !== (project.startDate ?? "") || details.endDate !== (project.endDate ?? "");
  const members = project.assignments.filter((a) => a.role === "MEMBER");
  const candidates = users.filter((u) => u.active && !members.some((a) => a.user.id === u.id));

  return (
    <div className="stack">
      <Card
        title={`${project.code} · ${project.name}`}
        description={project.client ? `Client: ${project.client}` : "Internal project"}
        actions={
          <Button size="sm" onClick={() => run(() => api.patch(`/admin/projects/${project.id}`, { active: !project.active }), project.active ? "Project deactivated." : "Project reactivated.")}>
            {project.active ? "Deactivate project" : "Reactivate project"}
          </Button>
        }
      >
        <form
          className="form-grid"
          style={{ marginBottom: 16 }}
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                api.patch(`/admin/projects/${project.id}`, {
                  description: details.description.trim() || null,
                  startDate: details.startDate || null,
                  endDate: details.endDate || null,
                }),
              "Project details saved.",
            );
          }}
        >
          <Field label="What is this project?" className="span-2" hint="Shown to everyone on the project's page.">
            {(p) => (
              <textarea
                {...p}
                className="textarea"
                maxLength={2000}
                value={details.description}
                placeholder="e.g. Rolling out Salesforce CPQ for Acme's sales team, from discovery to hypercare."
                onChange={(e) => setDetails({ ...details, description: e.target.value })}
              />
            )}
          </Field>
          <Field label="Start date">
            {(p) => <input {...p} className="input" type="date" value={details.startDate} onChange={(e) => setDetails({ ...details, startDate: e.target.value })} />}
          </Field>
          <Field label="End date">
            {(p) => <input {...p} className="input" type="date" value={details.endDate} min={details.startDate || undefined} onChange={(e) => setDetails({ ...details, endDate: e.target.value })} />}
          </Field>
          <div className="span-2">
            <Button type="submit" variant="primary" disabled={!detailsDirty || !canManage}>
              Save details
            </Button>
          </div>
        </form>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={project.phasesEnabled}
            onChange={(e) => run(() => api.patch(`/admin/projects/${project.id}`, { phasesEnabled: e.target.checked }), "Phase setting updated.")}
          />
          Require a phase on every entry for this project
        </label>
        {!project.active && (
          <div style={{ marginTop: 12 }}>
            <Alert tone="info">Inactive projects are hidden from employees. Existing entries are kept.</Alert>
          </div>
        )}
      </Card>

      {project.phasesEnabled && (
        <Card
          title="Phases"
          description={`The stages of this project. Everyone on the project sees these details. People log time against open phases.${canClose ? "" : " Only the super admin, or someone they allow, can close a phase or mark it done."}`}
          actions={
            canManage && (
              <Button size="sm" variant="primary" icon="plus" onClick={() => setPhaseEdit("new")}>
                Add phase
              </Button>
            )
          }
          flush
        >
          {project.phases.length === 0 ? (
            <Empty title="No phases yet">Add the project's phases, e.g. Discovery, Build, UAT, so people can log time against them.</Empty>
          ) : (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Phase</th>
                    <th>Dates</th>
                    <th>Status</th>
                    <th>Logging</th>
                    <th className="shrink">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {project.phases.map((ph) => (
                    <tr key={ph.id}>
                      <td>
                        <div className="cell-title">{ph.name}</div>
                        <div className="cell-sub">{ph.description || "No description"}</div>
                      </td>
                      <td className="cell-sub num">{ph.startDate || ph.endDate ? `${ph.startDate ?? "…"} → ${ph.endDate ?? "…"}` : "Not set"}</td>
                      <td>
                        <select
                          aria-label={`Status of ${ph.name}`}
                          className="select select-sm"
                          value={ph.status}
                          disabled={(ph.status === "DONE" && !canClose) || (!canManage && !canClose)}
                          title={!canClose ? "Only the super admin, or someone they allow, can mark phases done." : undefined}
                          onChange={(e) => run(() => api.patch(`/admin/phases/${ph.id}`, { status: e.target.value }), `${ph.name} is now ${STATUS_TEXT[e.target.value as AdminPhase["status"]].toLowerCase()}.`)}
                        >
                          {(Object.keys(STATUS_TEXT) as AdminPhase["status"][]).map((s) => (
                            <option key={s} value={s} disabled={s === "DONE" && !canClose}>
                              {STATUS_TEXT[s]}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`badge ${ph.active ? `tone-${STATUS_TONE.IN_PROGRESS}` : "tone-neutral"}`}>{ph.active ? "Open" : "Closed"}</span>
                      </td>
                      <td className="shrink">
                        <div className="row" style={{ flexWrap: "nowrap" }}>
                          {canManage && (
                            <Button size="sm" variant="ghost" icon="edit" onClick={() => setPhaseEdit(ph)}>
                              Edit
                            </Button>
                          )}
                          {canClose ? (
                            <Button size="sm" variant="ghost" onClick={() => run(() => api.patch(`/admin/phases/${ph.id}`, { active: !ph.active }), ph.active ? `${ph.name} closed.` : `${ph.name} reopened.`)}>
                              {ph.active ? "Close phase" : "Reopen phase"}
                            </Button>
                          ) : (
                            <span className="small muted" title="Only the super admin, or someone they allow, can close phases.">
                              🔒 Super admin closes
                            </span>
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
      )}

      <PhaseDialog
        canClose={canClose}
        phase={phaseEdit}
        onClose={() => setPhaseEdit(null)}
        onSave={async (data) => {
          if (phaseEdit === "new") await run(() => api.post(`/admin/projects/${project.id}/phases`, data), `Phase "${data.name}" added.`);
          else if (phaseEdit) await run(() => api.patch(`/admin/phases/${phaseEdit.id}`, data), "Phase saved.");
          setPhaseEdit(null);
        }}
      />

      <Card title="People" description="Everyone listed here can log time on this project. Who verifies their time is set on the Users page." flush>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Person</th>
                <th className="shrink">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {members.map((a) => (
                <tr key={a.id}>
                  <td>
                    <div className="cell-title">{a.user.name}</div>
                    <div className="cell-sub">{a.user.email}</div>
                  </td>
                  <td className="shrink">
                    <IconButton
                      icon="trash"
                      label={`Remove ${a.user.name} from ${project.code}`}
                      onClick={() => run(() => api.delete(`/admin/assignments/${a.id}`), "Access removed.")}
                    />
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    Nobody is assigned yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          className="row"
          style={{ padding: 16, borderTop: "1px solid var(--color-border)" }}
          onSubmit={(e) => {
            e.preventDefault();
            if (!assignUser) return;
            void run(() => api.post("/admin/assignments", { userId: assignUser, projectId: project.id, role: "MEMBER" }), "Added to the project.").then(() => setAssignUser(""));
          }}
        >
          <label className="sr-only" htmlFor="assign-user">
            Person
          </label>
          <select id="assign-user" className="select" style={{ maxWidth: 260 }} value={assignUser} onChange={(e) => setAssignUser(e.target.value)}>
            <option value="">Choose a person</option>
            {candidates.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <Button type="submit" icon="plus" disabled={!assignUser}>
            Add to project
          </Button>
        </form>
      </Card>
    </div>
  );
}

function CreateProjectDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ code: "", name: "", client: "", phasesEnabled: true, phases: "Discovery, Build, UAT" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { project } = await api.post<{ project: { id: string } }>("/admin/projects", {
        code: form.code,
        name: form.name,
        client: form.client || null,
        phasesEnabled: form.phasesEnabled,
      });
      if (form.phasesEnabled) {
        const names = form.phases.split(",").map((s) => s.trim()).filter(Boolean);
        for (const name of names) await api.post(`/admin/projects/${project.id}/phases`, { name });
      }
      toast("success", `Project ${form.code.toUpperCase()} created. Assign people next.`);
      setForm({ code: "", name: "", client: "", phasesEnabled: true, phases: "Discovery, Build, UAT" });
      onCreated(project.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="project-form" busy={busy} disabled={!form.code || !form.name}>
            Create project
          </Button>
        </>
      }
    >
      <form id="project-form" className="form-grid" onSubmit={submit} noValidate>
        {error && (
          <div className="span-2">
            <Alert tone="error">{error}</Alert>
          </div>
        )}
        <Field label="Code" hint="Short unique code, e.g. CPQ-ACME">
          {(p) => <input {...p} className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} />}
        </Field>
        <Field label="Client (optional)">{(p) => <input {...p} className="input" value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} />}</Field>
        <Field label="Project name" className="span-2">
          {(p) => <input {...p} className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <label className="checkbox span-2">
          <input type="checkbox" checked={form.phasesEnabled} onChange={(e) => setForm({ ...form, phasesEnabled: e.target.checked })} />
          This project uses phases
        </label>
        {form.phasesEnabled && (
          <Field label="Initial phases" className="span-2" hint="Comma-separated. You can add more later.">
            {(p) => <input {...p} className="input" value={form.phases} onChange={(e) => setForm({ ...form, phases: e.target.value })} />}
          </Field>
        )}
      </form>
    </Dialog>
  );
}

function PhaseDialog({
  phase,
  canClose,
  onClose,
  onSave,
}: {
  phase: AdminPhase | "new" | null;
  canClose: boolean;
  onClose: () => void;
  onSave: (data: { name: string; description: string | null; startDate: string | null; endDate: string | null; status: AdminPhase["status"] }) => Promise<void>;
}) {
  const existing = phase && phase !== "new" ? phase : null;
  const [form, setForm] = useState({ name: "", description: "", startDate: "", endDate: "", status: "PLANNED" as AdminPhase["status"] });
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const currentKey = phase === null ? null : existing?.id ?? "new";
  if (currentKey !== key) {
    setKey(currentKey);
    setForm({
      name: existing?.name ?? "",
      description: existing?.description ?? "",
      startDate: existing?.startDate ?? "",
      endDate: existing?.endDate ?? "",
      status: existing?.status ?? "PLANNED",
    });
  }
  return (
    <Dialog
      open={phase !== null}
      title={existing ? `Edit phase: ${existing.name}` : "Add phase"}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" form="phase-form" busy={busy} disabled={!form.name.trim()}>
            {existing ? "Save phase" : "Add phase"}
          </Button>
        </>
      }
    >
      <form
        id="phase-form"
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          await onSave({
            name: form.name.trim(),
            description: form.description.trim() || null,
            startDate: form.startDate || null,
            endDate: form.endDate || null,
            status: form.status,
          });
          setBusy(false);
        }}
      >
        <Field label="Phase name" className="span-2">
          {(p) => <input {...p} className="input" value={form.name} placeholder="e.g. Discovery" onChange={(e) => setForm({ ...form, name: e.target.value })} />}
        </Field>
        <Field label="What happens in this phase?" className="span-2">
          {(p) => (
            <textarea
              {...p}
              className="textarea"
              maxLength={1000}
              value={form.description}
              placeholder="e.g. Workshops with the client to agree scope, pricing rules and approvals."
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          )}
        </Field>
        <Field label="Start date">{(p) => <input {...p} className="input" type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />}</Field>
        <Field label="End date">
          {(p) => <input {...p} className="input" type="date" value={form.endDate} min={form.startDate || undefined} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />}
        </Field>
        <Field label="Status">
          {(p) => (
            <select
              {...p}
              className="select"
              value={form.status}
              disabled={form.status === "DONE" && !canClose}
              onChange={(e) => setForm({ ...form, status: e.target.value as AdminPhase["status"] })}
            >
              {(Object.keys(STATUS_TEXT) as AdminPhase["status"][]).map((s) => (
                <option key={s} value={s} disabled={s === "DONE" && !canClose}>
                  {STATUS_TEXT[s]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
