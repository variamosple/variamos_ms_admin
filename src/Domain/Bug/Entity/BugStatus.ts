/**
 * Statuses of a bug report (T-23, EV-84 lot 2). The specification asks for
 * Open, In Progress, Resolved, Closed and Invalid:
 *
 * | Stored        | Label             | GitHub issue                  |
 * | ------------- | ----------------- | ----------------------------- |
 * | `pending`     | Open, to triage   | none yet                      |
 * | `open`        | Open, confirmed   | open                          |
 * | `in_progress` | In progress       | open, label `in progress`     |
 * | `resolved`    | Resolved          | closed as completed           |
 * | `closed`      | Closed            | closed as completed           |
 * | `rejected`    | Invalid           | none (rejected before triage) |
 *
 * `purged` is the deletion of a rejected bug after its retention (EV-67).
 * The stored values of the existing rows do not change.
 */
export const BUG_STATUSES = [
  "pending",
  "open",
  "in_progress",
  "resolved",
  "closed",
  "rejected",
  "purged",
] as const;

export type BugStatus = (typeof BUG_STATUSES)[number];

export const IN_PROGRESS_LABEL = "in progress";

// Rejection, restoration and purge have their own routes: an administrator
// changes a status through POST /bugs/:id/status only along these arrows
const TRANSITIONS: Readonly<Record<string, readonly BugStatus[]>> = {
  pending: ["open"],
  open: ["in_progress", "resolved", "closed"],
  in_progress: ["open", "resolved", "closed"],
  resolved: ["open", "in_progress", "closed"],
  closed: ["open"],
};

export const canChangeStatus = (from: string, to: string): boolean =>
  TRANSITIONS[from]?.includes(to as BugStatus) ?? false;

/** Whether the GitHub issue of a bug in this status is open. */
export const isIssueOpen = (status: string): boolean =>
  status === "open" || status === "in_progress";

/**
 * Local status after a synchronization with GitHub. GitHub only knows open
 * and closed: the local status changes only when the issue was closed or
 * reopened there, so that In Progress or Resolved survive a synchronization.
 */
export const statusFromGitHub = (
  issueState: string | undefined,
  localStatus: string | undefined,
): string => {
  const issueClosed = issueState === "closed";
  if (localStatus === undefined) return issueClosed ? "closed" : "open";
  if (issueClosed) {
    return isIssueOpen(localStatus) ? "closed" : localStatus;
  }
  return localStatus === "resolved" || localStatus === "closed"
    ? "open"
    : localStatus;
};
