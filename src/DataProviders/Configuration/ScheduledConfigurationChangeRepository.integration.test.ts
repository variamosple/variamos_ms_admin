import { Sequelize } from "sequelize";
import type { ConfigurationValue } from "#src/Domain/Configuration/Entity/Configuration.js";
import { runMigrations } from "#src/Infrastructure/database/Migrations/Migrator.js";
import { ScheduledConfigurationChangeRepositoryImpl } from "./ScheduledConfigurationChangeRepository.js";

// Needs a disposable PostgreSQL, as the migration tests do:
//   MIGRATIONS_TEST_DATABASE_URL=postgres://postgres:pg@localhost:55432/postgres npm test
const url = process.env.MIGRATIONS_TEST_DATABASE_URL;
const SCHEMA = "t_scheduled_changes";

const LATER = new Date("2030-01-01T10:00:00Z");
const BASE = new Date("2026-11-01T08:00:00.123Z");

describe.skipIf(!url)(
  "ScheduledConfigurationChangeRepositoryImpl on PostgreSQL (EV-115 lot B)",
  () => {
    let sequelize: Sequelize;
    let changes: ScheduledConfigurationChangeRepositoryImpl;

    const plan = (
      key: string,
      dueAt = LATER,
      newValue: ConfigurationValue = 12,
    ) =>
      changes.create({
        key,
        previousValue: 8,
        newValue,
        baseUpdatedAt: BASE,
        dueAt,
        createdBy: "admin-1",
      });

    beforeAll(async () => {
      sequelize = new Sequelize(url as string, {
        logging: false,
        pool: { max: 5 },
      });
      await sequelize.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await sequelize.query(`CREATE SCHEMA "${SCHEMA}"`);
      await sequelize.query(
        `CREATE TABLE "${SCHEMA}"."user" ("id" text PRIMARY KEY)`,
      );
      const migrations = new Sequelize(url as string, { logging: false });
      await runMigrations(migrations, SCHEMA);
      await migrations.close();
      await sequelize.query(
        `INSERT INTO "${SCHEMA}"."configurations"
           ("key", "value", "type", "category", "target_services", "created_at", "updated_at")
         VALUES ('test.a', '8', 'number', 'security', '{all}', now(), now()),
                ('test.b', '8', 'number', 'security', '{all}', now(), now())`,
      );
      changes = new ScheduledConfigurationChangeRepositoryImpl(
        sequelize,
        SCHEMA,
      );
    });

    beforeEach(async () => {
      await sequelize.query(
        `DELETE FROM "${SCHEMA}"."scheduled_configuration_changes"`,
      );
    });

    afterAll(async () => {
      await sequelize?.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
      await sequelize?.close();
    });

    it("keeps the values, the dates and the author of a planned change", async () => {
      const created = await plan("test.a", LATER, true);

      expect(created).toEqual(
        expect.objectContaining({
          key: "test.a",
          previousValue: 8,
          newValue: true,
          baseUpdatedAt: BASE,
          dueAt: LATER,
          status: "scheduled",
          reason: null,
          createdBy: "admin-1",
          updatedBy: null,
          resolvedAt: null,
        }),
      );
      expect(await changes.findById(created?.id as number)).toEqual(created);
      expect(await changes.findById(999_999)).toBeNull();
    });

    it("plans one change per setting at a time", async () => {
      expect(await plan("test.a")).not.toBeNull();
      expect(await plan("test.a")).toBeNull();
      expect(await plan("test.b")).not.toBeNull();
    });

    it("edits and cancels a planned change only", async () => {
      const created = await plan("test.a");
      const id = created?.id as number;
      const moved = new Date("2030-02-01T10:00:00Z");

      const edited = await changes.reschedule(id, {
        previousValue: 9,
        newValue: 14,
        baseUpdatedAt: null,
        dueAt: moved,
        updatedBy: "admin-2",
      });
      expect(edited).toEqual(
        expect.objectContaining({
          previousValue: 9,
          newValue: 14,
          dueAt: moved,
          updatedBy: "admin-2",
          status: "scheduled",
        }),
      );

      const cancelled = await changes.cancel(id, "admin-3");
      expect(cancelled).toEqual(
        expect.objectContaining({ status: "cancelled", updatedBy: "admin-3" }),
      );
      expect(cancelled?.resolvedAt).toBeInstanceOf(Date);
      expect(await changes.cancel(id, "admin-3")).toBeNull();
      expect(
        await changes.reschedule(id, {
          previousValue: 9,
          newValue: 15,
          baseUpdatedAt: null,
          dueAt: moved,
          updatedBy: "admin-2",
        }),
      ).toBeNull();
      // Cancelled, the setting may be planned again
      expect(await plan("test.a")).not.toBeNull();
    });

    it("lists the planned changes first, then those resolved since the date", async () => {
      const old = await plan("test.a");
      await changes.cancel(old?.id as number, "admin");
      await sequelize.query(
        `UPDATE "${SCHEMA}"."scheduled_configuration_changes"
            SET "resolved_at" = now() - interval '40 days'`,
      );
      const recent = await plan("test.a");
      await changes.cancel(recent?.id as number, "admin");
      const planned = await plan("test.b");

      const listed = await changes.list(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      );

      expect(listed.map((c) => c.id)).toEqual([planned?.id, recent?.id]);
    });

    it("resolves each due change once, even with two passes at the same time", async () => {
      const past = new Date(Date.now() - 60_000);
      const a = await plan("test.a", past);
      const b = await plan("test.b", past);
      const seen: number[] = [];
      const resolve = async (change: { id: number }) => {
        seen.push(change.id);
        await new Promise((done) => {
          setTimeout(done, 50);
        });
        return { status: "applied" as const, reason: null };
      };

      const [first, second] = await Promise.all([
        changes.resolveDue(new Date(), resolve),
        changes.resolveDue(new Date(), resolve),
      ]);

      expect(first + second).toBe(2);
      const byId = (x?: number, y?: number) => Number(x) - Number(y);
      expect(seen.sort(byId)).toEqual([a?.id, b?.id].sort(byId));
      expect(await changes.findById(a?.id as number)).toEqual(
        expect.objectContaining({ status: "applied", reason: null }),
      );
    });

    it("leaves a change not yet due, and keeps a change whose resolution failed", async () => {
      await plan("test.a");
      const due = await plan("test.b", new Date(Date.now() - 60_000));

      await expect(
        changes.resolveDue(new Date(), async () => {
          throw new Error("database down");
        }),
      ).rejects.toThrow("database down");
      expect((await changes.findById(due?.id as number))?.status).toBe(
        "scheduled",
      );

      expect(
        await changes.resolveDue(new Date(), async () => ({
          status: "conflict",
          reason: "changed by hand",
        })),
      ).toBe(1);
      expect(await changes.findById(due?.id as number)).toEqual(
        expect.objectContaining({
          status: "conflict",
          reason: "changed by hand",
        }),
      );
    });

    it("makes an edit wait while the change is being applied", async () => {
      const due = await plan("test.a", new Date(Date.now() - 60_000));
      let cancelled: unknown;
      await changes.resolveDue(new Date(), async () => {
        // Sent while the row is held: it waits, then finds it applied
        cancelled = changes.cancel(due?.id as number, "admin");
        await new Promise((done) => {
          setTimeout(done, 50);
        });
        return { status: "applied", reason: null };
      });

      expect(await cancelled).toBeNull();
      expect((await changes.findById(due?.id as number))?.status).toBe(
        "applied",
      );
    });
  },
);
