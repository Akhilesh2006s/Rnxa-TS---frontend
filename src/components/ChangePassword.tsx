import { useState, type FormEvent } from "react";
import { api } from "../api";
import { Alert, Button, Dialog, Field, useToast } from "./ui";

/** Lets the signed-in person change their own password. */
export function ChangePasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "", confirm: "" });
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = form.confirm.length > 0 && form.next !== form.confirm;
  const tooShort = form.next.length > 0 && form.next.length < 10;
  const ready = form.current && form.next.length >= 10 && form.next === form.confirm;

  function close() {
    setForm({ current: "", next: "", confirm: "" });
    setError(null);
    setShow(false);
    onClose();
  }

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      await api.post("/auth/password", { currentPassword: form.current, newPassword: form.next });
      toast("success", "Password changed. Use the new one next time you sign in.");
      close();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const type = show ? "text" : "password";
  return (
    <Dialog
      open={open}
      title="Change password"
      onClose={close}
      footer={
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" busy={busy} disabled={!ready} onClick={() => submit()}>
            Change password
          </Button>
        </>
      }
    >
      <form className="stack" onSubmit={submit}>
        <Field label="Current password">
          {(p) => <input {...p} className="input" type={type} autoComplete="current-password" value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />}
        </Field>
        <Field label="New password" hint="At least 10 characters." error={tooShort ? "Use at least 10 characters." : undefined}>
          {(p) => <input {...p} className="input" type={type} autoComplete="new-password" value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />}
        </Field>
        <Field label="Confirm new password" error={mismatch ? "The passwords don't match." : undefined}>
          {(p) => <input {...p} className="input" type={type} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />}
        </Field>
        <label className="checkbox">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
          Show passwords
        </label>
        {error && <Alert tone="error">{error}</Alert>}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
