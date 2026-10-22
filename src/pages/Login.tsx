import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { Wordmark } from "../components/AppShell";
import { Alert, Button, Field } from "../components/ui";

export function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-brand">
        <Wordmark product={false} />
        <div>
          <h1>Time records your teams can rely on.</h1>
          <p>Log project and phase time in seconds, review it in context, and keep every approval traceable.</p>
        </div>
        <p className="small">© RNXA Digital</p>
      </section>
      <section className="login-form">
        <form onSubmit={submit} className="stack" noValidate>
          <div>
            <h2 style={{ fontSize: "1.375rem" }}>Sign in to Timesheet</h2>
            <p className="muted" style={{ marginTop: 4 }}>
              Use your RNXA work account.
            </p>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Work email">
            {(p) => <input {...p} className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />}
          </Field>
          <Field label="Password">
            {(p) => (
              <input {...p} className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            )}
          </Field>
          <Button type="submit" variant="primary" busy={busy} disabled={!email || !password}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </section>
    </div>
  );
}
