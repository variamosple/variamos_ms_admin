import type { Bug } from "#src/Domain/Bug/Entity/Bug.js";
import {
  BUG_COMPONENT_LABELS,
  type BugComponentValue,
} from "#src/Domain/Bug/Entity/BugComponent.js";
import type { BugPriorityValue } from "#src/Domain/Bug/Entity/BugPriority.js";
import type { IssueContent } from "#src/Domain/Core/Service/IIssueTrackerService.js";

/** The fields an administrator may correct when approving a bug. */
export interface BugEdits {
  title?: string;
  description?: string;
  priority?: BugPriorityValue;
  category?: string;
  component?: string;
  githubRepo?: string;
}

/** The lines of the audit note: each field the administrator changed. */
export const modifiedFieldsOf = (edits: BugEdits, bug: Bug): string[] => {
  const lines: string[] = [];
  if (edits.title && edits.title !== bug.title) {
    lines.push(`* Title: "${bug.title}" -> "${edits.title}"`);
  }
  if (edits.description && edits.description !== bug.description) {
    lines.push(`* Description: "${bug.description}" -> "${edits.description}"`);
  }
  if (edits.category && edits.category !== bug.category) {
    lines.push(
      `* Category: "${bug.category || "None"}" -> "${edits.category}"`,
    );
  }
  if (edits.priority && edits.priority !== bug.priority) {
    lines.push(
      `* Priority: "${bug.priority || "medium"}" -> "${edits.priority}"`,
    );
  }
  if (edits.component && edits.component !== bug.component) {
    lines.push(
      `* Component: "${bug.component || "None"}" -> "${edits.component}"`,
    );
  }
  if (edits.githubRepo && edits.githubRepo !== bug.githubRepo) {
    lines.push(`* Target repository set to "${edits.githubRepo}"`);
  }
  return lines;
};

/** Writes the given fields on the bug; an empty field keeps its value. */
export const applyEdits = (
  bug: Bug,
  edits: BugEdits,
  component: BugComponentValue | undefined,
): void => {
  if (edits.title) bug.title = edits.title;
  if (edits.description) bug.description = edits.description;
  if (edits.priority) bug.priority = edits.priority;
  if (edits.category) bug.category = edits.category;
  if (component) bug.component = component;
  if (edits.githubRepo) bug.githubRepo = edits.githubRepo;
};

/**
 * The public issue of an approved bug. Who reported and who approved stay
 * in the database and the bug history, never in its text.
 */
export const approvedIssueOf = (
  bug: Bug,
  comment: string | undefined,
  apiBaseUrl: string,
): IssueContent => {
  let body = bug.description || "No description provided.";
  body += bug.createdById
    ? "\n\n---\n*Reported from VariaMos*"
    : "\n\n---\n*Reported by a guest*";
  const approvalComment = comment ? ` (Comment: "${comment}")` : "";
  body += `\n*Approved by an administrator${approvalComment}*`;
  if (bug.priority) body += `\n*Priority: ${bug.priority}*`;
  if (bug.category) body += `\n*Category: ${bug.category}*`;
  if (bug.component) {
    body += `\n*Component: ${BUG_COMPONENT_LABELS[bug.component]}*`;
  }
  body += attachmentsSectionOf(bug, apiBaseUrl);
  const labels = ["bug"];
  if (bug.category) labels.push(bug.category.toLowerCase());
  if (bug.priority) labels.push(bug.priority.toLowerCase());
  return { title: bug.title, body, labels };
};

// The links to the stored attachments; a purged file is left out
const attachmentsSectionOf = (bug: Bug, apiBaseUrl: string): string => {
  const attachments = bug.attachments ?? [];
  if (attachments.length === 0) return "";
  let section = "\n\n### Attachments\n";
  for (const attachment of attachments) {
    if (attachment.filePath && attachment.filePath !== "/purged") {
      section += `- [Attachment](${apiBaseUrl}${attachment.filePath}) (Type: ${attachment.fileType || "unknown"})\n`;
    }
  }
  return section;
};

/** The audit note of an approval, with the administrator's comment. */
export const approvalNoteOf = (
  modifiedFields: string[],
  comment: string | undefined,
): string => {
  const commentLine = comment ? `\n\nAdmin Comment: "${comment}"` : "";
  return modifiedFields.length > 0
    ? `[Audit] The administrator modified the following fields:\n${modifiedFields.join("\n")}${commentLine}`
    : `[Audit] The bug was approved and sent to GitHub. The fields were not modified by the administrator.${commentLine}`;
};
