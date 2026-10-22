import { useRef, useState } from "react";
import { api } from "../api";
import { Alert, Button } from "./ui";

/**
 * "Rewrite professionally": asks the backend for a suggestion, shows original
 * and suggestion side by side, and changes the description only when the
 * employee clicks "Apply rewrite". Failures leave the original untouched.
 */
export function RewriteAssist({ text, onApply }: { text: string; onApply: (rewritten: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [suggestion, setSuggestion] = useState<{ original: string; rewritten: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  async function rewrite() {
    if (inFlight.current || !text.trim()) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setSuggestion(null);
    const original = text;
    try {
      const r = await api.post<{ rewrittenText: string }>("/timesheets/rewrite-description", { description: original });
      setSuggestion({ original, rewritten: r.rewrittenText });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  // A suggestion is only valid for the text it was made from.
  const stale = suggestion && suggestion.original !== text;

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <Button size="sm" variant="ghost" icon="sparkle" busy={busy} disabled={!text.trim()} onClick={rewrite}>
          {busy ? "Rewriting…" : "Rewrite professionally"}
        </Button>
        <span className="muted small">Fixes grammar and tone. You review before anything changes.</span>
      </div>
      <div aria-live="polite">
        {error && (
          <Alert tone="warning" title="Couldn't rewrite right now">
            {error} You can still save and submit as normal.
          </Alert>
        )}
        {suggestion && !stale && (
          <div className="rewrite-preview">
            <div className="rewrite-compare">
              <div>
                <span className="label">Original</span>
                {suggestion.original}
              </div>
              <div>
                <span className="label">Suggested</span>
                {suggestion.rewritten}
              </div>
            </div>
            <p className="small muted">Check that the suggestion keeps your facts, names and numbers exactly.</p>
            <div className="row">
              <Button
                size="sm"
                variant="primary"
                icon="check"
                onClick={() => {
                  onApply(suggestion.rewritten);
                  setSuggestion(null);
                }}
              >
                Apply rewrite
              </Button>
              <Button size="sm" onClick={() => setSuggestion(null)}>
                Keep original
              </Button>
            </div>
          </div>
        )}
        {stale && (
          <p className="small muted">
            You edited the description, so the suggestion was discarded.{" "}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSuggestion(null)}>
              Dismiss
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
