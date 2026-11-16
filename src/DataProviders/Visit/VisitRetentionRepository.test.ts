import type { Sequelize } from "sequelize";
import { VisitRetentionRepositoryImpl } from "./VisitRetentionRepository.js";

// Checked on PostgreSQL by VisitRetentionRepository.integration.test.ts
const fakeSequelize = (tables: { pageVisit: boolean; userVisit: boolean }) => {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes("to_regclass")) return [tables];
    return [[], { rowCount: sql.startsWith("UPDATE") ? 3 : 2 }];
  });
  return { query, sequelize: { query } as unknown as Sequelize };
};

describe("VisitRetentionRepositoryImpl", () => {
  it("erases the account of the old visits and deletes the old days of user_visit", async () => {
    const { query, sequelize } = fakeSequelize({
      pageVisit: true,
      userVisit: true,
    });

    const changed = await new VisitRetentionRepositoryImpl(
      sequelize,
      "custom",
    ).purgeExpired();

    expect(changed).toBe(5);
    const [, update, remove] = query.mock.calls.map(([sql]) => String(sql));
    expect(update).toContain('UPDATE "custom"."page_visit"');
    expect(update).toContain('SET "user_id" = NULL, "visited_at" = NULL');
    expect(update).toContain("interval '6 months'");
    expect(remove).toContain('DELETE FROM "custom"."user_visit"');
  });

  it("changes nothing in a schema without the visit tables", async () => {
    const { query, sequelize } = fakeSequelize({
      pageVisit: false,
      userVisit: false,
    });

    expect(
      await new VisitRetentionRepositoryImpl(
        sequelize,
        "custom",
      ).purgeExpired(),
    ).toBe(0);
    expect(query).toHaveBeenCalledTimes(1);
  });
});
