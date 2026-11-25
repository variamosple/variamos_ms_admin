import { readFileSync } from "node:fs";
import { QueryTypes, Sequelize } from "sequelize";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { GitHubIssue } from "#src/Domain/Core/Service/IIssueTrackerService.js";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";

// Needs a disposable PostgreSQL, as the migration tests:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_bug_sync";
const REPO = "variamosple/VariaMosPLE";

const productionSchema = () =>
  readFileSync(
    new URL(
      "../../Infrastructure/database/Migrations/fixtures/production-schema-2026-10-18.sql",
      import.meta.url,
    ),
    "utf8",
  ).replaceAll("variamos.", `"${SCHEMA}".`);

const issue = (number: number, fields: Partial<GitHubIssue>): GitHubIssue => ({
  number,
  title: `Issue ${number}`,
  body: `Body ${number}`,
  state: "open",
  html_url: `https://github.com/${REPO}/issues/${number}`,
  labels: [],
  created_at: "2026-11-01T10:00:00Z",
  updated_at: "2026-11-02T10:00:00Z",
  user: { login: "reporter" },
  assignee: null,
  ...fields,
});

/**
 * The GitHub sync on PostgreSQL: a pass over issues that did not change
 * writes nothing, neither in bugs nor in bug_status_logs. Production rewrote
 * every unassigned bug at each pass (9 526 updates of 31 bugs in 5.6 days).
 */
describe.skipIf(!url)("GitHub bug sync on PostgreSQL (2026-11-25)", () => {
  let setup: Sequelize;
  let orm: Sequelize;
  let issues: GitHubIssue[];
  let syncBugs: () => Promise<{ errorCode?: number | string }>;

  // xmin changes with every write of a row, even one that changes no value
  const rows = () =>
    setup.query<{
      git_issue_number: number;
      xmin: string;
      updated_at: Date;
      title: string;
      github_assignee: string | null;
      description: string;
    }>(
      `SELECT git_issue_number, xmin::text AS xmin, updated_at, title,
              github_assignee, description
         FROM "${SCHEMA}".bugs ORDER BY git_issue_number`,
      { type: QueryTypes.SELECT },
    );

  const logLines = async () =>
    (
      await setup.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM "${SCHEMA}".bug_status_logs`,
        { type: QueryTypes.SELECT },
      )
    )[0]?.n;

  beforeAll(async () => {
    setup = new Sequelize(url as string, { logging: false });
    await setup.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await setup.query(`CREATE SCHEMA "${SCHEMA}"`);
    await setup.query(productionSchema());
    await runMigrations(setup, SCHEMA);
    // The platform columns of the account that the bug queries read
    await setup.query(
      `ALTER TABLE "${SCHEMA}"."user" ADD COLUMN "name" text, ADD COLUMN "email" text`,
    );

    // The bug models are bound to the connection read from the environment
    // when they load: point it at the test schema, then load them again
    const target = new URL(url as string);
    vi.stubEnv("DB_HOST", target.hostname);
    vi.stubEnv("DB_PORT", target.port || "5432");
    vi.stubEnv("DB_USER", decodeURIComponent(target.username));
    vi.stubEnv("DB_PASSWORD", decodeURIComponent(target.password));
    vi.stubEnv("DB_DATABASE", target.pathname.slice(1));
    vi.stubEnv("DB_SCHEMA", SCHEMA);
    vi.stubEnv("DB_SSL", "false");
    vi.resetModules();
    orm = (await import("#src/Infrastructure/VariamosORM.js")).default;
    const { registerBugAssociations } = await import("./BugAssociations.js");
    registerBugAssociations();
    const { BugRepositoryImpl } = await import("./BugRepository.js");
    const { BugQueryRepositoryImpl } = await import("./BugQueryRepository.js");
    const { BugSyncUseCase } = await import(
      "#src/Domain/Bug/UseCase/BugSyncUseCase.js"
    );
    const { RequestModel } = await import(
      "#src/Domain/Core/Entity/RequestModel.js"
    );

    const useCase = new BugSyncUseCase({
      repositories: {
        bugs: new BugRepositoryImpl(),
        queries: new BugQueryRepositoryImpl(),
      },
      issueTrackerService: {
        getIssues: async () => issues,
      } as never,
      githubConfig: {
        getGitHubManagedRepos: () => [REPO],
        getGitHubToken: () => "token",
      },
      tokenResolver: { resolveGitHubToken: async () => "token" },
      logger: { info: vi.fn(), warn: vi.fn(), err: vi.fn() },
      journal: { record: async () => undefined },
    });
    syncBugs = () => useCase.syncBugs(new RequestModel("tx-sync"));
  });

  afterAll(async () => {
    await orm?.close();
    await setup?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
    await setup?.close();
  });

  it("writes nothing on a second pass over unchanged issues", async () => {
    issues = [
      issue(1, { assignee: { login: "alice" }, labels: [{ name: "high" }] }),
      // No assignee, no text, no author: what GitHub leaves out
      issue(2, { body: null, user: null }),
      issue(3, { state: "closed" }),
      issue(4, { pull_request: {} }),
    ];

    expect((await syncBugs()).errorCode).toBeUndefined();
    const first = await rows();
    expect(first.map((row) => row.git_issue_number)).toEqual([1, 2, 3]);
    const logsBefore = await logLines();

    expect((await syncBugs()).errorCode).toBeUndefined();

    expect(await rows()).toEqual(first);
    expect(await logLines()).toBe(logsBefore);
  });

  it("writes only the issues that changed, then nothing again", async () => {
    const before = await rows();
    issues = [
      issue(1, { labels: [{ name: "high" }] }),
      issue(2, { body: null, user: null, title: "Issue 2, renamed" }),
      issue(3, { state: "closed" }),
    ];

    expect((await syncBugs()).errorCode).toBeUndefined();
    const after = await rows();

    // The assignee taken off on GitHub is NULL again
    expect(after[0]?.github_assignee).toBeNull();
    expect(after[0]?.xmin).not.toBe(before[0]?.xmin);
    expect(after[1]?.title).toBe("Issue 2, renamed");
    expect(after[1]?.xmin).not.toBe(before[1]?.xmin);
    expect(after[2]).toEqual(before[2]);

    expect((await syncBugs()).errorCode).toBeUndefined();
    expect(await rows()).toEqual(after);
  });
});
