import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, postStream } from "../api";
import { useAuth, useUser } from "../auth";
import { Speaker } from "./voice";

export interface UiItem {
  id: string;
  role: "user" | "assistant" | "action" | "notice";
  text?: string;
  action?: {
    toolUseId: string;
    name: string;
    summary: string;
    details?: string[];
    status: "pending" | "approved" | "declined" | "failed";
    result?: string;
  };
  at: string;
}

type Effect = { type: "navigate"; path: string; label: string } | { type: "impersonate"; userId: string; name: string } | { type: "stop_impersonation" };

interface TurnResult {
  conversationId: string | null;
  ui: UiItem[];
  hasPending: boolean;
  effects?: Effect[];
  secrets?: { label: string; value: string }[];
}

type Mode = "voice" | "chat";

interface AssistantState {
  /** Chat panel. */
  open: boolean;
  setOpen: (open: boolean) => void;
  /** Hands-free voice conversation. */
  voiceActive: boolean;
  /** Starts voice mode; with a prompt, the assistant speaks first (e.g. the end-of-day check-in). */
  startVoice: (prompt?: string) => void;
  stopVoice: () => void;
  ui: UiItem[];
  busy: boolean;
  /** The reply as it streams in. */
  live: string;
  error: string | null;
  secrets: { label: string; value: string }[];
  dismissSecrets: () => void;
  voiceReplies: boolean;
  setVoiceReplies: (on: boolean) => void;
  send: (text: string, mode?: Mode) => Promise<void>;
  decide: (decisions: Record<string, "approve" | "decline">, mode?: Mode) => Promise<void>;
  newChat: () => Promise<void>;
  speaker: Speaker;
  /** Bumped after the assistant changes data, so pages reload. */
  dataVersion: number;
}

const Ctx = createContext<AssistantState | null>(null);

const RESUME_KEY = "rnxa.assistantResume";

function pref(key: string, fallback: boolean) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}
function store(key: string, value: string | null, session = false) {
  try {
    const s = session ? sessionStorage : localStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    // Storage is a convenience only.
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const user = useUser();
  const { impersonate, stopImpersonating } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const speaker = useMemo(() => new Speaker(), []);

  const [open, setOpenState] = useState(false);
  const [voiceActive, setVoiceActive] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [ui, setUi] = useState<UiItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [secrets, setSecrets] = useState<{ label: string; value: string }[]>([]);
  const [voiceReplies, setVoiceState] = useState(() => pref(`rnxa.voice.${user.id}`, false));
  const [dataVersion, setDataVersion] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const busyRef = useRef(false);
  const convoRef = useRef<string | null>(null);
  convoRef.current = conversationId;
  const pageRef = useRef("");
  pageRef.current = location.pathname + location.search;
  const voiceRef = useRef(false);
  voiceRef.current = voiceActive;

  useEffect(() => {
    api
      .get<TurnResult>("/assistant/conversation")
      .then((r) => {
        setConversationId(r.conversationId);
        setUi(r.ui);
      })
      .catch(() => undefined)
      .finally(() => setLoaded(true));
    return () => speaker.stop();
  }, [speaker]);

  /** Runs screen effects: navigation happens immediately; switching views waits for speech to finish. */
  const runEffect = useCallback(
    async (e: Effect, final: boolean) => {
      if (e.type === "navigate") {
        if (!final) navigate(e.path);
        return;
      }
      if (!final) return;
      const resume = JSON.stringify({
        voice: voiceRef.current,
        prompt: e.type === "impersonate" ? "I've just switched to this view. Give me a quick overview of this dashboard and anything that needs attention." : "I'm back in my own view. Anything that needs my attention?",
      });
      await new Promise<void>((resolve) => {
        if (!speaker.busy) return resolve();
        const timer = setTimeout(resolve, 8000);
        speaker.onIdle = () => {
          clearTimeout(timer);
          resolve();
        };
      });
      store(RESUME_KEY, resume, true);
      try {
        if (e.type === "impersonate") await impersonate(e.userId);
        else await stopImpersonating();
        navigate("/");
      } catch (err) {
        store(RESUME_KEY, null, true);
        setError((err as Error).message);
      }
    },
    [navigate, impersonate, stopImpersonating, speaker],
  );

  const run = useCallback(
    async (path: string, body: unknown, mode: Mode, optimistic?: (items: UiItem[]) => UiItem[]) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setLive("");
      const speak = mode === "voice" || voiceReplies;
      if (speak) speaker.begin();
      else speaker.stop();
      if (optimistic) setUi(optimistic);
      try {
        const result = await postStream<TurnResult>(path, body, (ev) => {
          if (ev.type === "text") {
            const delta = String(ev.delta);
            setLive((l) => l + delta);
            if (speak) speaker.feed(delta);
          } else if (ev.type === "step") {
            setLive((l) => (l ? `${l}\n\n` : l));
            if (speak) speaker.feed("\n");
          } else if (ev.type === "effect") {
            void runEffect(ev.effect as Effect, false);
          }
        });
        setConversationId(result.conversationId);
        setUi(result.ui);
        if (result.secrets?.length) setSecrets((s) => [...s, ...result.secrets!]);
        if (result.ui.some((u) => u.action?.status === "approved")) setDataVersion((v) => v + 1);
        if (speak) {
          const asks = result.ui.filter((u) => u.action?.status === "pending").length;
          if (asks && mode !== "voice") speaker.feed(` ${asks === 1 ? "There's one action" : `There are ${asks} actions`} waiting for your approval.`);
          speaker.end();
        }
        for (const e of result.effects ?? []) void runEffect(e, true);
      } catch (e) {
        speaker.stop();
        setError((e as Error).message);
        setUi((items) => items.filter((x) => !x.id.startsWith("local-")));
      } finally {
        setLive("");
        busyRef.current = false;
        setBusy(false);
      }
    },
    [voiceReplies, speaker, runEffect],
  );

  const send = useCallback(
    async (text: string, mode?: Mode) => {
      const t = text.trim();
      if (!t) return;
      const m = mode ?? (voiceRef.current ? "voice" : "chat");
      await run("/assistant/message", { conversationId: convoRef.current, text: t, mode: m, page: pageRef.current }, m, (items) => [
        ...items,
        { id: `local-${Date.now()}`, role: "user", text: t, at: new Date().toISOString() },
      ]);
    },
    [run],
  );

  const decide = useCallback(
    async (decisions: Record<string, "approve" | "decline">, mode?: Mode) => {
      if (!convoRef.current) return;
      const m = mode ?? (voiceRef.current ? "voice" : "chat");
      await run(`/assistant/${convoRef.current}/decide`, { decisions, mode: m }, m, (items) =>
        items.map((u) =>
          u.action && decisions[u.action.toolUseId] && u.action.status === "pending"
            ? { ...u, action: { ...u.action, status: decisions[u.action.toolUseId] === "approve" ? "approved" : "declined", result: "Working…" } }
            : u,
        ),
      );
      setDataVersion((v) => v + 1);
    },
    [run],
  );

  const newChat = useCallback(async () => {
    speaker.stop();
    if (convoRef.current) await api.delete(`/assistant/${convoRef.current}`).catch(() => undefined);
    setConversationId(null);
    setUi([]);
    setError(null);
  }, [speaker]);

  const setOpen = useCallback(
    (next: boolean) => {
      setOpenState(next);
      if (!next && !voiceRef.current) speaker.stop();
    },
    [speaker],
  );

  const startVoice = useCallback(
    (prompt?: string) => {
      setOpenState(false);
      setVoiceActive(true);
      if (prompt) {
        // This replaces today's automatic briefing.
        store(`rnxa.briefed.${user.id}.${user.impersonator?.id ?? ""}`, new Date().toDateString());
        void send(prompt, "voice");
      }
    },
    [send, user.id, user.impersonator?.id],
  );

  const stopVoice = useCallback(() => {
    speaker.stop();
    setVoiceActive(false);
  }, [speaker]);

  const setVoiceReplies = useCallback(
    (on: boolean) => {
      setVoiceState(on);
      store(`rnxa.voice.${user.id}`, on ? "1" : "0");
      if (!on) speaker.stop();
    },
    [user.id, speaker],
  );

  // After the assistant switches views the provider remounts; carry on where it left off.
  useEffect(() => {
    if (!loaded) return;
    let resume: { voice: boolean; prompt: string } | null = null;
    try {
      resume = JSON.parse(sessionStorage.getItem(RESUME_KEY) ?? "null");
    } catch {
      resume = null;
    }
    if (!resume) return;
    store(RESUME_KEY, null, true);
    if (resume.voice) setVoiceActive(true);
    else setOpenState(true);
    void send(resume.prompt, resume.voice ? "voice" : "chat");
  }, [loaded, send]);

  // Proactive briefing the first time the assistant is opened each day.
  useEffect(() => {
    if (!(open || voiceActive) || !loaded || busyRef.current || ui.length) return;
    const key = `rnxa.briefed.${user.id}.${user.impersonator?.id ?? ""}`;
    const day = new Date().toDateString();
    let last: string | null;
    try {
      last = localStorage.getItem(key);
    } catch {
      last = day;
    }
    if (last === day) return;
    store(key, day);
    void send("Give me my briefing: what needs my attention today?");
  }, [open, voiceActive, loaded, ui.length, send, user.id, user.impersonator?.id]);

  return (
    <Ctx.Provider
      value={{
        open,
        setOpen,
        voiceActive,
        startVoice,
        stopVoice,
        ui,
        busy,
        live,
        error,
        secrets,
        dismissSecrets: () => setSecrets([]),
        voiceReplies,
        setVoiceReplies,
        send,
        decide,
        newChat,
        speaker,
        dataVersion,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAssistant() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssistant outside AssistantProvider");
  return ctx;
}
