import { useState, type ReactNode } from "react";
import { Icon } from "../components/Icon";
import { Alert } from "../components/ui";
import { useAssistant, type UiItem } from "./AssistantContext";
import { Composer } from "./Composer";
import { BulkDecision, Thinking, TranscriptItem } from "./Transcript";

/**
 * "Tell the assistant what you did": the employee writes or says what they
 * worked on in their own words; the assistant turns it into professional draft
 * entries that they approve right here.
 */
export function QuickLog({
  title = "Log time with AI",
  hint = "Type or say what you worked on, in your own words. The assistant writes it up professionally as draft entries for you to approve.",
  placeholder = "e.g. 3h on Acme build today fixing the bundle discount rule, 1h client call on the service desk pilot",
  children,
}: {
  title?: string;
  hint?: string;
  placeholder?: string;
  /** Extra actions shown under the box (e.g. "Repeat last week"). */
  children?: ReactNode;
}) {
  const { ui, busy, live, error, setOpen } = useAssistant();
  const [from, setFrom] = useState<number | null>(null);
  const recent: UiItem[] = from === null ? [] : ui.slice(from);

  return (
    <section className="card quicklog" aria-labelledby="quicklog-title" aria-busy={busy}>
      <div className="quicklog-head">
        <span className="assistant-mark" aria-hidden="true">
          <Icon name="sparkle" size={16} />
        </span>
        <div style={{ flex: 1 }}>
          <h2 id="quicklog-title">{title}</h2>
          <p className="small muted">{hint}</p>
        </div>
        {recent.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
            Open chat
          </button>
        )}
      </div>
      <Composer
        compact
        onSend={() => setFrom(ui.length)}
        placeholder={placeholder}
      />
      {children}
      {(recent.length > 0 || busy) && (
        <div className="quicklog-results">
          {recent.map((item) => (
            <TranscriptItem key={item.id} item={item} />
          ))}
          <BulkDecision items={recent} />
          {busy && from !== null && (live ? <div className="bubble assistant">{live}</div> : <Thinking />)}
        </div>
      )}
      {error && from !== null && <Alert tone="error">{error}</Alert>}
    </section>
  );
}
