import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Icon } from "../components/Icon";
import { useAssistant } from "./AssistantContext";
import { canListen, listen, type Recognition } from "./voice";

/** Text box with dictation. For a spoken back-and-forth, use voice mode instead. */
export function Composer({
  placeholder,
  autoFocus,
  compact,
  onSend,
}: {
  placeholder: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Called just before a message is sent (typed or dictated). */
  onSend?: () => void;
}) {
  const inputId = useId();
  const { send, busy, voiceReplies, setVoiceReplies, startVoice } = useAssistant();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => () => rec.current?.abort(), []);

  async function submit(value: string) {
    const t = value.trim();
    if (!t || busy) return;
    setText("");
    onSend?.();
    await send(t, "chat");
  }

  function toggleMic() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    setVoiceError(null);
    rec.current = listen(
      (t, final) => {
        setText(t);
        if (final) void submit(t);
      },
      (err) => {
        setListening(false);
        rec.current = null;
        if (err === "blocked") setVoiceError("Microphone access was blocked.");
      },
    );
    setListening(!!rec.current);
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(text);
  };

  return (
    <form className={`composer ${compact ? "compact" : ""}`} onSubmit={onSubmit}>
      {voiceError && <p className="small" style={{ color: "var(--color-status-error)" }}>{voiceError}</p>}
      <div className={`composer-box ${listening ? "listening" : ""}`}>
        <label htmlFor={inputId} className="sr-only">
          Message the assistant
        </label>
        <textarea
          id={inputId}
          className="composer-input"
          rows={compact ? 2 : 1}
          value={text}
          placeholder={listening ? "Listening…" : placeholder}
          autoFocus={autoFocus}
          maxLength={4000}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit(text);
            }
          }}
        />
        <div className="composer-actions">
          {canListen() && (
            <button
              type="button"
              className={`btn btn-ghost btn-icon mic ${listening ? "on" : ""}`}
              aria-pressed={listening}
              aria-label={listening ? "Stop dictating" : "Dictate"}
              title={listening ? "Stop dictating" : "Dictate"}
              onClick={toggleMic}
              disabled={busy && !listening}
            >
              <Icon name="mic" size={18} />
            </button>
          )}
          <button type="submit" className="btn btn-primary btn-icon send" aria-label="Send" title="Send" disabled={busy || !text.trim()}>
            <Icon name="send" size={16} />
          </button>
        </div>
      </div>
      {!compact && (
        <div className="row composer-options">
          {canListen() && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startVoice()}>
              <Icon name="waves" size={16} />
              Switch to voice
            </button>
          )}
          <label className="checkbox small">
            <input type="checkbox" checked={voiceReplies} onChange={(e) => setVoiceReplies(e.target.checked)} />
            Read replies aloud
          </label>
        </div>
      )}
    </form>
  );
}
