import { api, type Entry, type LoggableProject } from "../api";
import { addDaysIso, todayIso, weekStartIso } from "../format";
import { EntryForm, type Prefill, type Recent } from "./EntryForm";
import { Dialog, Loading, useLoad } from "./ui";

/** Add or edit one entry in a dialog. */
export function EntryDialog({
  entry,
  prefill,
  suggestStart,
  defaultDate,
  onClose,
  onSaved,
}: {
  entry: Entry | "new" | null;
  prefill: Prefill | null;
  suggestStart: (date: string) => string | null;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const setup = useLoad(
    () =>
      entry
        ? Promise.all([api.get<{ projects: LoggableProject[] }>("/projects"), api.get<{ recent: Recent[] }>("/entries/recent")]).then(([p, r]) => ({ projects: p.projects, recent: r.recent }))
        : Promise.resolve(null),
    [entry === null],
  );
  return (
    <Dialog open={entry !== null} title={entry === "new" ? "Add time" : "Edit entry"} onClose={onClose}>
      {!setup.data ? (
        <Loading />
      ) : (
        <EntryForm
          projects={setup.data.projects}
          recent={setup.data.recent}
          date={defaultDate}
          maxDate={addDaysIso(weekStartIso(todayIso()), 6)}
          editing={entry === "new" ? null : entry}
          prefill={entry === "new" ? prefill : null}
          suggestStart={suggestStart}
          onSaved={onSaved}
          onCancelEdit={onClose}
          onDirtyChange={() => undefined}
        />
      )}
    </Dialog>
  );
}
