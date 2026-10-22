import { useState } from "react";
import { Icon } from "../components/Icon";
import { Button } from "../components/ui";
import { useAssistant, type UiItem } from "./AssistantContext";
import { Markdown } from "./Markdown";

const STATUS_TEXT = { pending: "Needs your approval", approved: "Done", declined: "Not run", failed: "Failed" } as const;
const STATUS_TONE = { pending: "info", approved: "success", declined: "neutral", failed: "error" } as const;

export function ActionCard({ item }: { item: UiItem }) {
  const { decide, busy } = useAssistant();
  const a = item.action!;
  return (
    <div className={`action-card ${a.status}`} role="group" aria-label={`Proposed action: ${a.summary}`}>
      <div className="row" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
        <Icon name={a.status === "approved" ? "checkCircle" : a.status === "failed" ? "xCircle" : a.status === "declined" ? "x" : "sparkle"} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <strong>{a.summary}</strong>
          {a.details?.map((d, i) => (
            <p key={i} className="small action-detail">
              {d}
            </p>
          ))}
          {a.result && a.status !== "pending" && <p className="small muted">{a.result}</p>}
        </div>
        <span className={`badge tone-${STATUS_TONE[a.status]}`}>{STATUS_TEXT[a.status]}</span>
      </div>
      {a.status === "pending" && (
        <div className="row" style={{ marginTop: 10 }}>
          <Button size="sm" variant="primary" icon="check" disabled={busy} onClick={() => decide({ [a.toolUseId]: "approve" })}>
            Approve
          </Button>
          <Button size="sm" disabled={busy} onClick={() => decide({ [a.toolUseId]: "decline" })}>
            Decline
          </Button>
        </div>
      )}
    </div>
  );
}

/** Approve/decline everything at once when several actions are waiting. */
export function BulkDecision({ items }: { items: UiItem[] }) {
  const { decide, busy } = useAssistant();
  const pending = items.filter((i) => i.action?.status === "pending");
  if (pending.length < 2) return null;
  const all = (choice: "approve" | "decline") => decide(Object.fromEntries(pending.map((p) => [p.action!.toolUseId, choice])));
  return (
    <div className="row bulk-decision">
      <span className="small muted">{pending.length} actions waiting</span>
      <span className="spacer" />
      <Button size="sm" variant="primary" disabled={busy} onClick={() => all("approve")}>
        Approve all
      </Button>
      <Button size="sm" disabled={busy} onClick={() => all("decline")}>
        Decline all
      </Button>
    </div>
  );
}

export function TranscriptItem({ item }: { item: UiItem }) {
  if (item.role === "user") return <div className="bubble user">{item.text}</div>;
  if (item.role === "assistant") {
    return (
      <div className="bubble assistant">
        <Markdown text={item.text ?? ""} />
      </div>
    );
  }
  if (item.role === "action") return <ActionCard item={item} />;
  return <div className="notice small">{item.text}</div>;
}

export function Secrets() {
  const { secrets, dismissSecrets } = useAssistant();
  const [copied, setCopied] = useState<string | null>(null);
  if (!secrets.length) return null;
  return (
    <div className="alert tone-warning" role="status">
      <Icon name="alert" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <strong>Copy now: shown only once</strong>
        {secrets.map((s) => (
          <div key={s.label} className="row" style={{ marginTop: 6 }}>
            <span className="small">{s.label}:</span>
            <code className="secret">{s.value}</code>
            <Button
              size="sm"
              variant="ghost"
              icon="copy"
              onClick={() => {
                void navigator.clipboard?.writeText(s.value);
                setCopied(s.label);
              }}
            >
              {copied === s.label ? "Copied" : "Copy"}
            </Button>
          </div>
        ))}
        <p className="small" style={{ marginTop: 6 }}>
          Share it with the person securely. They should change it after signing in.
        </p>
      </div>
      <Button size="sm" variant="ghost" onClick={dismissSecrets}>
        Done
      </Button>
    </div>
  );
}

export function Thinking() {
  return (
    <div className="bubble assistant thinking" role="status" aria-live="polite">
      <span className="dots" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="sr-only">Assistant is working</span>
      <span className="small muted">Checking live data…</span>
    </div>
  );
}
