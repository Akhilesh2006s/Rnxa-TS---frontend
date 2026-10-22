import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { formatStamp } from "../format";
import { Icon } from "./Icon";

interface Notification {
  id: string;
  kind: "REMINDER" | "INFO" | "ALERT";
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationsBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<{ notifications: Notification[]; unread: number }>("/notifications")
      .then((r) => {
        setItems(r.notifications);
        setUnread(r.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    window.addEventListener("rnxa:notifications-changed", load);
    return () => {
      clearInterval(t);
      window.removeEventListener("rnxa:notifications-changed", load);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function openItem(n: Notification) {
    if (!n.readAt) await api.post(`/notifications/${n.id}/read`).catch(() => undefined);
    setOpen(false);
    load();
    if (n.link) navigate(n.link);
  }

  async function readAll() {
    await api.post("/notifications/read-all").catch(() => undefined);
    load();
  }

  return (
    <div className="notif" ref={ref}>
      <button
        type="button"
        className="btn btn-ghost btn-icon notif-button"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          load();
        }}
      >
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="notif-count">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="row notif-head">
            <strong>Notifications</strong>
            <span className="spacer" />
            {unread > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={readAll}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="muted small" style={{ padding: 16 }}>
              You're all caught up.
            </p>
          ) : (
            <ul className="notif-list">
              {items.map((n) => (
                <li key={n.id}>
                  <button type="button" className={`notif-item ${n.readAt ? "" : "unread"}`} onClick={() => openItem(n)}>
                    <span className="notif-title">
                      {!n.readAt && <span className="dot" aria-label="Unread" />}
                      {n.kind === "ALERT" && <span className="badge tone-warning notif-kind">Alert</span>}
                      {n.title}
                    </span>
                    <span className={`small ${n.kind === "ALERT" ? "notif-alert-body" : ""}`}>{n.body}</span>
                    <span className="small muted">{formatStamp(n.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
