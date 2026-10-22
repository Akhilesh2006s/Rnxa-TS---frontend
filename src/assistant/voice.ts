// Browser speech: recognition (Web Speech API, Chrome/Edge/Safari) and
// synthesis. Audio is handled by the browser; nothing extra is sent to RNXA.

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
export interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => ctor() !== null;
export const canSpeak = () => typeof window !== "undefined" && "speechSynthesis" in window;

export type ListenError = "blocked" | "no-speech" | "other";

/**
 * Listens for one utterance. onText gets interim and final text; onDone fires
 * once when it stops. The browser's own end-of-speech detection waits a long
 * time, so we stop ourselves after a short pause (`pauseMs`) once something
 * has been said.
 */
export function listen(onText: (text: string, final: boolean) => void, onDone: (error?: ListenError) => void, pauseMs = 700): Recognition | null {
  const C = ctor();
  if (!C) return null;
  const rec = new C();
  rec.lang = navigator.language || "en-US";
  rec.interimResults = true;
  rec.continuous = true;
  let finalText = "";
  let interimText = "";
  let error: ListenError | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  rec.onresult = (e) => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i]!;
      if (r.isFinal) finalText += r[0].transcript;
      else interim += r[0].transcript;
    }
    interimText = interim;
    onText((finalText + interim).trim(), false);
    // A finished phrase ends sooner than one still being recognised.
    clearTimeout(timer);
    timer = setTimeout(() => rec.stop(), interim ? pauseMs * 1.6 : pauseMs);
  };
  rec.onerror = (e) => {
    error = e.error === "not-allowed" || e.error === "service-not-allowed" ? "blocked" : e.error === "no-speech" ? "no-speech" : e.error === "aborted" ? undefined : "other";
  };
  rec.onend = () => {
    clearTimeout(timer);
    // If we stopped mid-phrase, keep the words already heard.
    const text = (finalText + (finalText.endsWith(interimText) ? "" : interimText)).trim();
    if (text) onText(text, true);
    onDone(text ? undefined : error ?? "no-speech");
  };
  rec.start();
  return rec;
}

// ---- Speech synthesis -------------------------------------------------------------

const VOICE_KEY = "rnxa.voiceName";

/** Natural-sounding voices first: Edge "Online (Natural)", Google, Apple premium voices. */
function score(v: SpeechSynthesisVoice) {
  const lang = (navigator.language || "en-US").toLowerCase();
  let s = 0;
  if (/natural|neural|online/i.test(v.name)) s += 50;
  if (/google/i.test(v.name)) s += 30;
  if (/premium|enhanced|siri|samantha|ava|aria|jenny|guy|libby|sonia|neerja/i.test(v.name)) s += 25;
  if (v.lang.toLowerCase() === lang) s += 20;
  else if (v.lang.toLowerCase().startsWith(lang.slice(0, 2))) s += 10;
  if (!v.lang.toLowerCase().startsWith("en") && !v.lang.toLowerCase().startsWith(lang.slice(0, 2))) s -= 100;
  if (v.localService === false) s += 5;
  return s;
}

export function availableVoices(): SpeechSynthesisVoice[] {
  if (!canSpeak()) return [];
  return [...window.speechSynthesis.getVoices()].filter((v) => score(v) > -50).sort((a, b) => score(b) - score(a));
}

export function chosenVoice(): SpeechSynthesisVoice | null {
  const voices = availableVoices();
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(VOICE_KEY);
  } catch {
    saved = null;
  }
  return voices.find((v) => v.name === saved) ?? voices[0] ?? null;
}

export function setVoiceName(name: string) {
  try {
    localStorage.setItem(VOICE_KEY, name);
  } catch {
    // Preference only.
  }
}

/** Plain text from the assistant's markdown, for reading aloud. */
export function forSpeech(markdown: string) {
  return markdown
    .split("\n")
    .filter((l) => !/^\s*\|?\s*:?-{3,}/.test(l))
    .map((l) => l.replace(/^\s*\|/, "").replace(/\|\s*$/, "").replace(/\s*\|\s*/g, ", "))
    .join(" ")
    .replace(/[*_`#>]/g, "")
    .replace(/(^|\s)[-•]\s+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Speaks streamed text sentence by sentence, so speech starts while the
 * reply is still arriving. `onIdle` fires when everything queued has been said.
 */
export class Speaker {
  private buffer = "";
  private queue = 0;
  private ended = true;
  private generation = 0;
  onIdle: (() => void) | null = null;
  onStart: (() => void) | null = null;
  rate = 1.05;

  get busy() {
    return this.queue > 0 || !this.ended;
  }

  begin() {
    this.stop();
    this.ended = false;
  }

  feed(delta: string) {
    this.buffer += delta;
    // Speak up to the last finished sentence: punctuation followed by whitespace, or a line
    // break. "32.5" has no space after the dot, so decimals don't split.
    const re = /[.!?]+\s|\n/g;
    let cut = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.buffer))) cut = m.index + m[0].length;
    if (cut > 0) {
      this.say(this.buffer.slice(0, cut));
      this.buffer = this.buffer.slice(cut);
    }
  }

  /** No more text is coming: speak what's left. */
  end() {
    if (this.buffer.trim()) this.say(this.buffer);
    this.buffer = "";
    this.ended = true;
    if (this.queue === 0) this.onIdle?.();
  }

  /** Say a complete piece of text now (after anything queued). */
  sayAll(text: string) {
    this.ended = false;
    this.say(text);
    this.end();
  }

  stop() {
    this.generation++;
    this.buffer = "";
    this.queue = 0;
    this.ended = true;
    if (canSpeak()) window.speechSynthesis.cancel();
  }

  private say(text: string) {
    const clean = forSpeech(text);
    if (!clean || !canSpeak()) return;
    const u = new SpeechSynthesisUtterance(clean);
    const voice = chosenVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = this.rate;
    const gen = this.generation;
    this.queue++;
    u.onstart = () => gen === this.generation && this.onStart?.();
    const done = () => {
      if (gen !== this.generation) return;
      this.queue = Math.max(0, this.queue - 1);
      if (this.queue === 0 && this.ended) this.onIdle?.();
    };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
  }
}

// Voices load asynchronously in Chrome; touching the list early starts loading.
if (canSpeak()) window.speechSynthesis.getVoices();
