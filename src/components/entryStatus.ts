import type { Entry } from "../api";

/** Plain-language status for an entry, as the employee sees it. */
export function entryStatus(e: Entry, verifierName: string) {
  switch (e.status) {
    case "APPROVED":
      return { tone: "success", icon: "checkCircle" as const, text: e.autoVerified ? "Verified automatically" : `Verified by ${e.reviewer?.name ?? "admin"}` };
    case "SUBMITTED":
      return { tone: "info", icon: "send" as const, text: `Waiting for ${verifierName}` };
    case "CHANGES_REQUESTED":
      return { tone: "warning", icon: "alert" as const, text: "Needs changes" };
    case "REJECTED":
      return { tone: "error", icon: "xCircle" as const, text: "Rejected" };
    default:
      return { tone: "neutral", icon: "draft" as const, text: "Draft" };
  }
}
