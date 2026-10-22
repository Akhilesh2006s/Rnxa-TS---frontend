// Thin fetch wrapper. All calls are same-origin and carry the CSRF header the
// server requires on state-changing requests.

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "rnxa-web",
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const err = data?.error ?? {};
    if (res.status === 401 && url !== "/auth/login" && url !== "/auth/me") {
      window.dispatchEvent(new Event("rnxa:unauthenticated"));
    }
    throw new ApiError(res.status, err.code ?? "ERROR", err.message ?? "Something went wrong.", err.details);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  patch: <T>(url: string, body: unknown) => request<T>("PATCH", url, body),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  delete: <T>(url: string) => request<T>("DELETE", url),
};

export const qs = (params: Record<string, string | undefined>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) s.set(k, v);
  const str = s.toString();
  return str ? `?${str}` : "";
};

// ---- Shared types ------------------------------------------------------------

export type Role = "ADMIN" | "MANAGER" | "EMPLOYEE";
export type Permission = "MANAGE_USERS" | "MANAGE_PROJECTS" | "CLOSE_PHASES" | "MANAGE_POLICY" | "VIEW_AUDIT";
export type EntryStatus = "DRAFT" | "SUBMITTED" | "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  isSuperAdmin?: boolean;
  /** Administrative permissions (MANAGE_USERS, MANAGE_PROJECTS, CLOSE_PHASES, MANAGE_POLICY, VIEW_AUDIT). */
  permissions?: Permission[];
  /** Present while the super admin is viewing the app as this user. */
  impersonator?: { id: string; name: string; email: string };
}

export interface Phase {
  id: string;
  name: string;
}

export interface LoggableProject {
  id: string;
  code: string;
  name: string;
  client?: string | null;
  phasesEnabled: boolean;
  phases: Phase[];
  myMinutesThisWeek?: number;
  myMinutesTotal?: number;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  kind: "IMAGE" | "VIDEO" | "DOCUMENT";
  size: number;
  createdAt: string;
}

export interface Entry {
  id: string;
  userId: string;
  projectId: string;
  phaseId: string | null;
  workDate: string;
  startTime: string | null;
  endTime: string | null;
  minutes: number;
  description: string;
  status: EntryStatus;
  reviewerComment: string | null;
  reviewedAt: string | null;
  autoVerified: boolean;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  project: { id: string; code: string; name: string };
  phase: { id: string; name: string } | null;
  user: { id: string; name: string; email: string };
  reviewer: { id: string; name: string } | null;
  /** Photos, videos and documents the employee attached. */
  attachments?: Attachment[];
}

export type FlagCode = "DUPLICATE" | "LONG_DURATION" | "MISSING_DESCRIPTION";

export interface WeekSummary {
  start: string;
  end: string;
  entries: Entry[];
  days: {
    date: string;
    minutes: number;
    expectedMinutes: number;
    missing: boolean;
    holiday?: string | null;
    leave?: { type: "CASUAL" | "SICK" | "EARNED" | "UNPAID"; halfDay: boolean } | null;
  }[];
  totalMinutes: number;
  expectedMinutes: number;
  byProjectPhase: { project: string; phase: string | null; minutes: number }[];
  statusCounts: Partial<Record<EntryStatus, number>>;
  flags: Record<string, FlagCode[]>;
  /** Days that are verified and locked: nothing can be added or changed. */
  lockedDays: string[];
  policy: { expectedDailyMinutes: number; workDays: number[]; longEntryMinutes: number };
  /** Who verifies this person's time (null: any admin). */
  verifier: { id: string; name: string } | null;
  hasProjects: boolean;
  checkin: { reminderHour: number; enabled: boolean };
}

/**
 * POST that streams server-sent events. Calls onEvent for each event and
 * resolves with the final `done` result; rejects with ApiError on `error`.
 */
export async function postStream<T>(url: string, body: unknown, onEvent: (e: { type: string; [k: string]: unknown }) => void): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-Requested-With": "rnxa-web", "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Can't reach the server. Check your connection and try again.");
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null);
    if (res.status === 401) window.dispatchEvent(new Event("rnxa:unauthenticated"));
    throw new ApiError(res.status, data?.error?.code ?? "ERROR", data?.error?.message ?? "Something went wrong.");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6));
      if (event.type === "done") return event.result as T;
      if (event.type === "error") throw new ApiError(500, event.error?.code ?? "ERROR", event.error?.message ?? "Something went wrong.");
      onEvent(event);
    }
  }
  throw new ApiError(0, "NETWORK", "The connection closed before the reply finished.");
}
