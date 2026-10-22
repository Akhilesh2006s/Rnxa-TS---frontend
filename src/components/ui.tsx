import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import type { EntryStatus, FlagCode } from "../api";
import { STATUS_LABEL, formatHours } from "../format";
import { Icon, type IconName } from "./Icon";

// ---- Buttons ------------------------------------------------------------------

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size,
  icon,
  busy,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm"; icon?: IconName; busy?: boolean }) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${className}`}
      aria-busy={busy || undefined}
      {...rest}
      disabled={rest.disabled || busy}
    >
      {icon && <Icon name={icon} />}
      {children}
    </button>
  );
}

export function IconButton({ icon, label, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { icon: IconName; label: string }) {
  return (
    <button type="button" className="btn btn-ghost btn-icon" aria-label={label} title={label} {...rest}>
      <Icon name={icon} />
    </button>
  );
}

// ---- Form field -----------------------------------------------------------------

export function Field({
  label,
  hint,
  error,
  children,
  className = "",
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`field ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <span className="hint" id={hintId}>
          {hint}
        </span>
      )}
      {error && (
        <span className="error-text" id={errorId}>
          {error}
        </span>
      )}
    </div>
  );
}

// ---- Status --------------------------------------------------------------------

const STATUS_TONE: Record<EntryStatus, { tone: string; icon: IconName }> = {
  DRAFT: { tone: "neutral", icon: "draft" },
  SUBMITTED: { tone: "info", icon: "send" },
  CHANGES_REQUESTED: { tone: "warning", icon: "alert" },
  APPROVED: { tone: "success", icon: "checkCircle" },
  REJECTED: { tone: "error", icon: "xCircle" },
};

export function StatusBadge({ status }: { status: EntryStatus }) {
  const s = STATUS_TONE[status];
  return (
    <span className={`badge tone-${s.tone}`}>
      <Icon name={s.icon} size={12} />
      {STATUS_LABEL[status]}
    </span>
  );
}

const FLAG_TEXT: Record<FlagCode, string> = {
  DUPLICATE: "Possible duplicate",
  LONG_DURATION: "Unusually long",
  MISSING_DESCRIPTION: "No description",
};

export function FlagBadges({ flags }: { flags?: FlagCode[] }) {
  if (!flags?.length) return null;
  return (
    <span className="row">
      {flags.map((f) => (
        <span key={f} className="badge tone-warning">
          <Icon name="alert" size={12} />
          {FLAG_TEXT[f]}
        </span>
      ))}
    </span>
  );
}

type Tone = "success" | "warning" | "error" | "info";
const TONE_ICON: Record<Tone, IconName> = { success: "checkCircle", warning: "alert", error: "xCircle", info: "info" };

export function Alert({ tone, title, children, action }: { tone: Tone; title?: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className={`alert tone-${tone}`} role={tone === "error" ? "alert" : "status"}>
      <Icon name={TONE_ICON[tone]} />
      <div style={{ flex: 1 }}>
        {title && <strong>{title}</strong>}
        {children}
      </div>
      {action}
    </div>
  );
}

// ---- Layout pieces -------------------------------------------------------------

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, flush }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean }) {
  return (
    <section className="card">
      {(title || actions) && (
        <div className="card-header">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body ${flush ? "flush" : ""}`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, meta }: { label: string; value: ReactNode; meta?: ReactNode }) {
  return (
    <div className="card stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {meta && <div className="stat-meta">{meta}</div>}
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="empty" role="status">
      {label}…
    </div>
  );
}

// ---- Single-series magnitude marks ----------------------------------------------

export function Meter({ value, max, label }: { value: number; max: number; label?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="meter" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Horizontal bars with the value printed beside each label, so the list doubles as the data table. */
export function BarList({
  rows,
  empty = "No hours in this period.",
  format = formatHours,
}: {
  rows: { label: string; minutes: number }[];
  empty?: string;
  format?: (value: number) => string;
}) {
  if (!rows.length) return <p className="muted small">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.minutes));
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r.label}>
          <span className="label" title={r.label}>
            {r.label}
          </span>
          <span className="value">{format(r.minutes)}</span>
          <Meter value={r.minutes} max={max} />
        </li>
      ))}
    </ul>
  );
}

// ---- Dialog --------------------------------------------------------------------

export function Dialog({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose} onCancel={onClose}>
      {open && (
        <>
          <div className="dialog-header">
            <h2 id={titleId}>{title}</h2>
            <IconButton icon="x" label="Close" onClick={onClose} />
          </div>
          <div className="dialog-body">{children}</div>
          {footer && <div className="dialog-footer">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

// ---- Toasts --------------------------------------------------------------------

interface Toast {
  id: number;
  tone: Tone;
  text: string;
}
const ToastContext = createContext<(tone: Tone, text: string) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Tone, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <Alert tone={t.tone}>{t.text}</Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

// ---- Data loading ----------------------------------------------------------------

/** Loads data for a page and exposes a reload function. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    load()
      .then((d) => live && setData(d))
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { data, error, reload };
}
