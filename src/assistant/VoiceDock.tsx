import { useCallback, useEffect, useRef, useState } from "react";
import { useUser } from "../auth";
import { Icon } from "../components/Icon";
import { useAssistant } from "./AssistantContext";
import { ActionCard } from "./Transcript";
import { availableVoices, canListen, canSpeak, chosenVoice, forSpeech, listen, setVoiceName, type Recognition } from "./voice";

type Phase = "listening" | "thinking" | "speaking" | "paused";

const YES = /^(yes|yeah|yep|yup|sure|ok|okay|go ahead|do it|approve|approved|confirm|please do|sounds good|that's right|correct)\b/i;
const NO = /^(no|nope|cancel|don't|do not|decline|stop|never ?mind|not now)\b/i;

/**
 * Hands-free voice conversation docked at the bottom of the screen, so the
 * page stays visible while the assistant talks and navigates. It listens,
 * sends what you said, speaks the reply as it streams, then listens again.
 */
export function VoiceDock() {
  const user = useUser();
  const { voiceActive, stopVoice, setOpen, send, decide, busy, live, ui, error, speaker } = useAssistant();
  const [phase, setPhase] = useState<Phase>("paused");
  const [heard, setHeard] = useState("");
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [showVoices, setShowVoices] = useState(false);
  const [voiceName, setVoice] = useState(() => chosenVoice()?.name ?? "");
  const rec = useRef<Recognition | null>(null);
  const misses = useRef(0);
  const activeRef = useRef(false);
  activeRef.current = voiceActive;
  const orb = useRef<HTMLButtonElement>(null);
  const pending = ui.filter((u) => u.action?.status === "pending");
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const startListening = useCallback(() => {
    if (!activeRef.current || rec.current) return;
    setHeard("");
    setVoiceError(null);
    setPhase("listening");
    rec.current = listen(
      (text, final) => {
        setHeard(text);
        if (final) void handle(text);
      },
      (err) => {
        rec.current = null;
        if (!err) return;
        if (err === "blocked") {
          setVoiceError("Microphone access is blocked. Allow it in the browser's address bar, then tap the orb.");
          setPhase("paused");
          return;
        }
        // Nothing said: try once more, then wait for a tap.
        misses.current += 1;
        if (misses.current < 2 && activeRef.current) startListening();
        else setPhase("paused");
      },
    );
    if (!rec.current) {
      setVoiceError("Voice input isn't supported in this browser. Try Chrome or Edge, or type instead.");
      setPhase("paused");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** After a reply: wait until speech finishes, then listen again. */
  const afterReply = useCallback(() => {
    if (!activeRef.current) return;
    if (speaker.busy) {
      speaker.onIdle = () => {
        speaker.onIdle = null;
        startListening();
      };
    } else startListening();
  }, [speaker, startListening]);

  async function handle(text: string) {
    misses.current = 0;
    setPhase("thinking");
    const waiting = pendingRef.current;
    const short = text.trim().split(/\s+/).length <= 6;
    if (waiting.length && short && YES.test(text.trim())) {
      await decide(Object.fromEntries(waiting.map((w) => [w.action!.toolUseId, "approve"])), "voice");
    } else if (waiting.length && short && NO.test(text.trim())) {
      await decide(Object.fromEntries(waiting.map((w) => [w.action!.toolUseId, "decline"])), "voice");
    } else {
      await send(text, "voice");
    }
    afterReply();
  }

  // Start listening when voice mode opens; tidy up when it closes.
  useEffect(() => {
    if (voiceActive) {
      misses.current = 0;
      speaker.onStart = () => setPhase("speaking");
      if (!busy) startListening();
      else afterReply();
    } else {
      rec.current?.abort();
      rec.current = null;
      setPhase("paused");
    }
    return () => {
      speaker.onStart = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceActive]);

  // A reply started elsewhere (e.g. the briefing or a resumed view) also returns to listening.
  useEffect(() => {
    if (!voiceActive) return;
    if (busy) {
      rec.current?.abort();
      rec.current = null;
      setPhase((p) => (p === "speaking" ? p : "thinking"));
    } else if (!rec.current && phase === "thinking") {
      afterReply();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Microphone level drives the orb while listening.
  useEffect(() => {
    if (!voiceActive || phase !== "listening" || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let raf = 0;
    let stopped = false;
    navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      .then((s) => {
        if (stopped) return s.getTracks().forEach((t) => t.stop());
        stream = s;
        ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        ctx.createMediaStreamSource(s).connect(analyser);
        const data = new Uint8Array(analyser.fftSize);
        const tick = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (const v of data) sum += ((v - 128) / 128) ** 2;
          const level = Math.min(1, Math.sqrt(sum / data.length) * 6);
          orb.current?.style.setProperty("--level", level.toFixed(3));
          raf = requestAnimationFrame(tick);
        };
        tick();
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      orb.current?.style.setProperty("--level", "0");
    };
  }, [voiceActive, phase]);

  if (!voiceActive) return null;

  function tapOrb() {
    if (phase === "speaking") {
      speaker.stop();
      startListening();
    } else if (phase === "listening") {
      rec.current?.stop();
    } else if (phase === "paused") {
      misses.current = 0;
      startListening();
    }
  }

  const label = {
    listening: "Listening…",
    thinking: "Thinking…",
    speaking: "Speaking · tap to interrupt",
    paused: "Tap the orb to talk",
  }[phase];
  const reply = live || [...ui].reverse().find((u) => u.role === "assistant")?.text || "";
  const caption = phase === "listening" || (phase === "thinking" && !live) ? heard : forSpeech(reply);
  const voices = showVoices ? availableVoices() : [];

  return (
    <div className="voice-layer" role="region" aria-label="Voice conversation with RNXA">
      {pending.length > 0 && (
        <div className="voice-actions">
          {pending.map((p) => (
            <ActionCard key={p.id} item={p} />
          ))}
          <p className="small muted voice-hint">Say “yes” to approve{pending.length > 1 ? " all" : ""}, or “no” to skip.</p>
        </div>
      )}
      <div className={`voice-dock ${phase}`}>
        <button
          ref={orb}
          type="button"
          className={`orb ${phase}`}
          onClick={tapOrb}
          aria-label={phase === "speaking" ? "Interrupt and talk" : phase === "listening" ? "Stop listening" : "Start talking"}
        >
          <span className="orb-core" />
          <span className="orb-ring" />
        </button>
        <div className="voice-text" aria-live="polite">
          <span className="voice-state">
            {label}
            {user.impersonator && <span className="voice-viewing"> · viewing as {user.name}</span>}
          </span>
          <p className={`voice-caption ${caption ? "" : "empty"}`}>{voiceError ?? error ?? (caption ? caption.slice(-220) : phase === "listening" ? "Go ahead, I'm listening." : "")}</p>
        </div>
        <div className="voice-controls">
          {canSpeak() && (
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Choose voice" title="Choose voice" aria-expanded={showVoices} onClick={() => setShowVoices((s) => !s)}>
              <Icon name="settings" />
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Type instead"
            title="Type instead"
            onClick={() => {
              stopVoice();
              setOpen(true);
            }}
          >
            <Icon name="keyboard" />
          </button>
          <button type="button" className="btn btn-ghost btn-icon end" aria-label="End voice conversation" title="End" onClick={stopVoice}>
            <Icon name="x" />
          </button>
        </div>
        {showVoices && (
          <div className="voice-picker">
            <label className="field-label" htmlFor="voice-select">
              Assistant voice
            </label>
            <select
              id="voice-select"
              className="select select-sm"
              value={voiceName}
              onChange={(e) => {
                setVoice(e.target.value);
                setVoiceName(e.target.value);
              }}
            >
              {voices.map((v) => (
                <option key={v.name} value={v.name}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
            <p className="small muted">Edge's "Natural" voices and Chrome's Google voices sound the most human.</p>
          </div>
        )}
      </div>
      {!canListen() && <p className="small voice-hint">Voice input needs Chrome, Edge or Safari.</p>}
    </div>
  );
}
