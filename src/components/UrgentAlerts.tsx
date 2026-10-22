import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { api } from "../api";
import { formatStamp } from "../format";
import { Icon } from "./Icon";

interface Urgent {
  notificationId: string;
  title: string;
  body: string;
  sender: { id: string; name: string };
  createdAt: string;
}

/** Unread urgent alerts, pinned above every page until the person acknowledges them. */
export function UrgentAlerts() {
  const [items, setItems] = useState<Urgent[]>([]);
  const location = useLocation();
  const load = useCallback(() => {
    api
      .get<{ urgent: Urgent[] }>("/alerts/inbox")
      .then((r) => setItems(r.urgent))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    return () => window.clearInterval(t);
  }, [load, location.pathname]);

  if (!items.length) return null;
  return (
    <div className="urgent-alerts" role="region" aria-label="Urgent alerts">
      {items.map((a) => (
        <div key={a.notificationId} className="urgent-alert" role="alert">
          <span className="urgent-icon" aria-hidden="true">
            <Icon name="bell" size={18} />
          </span>
          <div className="urgent-text">
            <strong>{a.title}</strong>
            <p>{a.body}</p>
            <span className="small">
              From {a.sender.name} · {formatStamp(a.createdAt)}
            </span>
          </div>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={async () => {
              await api.post(`/notifications/${a.notificationId}/read`).catch(() => undefined);
              setItems((list) => list.filter((x) => x.notificationId !== a.notificationId));
              window.dispatchEvent(new Event("rnxa:notifications-changed"));
            }}
          >
            Got it
          </button>
        </div>
      ))}
    </div>
  );
}
