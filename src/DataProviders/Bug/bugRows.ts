import {
  Op,
  QueryTypes,
  type Transaction,
  type WhereAttributeHash,
  type WhereOptions,
} from "sequelize";
import { Bug, type BugUserRef } from "#src/Domain/Bug/Entity/Bug.js";
import type { BugFilter } from "#src/Domain/Bug/Entity/BugFilter.js";
import VARIAMOS_ORM, { DB_SCHEMA } from "#src/Infrastructure/VariamosORM.js";
import { UserModel } from "../User/User.js";
import { BugModel } from "./Bug.js";
import { BugAttachmentModel } from "./BugAttachment.js";

// Conditions on the bug columns, plus the alternatives of a text search
export type BugWhere = WhereAttributeHash & { [Op.or]?: object[] };

/**
 * A bug from its row, with the creator and attachments that the query
 * included; each read adds what it reads besides.
 */
export const bugFromRow = (dbBug: BugModel) =>
  Bug.builder()
    .setId(dbBug.id)
    .setTitle(dbBug.title)
    .setDescription(dbBug.description)
    .setPriority(dbBug.priority)
    .setCategory(dbBug.category || undefined)
    .setComponent(dbBug.component || undefined)
    .setStatus(dbBug.status)
    .setGithubRepo(dbBug.githubRepo || undefined)
    .setCreatedById(dbBug.createdById || undefined)
    .setReporterEmail(dbBug.reporterEmail || undefined)
    .setCreatedAt(dbBug.createdAt)
    .setCreatedBy(
      dbBug.createdBy
        ? {
            id: dbBug.createdById || "",
            name: dbBug.createdBy.name,
            email: dbBug.createdBy.email || dbBug.reporterEmail,
          }
        : undefined,
    )
    .setAttachments(dbBug.attachments ?? undefined);

/** Newest first; the id keeps bugs created at the same time on one page. */
export const NEWEST_FIRST: [string, string][] = [
  ["createdAt", "DESC"],
  ["id", "DESC"],
];

export function pageOf(filter: BugFilter): { limit?: number; offset?: number } {
  if (!filter.pageNumber || !filter.pageSize) return {};
  return {
    limit: filter.pageSize,
    offset: (filter.pageNumber - 1) * filter.pageSize,
  };
}

/** The bugs of the page and, for a page, how many match the filters. */
export async function findPage(
  where: WhereOptions,
  filter: BugFilter,
): Promise<{ dbBugs: BugModel[]; totalCount?: number }> {
  const page = pageOf(filter);
  const [dbBugs, totalCount] = await Promise.all([
    BugModel.findAll({
      where,
      include: [
        { model: BugAttachmentModel, as: "attachments" },
        { model: UserModel, as: "createdBy", attributes: ["name", "email"] },
      ],
      order: NEWEST_FIRST,
      ...page,
    }),
    page.limit === undefined ? undefined : BugModel.count({ where }),
  ]);
  return { dbBugs, totalCount: totalCount ?? dbBugs.length };
}

export async function resolveOperatorId(
  adminId?: string,
  transaction?: Transaction,
): Promise<string | undefined> {
  if (!adminId) return undefined;
  const userExists = await UserModel.findByPk(adminId, { transaction });
  return userExists ? adminId : undefined;
}

// Assignees by bug: id and name only, the list is shown to administrators
export async function assigneesOf(
  bugIds: string[],
): Promise<Map<string, BugUserRef[]>> {
  const byBug = new Map<string, BugUserRef[]>();
  if (bugIds.length === 0) return byBug;
  const rows = await VARIAMOS_ORM.query<{
    bugId: string;
    id: string;
    name: string;
  }>(
    `SELECT ba.bug_id AS "bugId", u.id, u.name
       FROM ${DB_SCHEMA}.bug_assignees ba
       JOIN ${DB_SCHEMA}.user u ON u.id = ba.user_id
      WHERE ba.bug_id IN (:bugIds)
      ORDER BY u.name`,
    { replacements: { bugIds }, type: QueryTypes.SELECT },
  );
  for (const { bugId, id, name } of rows) {
    byBug.set(bugId, [...(byBug.get(bugId) ?? []), { id, name }]);
  }
  return byBug;
}

export async function bugIdsAssignedTo(userId: string): Promise<string[]> {
  const rows = await VARIAMOS_ORM.query<{ bugId: string }>(
    `SELECT bug_id AS "bugId" FROM ${DB_SCHEMA}.bug_assignees
      WHERE user_id = :userId`,
    { replacements: { userId }, type: QueryTypes.SELECT },
  );
  return rows.map((row) => row.bugId);
}
