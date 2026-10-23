import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ActivityEntry } from "./ActivityEntry.js";
import { withJournal } from "./withJournal.js";

const recorded = () => {
  const entries: ActivityEntry[] = [];
  return {
    entries,
    journal: {
      record: async (entry: ActivityEntry) => {
        entries.push(entry);
      },
    },
  };
};

const description = {
  actorId: "admin-1",
  action: "role.update",
  entityType: "role",
  entityId: 7,
  before: { name: "Old" },
  after: { name: "New" },
  transactionId: "updateRole",
};

describe("withJournal", () => {
  it("records a success with its values, once", async () => {
    const { entries, journal } = recorded();

    const response = await withJournal(
      journal,
      description,
      async () => new ResponseModel<void>("updateRole"),
    );

    expect(response.errorCode).toBeUndefined();
    expect(entries).toEqual([
      {
        actorId: "admin-1",
        action: "role.update",
        entityType: "role",
        entityId: "7",
        outcome: "success",
        errorCode: null,
        before: { name: "Old" },
        after: { name: "New" },
        transactionId: "updateRole",
      },
    ]);
  });

  it("records a refusal as failed, with its code", async () => {
    const { entries, journal } = recorded();

    await withJournal(journal, description, async () =>
      new ResponseModel<void>("updateRole").withError(
        DomainErrorCodes.FORBIDDEN,
        "No.",
      ),
    );

    expect(entries[0]).toMatchObject({
      outcome: "failed",
      errorCode: DomainErrorCodes.FORBIDDEN,
    });
  });

  it("records an exception as SYSTEM_ERROR and throws it again", async () => {
    const { entries, journal } = recorded();
    const failure = new Error("connection lost");

    await expect(
      withJournal(journal, description, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(entries[0]).toMatchObject({
      outcome: "failed",
      errorCode: DomainErrorCodes.SYSTEM_ERROR,
    });
  });

  it("completes the entry from the answer of a success only", async () => {
    const { entries, journal } = recorded();
    const complete = (response: ResponseModel<{ id: number }>) => ({
      entityId: response.data?.id,
    });

    await withJournal(
      journal,
      { action: "role.create", entityType: "role" },
      async () =>
        new ResponseModel<{ id: number }>("createRole").withResponse({ id: 9 }),
      complete,
    );
    await withJournal(
      journal,
      { action: "role.create", entityType: "role" },
      async () =>
        new ResponseModel<{ id: number }>("createRole").withError(
          DomainErrorCodes.DUPLICATE_ENTITY,
          "Exists.",
        ),
      complete,
    );

    expect(entries.map((e) => e.entityId)).toEqual(["9", null]);
    expect(entries[0].actorId).toBeNull();
  });
});
