import { useEffect, useRef } from "react";
import { useUser } from "../auth";
import { Icon } from "../components/Icon";
import { Alert, IconButton } from "../components/ui";
import { useAssistant } from "./AssistantContext";
import { Composer } from "./Composer";
import { Markdown } from "./Markdown";
import { BulkDecision, Secrets, Thinking, TranscriptItem } from "./Transcript";
import { canListen } from "./voice";

const SUGGESTIONS = {
  EMPLOYEE: ["Log 2 hours today: fixed the quote template bug", "Repeat last week", "How am I doing this week?", "Submit my week"],
  MANAGER: ["Who hasn't logged time this week? Remind them", "What's waiting for me to verify?", "Show hours by project this month"],
  ADMIN: [
    "Who is missing time this week? Offer to remind them",
    "Show hours by project and phase for the last 30 days",
    "Create a project ACME-CPQ for Acme Corp with phases Discovery, Build, UAT",
    "Add Priya Nair (priya@rnxadigital.com) as an employee verified by me",
  ],
} as const;

export function AssistantLauncher() {
  const { open, setOpen, ui, voiceActive, startVoice } = useAssistant();
  const pending = ui.filter((u) => u.action?.status === "pending").length;
  if (open || voiceActive) return null;
  return (
    <div className="launcher-group">
      <button type="button" className="launcher-chat" onClick={() => setOpen(true)} aria-label={`Open chat${pending ? `, ${pending} waiting for approval` : ""}`} title="Chat">
        <Icon name="sparkle" size={18} />
        {pending > 0 && <span className="count">{pending}</span>}
      </button>
      {canListen() && (
        <button type="button" className="assistant-launcher" onClick={() => startVoice()} aria-label="Talk to RNXA">
          <span className="launcher-orb" aria-hidden="true" />
          <span>Talk to RNXA</span>
        </button>
      )}
    </div>
  );
}

export function AssistantPanel() {
  const user = useUser();
  const { open, setOpen, ui, busy, live, error, newChat, startVoice } = useAssistant();
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [ui.length, busy, open, live]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  if (!open) return null;
  return (
    <aside className="assistant-panel" aria-label="RNXA assistant">
      <header className="assistant-header">
        <span className="assistant-mark" aria-hidden="true">
          <Icon name="sparkle" size={16} />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>RNXA Assistant</h2>
          <p className="small muted">Live data · actions need your approval</p>
        </div>
        {canListen() && <IconButton icon="waves" label="Switch to voice" onClick={() => startVoice()} />}
        <IconButton icon="plus" label="New conversation" onClick={() => void newChat()} disabled={busy} />
        <IconButton icon="x" label="Close assistant" onClick={() => setOpen(false)} />
      </header>
      <div className="assistant-body" ref={scroller} aria-busy={busy}>
        {ui.length === 0 && !busy && (
          <div className="assistant-empty">
            <p>
              Hi {user.name.split(" ")[0]}. Ask me anything about your timesheets, or tell me what to do. For a spoken conversation, switch to voice.
            </p>
            <SuggestionList items={SUGGESTIONS[user.role]} />
          </div>
        )}
        {ui.map((item) => (
          <TranscriptItem key={item.id} item={item} />
        ))}
        <BulkDecision items={ui} />
        {busy &&
          (live ? (
            <div className="bubble assistant">
              <Markdown text={live} />
            </div>
          ) : (
            <Thinking />
          ))}
        {error && <Alert tone="error">{error}</Alert>}
        <Secrets />
      </div>
      <footer className="assistant-footer">
        <Composer placeholder="Ask, or tell me what to do…" autoFocus />
      </footer>
    </aside>
  );
}

export function SuggestionList({ items }: { items: readonly string[] }) {
  const { send, busy } = useAssistant();
  return (
    <div className="suggestions">
      {items.map((s) => (
        <button key={s} type="button" className="chip" disabled={busy} onClick={() => void send(s)}>
          <span>{s}</span>
        </button>
      ))}
    </div>
  );
}
