import { useEffect, useState, type FormEvent } from "react";
import { api } from "../../api";
import { Alert, Button, Card, Field, Loading, PageHeader, useLoad, useToast } from "../../components/ui";

interface Policy {
  expectedDailyMinutes: number;
  workDays: string;
  maxPastDays: number;
  maxFutureDays: number;
  longEntryMinutes: number;
  autoReminders: boolean;
  reminderHour: number;
  autoVerify: boolean;
  autoVerifyMaxDailyMinutes: number;
  casualLeaveDays: number;
  sickLeaveDays: number;
  earnedLeaveDays: number;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function PolicyPage() {
  const toast = useToast();
  const { data, error } = useLoad(() => api.get<{ policy: Policy }>("/admin/policy").then((r) => r.policy), []);
  const [form, setForm] = useState<Policy | null>(null);
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => setForm(data), [data]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setSaveError(null);
    try {
      await api.patch("/admin/policy", form);
      toast("success", "Policy saved. Changes are recorded in the audit log.");
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const workDays = new Set(form?.workDays.split(",").map(Number) ?? []);
  const toggleDay = (d: number) => {
    if (!form) return;
    const next = new Set(workDays);
    if (next.has(d)) next.delete(d);
    else next.add(d);
    setForm({ ...form, workDays: [...next].sort().join(",") });
  };

  return (
    <div className="page">
      <PageHeader title="Policy" description="Expected hours and logging rules used for totals, missing-time warnings and validation." />
      {error && <Alert tone="error">{error}</Alert>}
      {!form ? (
        <Loading />
      ) : (
        <Card>
          <form className="form-grid" onSubmit={submit} style={{ maxWidth: 640 }}>
            {saveError && (
              <div className="span-2">
                <Alert tone="error">{saveError}</Alert>
              </div>
            )}
            <Field label="Expected hours per working day">
              {(p) => (
                <input
                  {...p}
                  className="input num"
                  type="number"
                  min={0}
                  max={24}
                  step={0.25}
                  value={form.expectedDailyMinutes / 60}
                  onChange={(e) => setForm({ ...form, expectedDailyMinutes: Math.round(Number(e.target.value) * 60) })}
                />
              )}
            </Field>
            <Field label="Flag entries longer than (hours)" hint="Shown to employees as a warning before submission.">
              {(p) => (
                <input
                  {...p}
                  className="input num"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  value={form.longEntryMinutes / 60}
                  onChange={(e) => setForm({ ...form, longEntryMinutes: Math.round(Number(e.target.value) * 60) })}
                />
              )}
            </Field>
            <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>
                Working days
              </legend>
              <div className="row">
                {DAYS.map((d, i) => (
                  <button key={d} type="button" className="chip" aria-pressed={workDays.has(i + 1)} onClick={() => toggleDay(i + 1)}>
                    {d}
                  </button>
                ))}
              </div>
            </fieldset>
            <Field label="Days back employees may log" hint="Older corrections go through an admin.">
              {(p) => <input {...p} className="input num" type="number" min={0} max={366} value={form.maxPastDays} onChange={(e) => setForm({ ...form, maxPastDays: Number(e.target.value) })} />}
            </Field>
            <Field label="Days ahead employees may log" hint="0 blocks future dates.">
              {(p) => <input {...p} className="input num" type="number" min={0} max={31} value={form.maxFutureDays} onChange={(e) => setForm({ ...form, maxFutureDays: Number(e.target.value) })} />}
            </Field>
            <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>
                Automatic verification
              </legend>
              <label className="checkbox">
                <input type="checkbox" checked={form.autoVerify} onChange={(e) => setForm({ ...form, autoVerify: e.target.checked })} />
                Verify routine time automatically when it's submitted
              </label>
              <p className="small muted" style={{ marginTop: 4 }}>
                Routine means: first submission (not a correction), has a description, no duplicate or unusually long entry, within the last 14 days, and the
                day's total is within the limit below. Everything else goes to the person's verifier.
              </p>
            </fieldset>
            <Field label="Auto-verify days up to (hours)">
              {(p) => (
                <input
                  {...p}
                  className="input num"
                  type="number"
                  min={1}
                  max={24}
                  step={0.5}
                  disabled={!form.autoVerify}
                  value={form.autoVerifyMaxDailyMinutes / 60}
                  onChange={(e) => setForm({ ...form, autoVerifyMaxDailyMinutes: Math.round(Number(e.target.value) * 60) })}
                />
              )}
            </Field>
            <div />
            <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>
                Automatic reminders
              </legend>
              <label className="checkbox">
                <input type="checkbox" checked={form.autoReminders} onChange={(e) => setForm({ ...form, autoReminders: e.target.checked })} />
                Remind people about missing time (with an AI check-in) and verifiers about waiting time
              </label>
              <p className="small muted" style={{ marginTop: 4 }}>
                Each reminder is sent at most once per person per day or week: missing hours after the hour below on working days, last week's
                submission on Monday mornings, and approvals waiting over two days.
              </p>
            </fieldset>
            <Field label="Daily reminder time (hour, 0–23)">
              {(p) => (
                <input
                  {...p}
                  className="input num"
                  type="number"
                  min={0}
                  max={23}
                  disabled={!form.autoReminders}
                  value={form.reminderHour}
                  onChange={(e) => setForm({ ...form, reminderHour: Number(e.target.value) })}
                />
              )}
            </Field>
            <fieldset className="span-2" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="field-label" style={{ marginBottom: 6 }}>
                Leave allowance per person per year (working days)
              </legend>
              <div className="form-grid three">
                {(
                  [
                    ["casualLeaveDays", "Casual leave"],
                    ["sickLeaveDays", "Sick leave"],
                    ["earnedLeaveDays", "Earned leave"],
                  ] as const
                ).map(([key, label]) => (
                  <Field key={key} label={label}>
                    {(p) => (
                      <input
                        {...p}
                        className="input num"
                        type="number"
                        min={0}
                        max={366}
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: Math.max(0, Math.round(Number(e.target.value))) })}
                      />
                    )}
                  </Field>
                ))}
              </div>
              <p className="small muted" style={{ marginTop: 4 }}>
                Unpaid leave has no limit. Holidays are managed on the Leave page.
              </p>
            </fieldset>
            <div className="span-2">
              <Button type="submit" variant="primary" busy={busy} disabled={!form.workDays}>
                Save policy
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
