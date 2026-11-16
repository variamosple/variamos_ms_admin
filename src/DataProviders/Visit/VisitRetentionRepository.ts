import { QueryTypes, type Sequelize } from "sequelize";
import type { IJournalPurge } from "#src/Domain/Activity/IJournalPurge.js";
import { rowCountOf } from "../queryResults.js";

// As the access journal: a visit names an account (decision of the project
// lead, 2026-11-16)
const RETENTION = "6 months";

/**
 * Retention of the visits. Past six months:
 * - page_visit keeps the page, the day and the country, and loses the
 *   account and the quarter-hour (migration 0032): the visits stay counted
 *   by page, day and country;
 * - user_visit, an account by day that nothing fills since the pgAgent job
 *   stopped in May 2025 and no chart reads any more, loses its rows.
 * A schema without these tables is left as it is.
 */
export class VisitRetentionRepositoryImpl implements IJournalPurge {
  public readonly journal = "visit";

  public constructor(
    private readonly sequelize: Sequelize,
    private readonly schema: string,
  ) {}

  public async purgeExpired(): Promise<number> {
    const [tables] = await this.sequelize.query<{
      pageVisit: boolean;
      userVisit: boolean;
    }>(
      `SELECT to_regclass(:pageVisit) IS NOT NULL AS "pageVisit",
              to_regclass(:userVisit) IS NOT NULL AS "userVisit"`,
      {
        replacements: {
          pageVisit: `"${this.schema}".page_visit`,
          userVisit: `"${this.schema}".user_visit`,
        },
        type: QueryTypes.SELECT,
      },
    );
    let changed = 0;
    if (tables?.pageVisit) {
      const [, result] = await this.sequelize.query(
        `UPDATE "${this.schema}"."page_visit"
            SET "user_id" = NULL, "visited_at" = NULL
          WHERE "visit_date" < current_date - interval '${RETENTION}'
            AND ("user_id" IS NOT NULL OR "visited_at" IS NOT NULL)`,
      );
      changed += rowCountOf(result);
    }
    if (tables?.userVisit) {
      const [, result] = await this.sequelize.query(
        `DELETE FROM "${this.schema}"."user_visit"
          WHERE "visit_date" < current_date - interval '${RETENTION}'`,
      );
      changed += rowCountOf(result);
    }
    return changed;
  }
}
