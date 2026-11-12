import type { IBugAssigneeRepository } from "./IBugAssigneeRepository.js";
import type { IBugAttachmentRepository } from "./IBugAttachmentRepository.js";
import type { IBugNoteRepository } from "./IBugNoteRepository.js";
import type { IBugQueryRepository } from "./IBugQueryRepository.js";
import type { IBugRepository } from "./IBugRepository.js";

/**
 * The bug repositories, one per subject. A use case takes the ones it uses
 * (Pick<BugRepositories, ...>).
 */
export interface BugRepositories {
  bugs: IBugRepository;
  queries: IBugQueryRepository;
  attachments: IBugAttachmentRepository;
  notes: IBugNoteRepository;
  assignees: IBugAssigneeRepository;
}
