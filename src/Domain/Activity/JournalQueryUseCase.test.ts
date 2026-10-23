import { mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IJournalReader } from "./JournalQuery.js";
import {
  type JournalQueryInput,
  JournalQueryUseCase,
} from "./JournalQueryUseCase.js";

const NOW = new Date("2026-10-23T12:00:00.000Z");

const setUp = () => {
  const reader = mock<IJournalReader>();
  reader.queryActivity.mockResolvedValue({ rows: [], total: 0 });
  reader.queryAccess.mockResolvedValue({ rows: [], total: 0 });
  return { reader, useCase: new JournalQueryUseCase(reader, () => NOW) };
};

const request = (input: JournalQueryInput) =>
  new RequestModel<JournalQueryInput>("query", input);

describe("reading the journals (T-24 lot 3)", () => {
  it("reads the last seven days, first page of fifty, by default", async () => {
    const { reader, useCase } = setUp();

    await useCase.queryActivity(request({}));

    expect(reader.queryActivity).toHaveBeenCalledWith({
      from: new Date("2026-10-16T12:00:00.000Z"),
      to: NOW,
      user: null,
      outcome: null,
      pageNumber: 1,
      pageSize: 50,
      action: null,
      entityType: null,
      entityId: null,
    });
  });

  it("passes every filter of the access journal", async () => {
    const { reader, useCase } = setUp();

    await useCase.queryAccess(
      request({
        from: "2026-10-01T00:00:00.000Z",
        to: "2026-10-02T00:00:00.000Z",
        user: " ana ",
        outcome: "failed",
        event: "sign-in",
        reason: "locked",
        ip: "203.0.113.7",
        pageNumber: "3",
        pageSize: "100",
      }),
    );

    expect(reader.queryAccess).toHaveBeenCalledWith({
      from: new Date("2026-10-01T00:00:00.000Z"),
      to: new Date("2026-10-02T00:00:00.000Z"),
      user: "ana",
      outcome: "failed",
      event: "sign-in",
      reason: "locked",
      ip: "203.0.113.7",
      pageNumber: 3,
      pageSize: 100,
    });
  });

  it("answers the page with the total count", async () => {
    const { reader, useCase } = setUp();
    reader.queryActivity.mockResolvedValue({
      rows: [{ id: "1" } as never],
      total: 120,
    });

    const response = await useCase.queryActivity(request({}));

    expect(response.errorCode).toBeUndefined();
    expect(response.data).toEqual([{ id: "1" }]);
    expect(response.totalCount).toBe(120);
  });

  it.each([
    ["a page size over the maximum", { pageSize: "101" }],
    ["a page number of zero", { pageNumber: "0" }],
    ["a page number that is not a number", { pageNumber: "two" }],
    ["a start that is not a date", { from: "yesterday" }],
    [
      "a start after the end",
      { from: "2026-10-05T00:00:00Z", to: "2026-10-01T00:00:00Z" },
    ],
    ["an unknown outcome", { outcome: "maybe" }],
    ["an unknown access event", { event: "sign-out" }],
    ["a repeated parameter", { user: ["a", "b"] }],
    ["a text too long", { ip: "x".repeat(256) }],
  ])("refuses %s without reading", async (_, input) => {
    const { reader, useCase } = setUp();

    const response = await useCase.queryAccess(request(input));

    expect(response.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    expect(reader.queryAccess).not.toHaveBeenCalled();
  });

  it("lets a read failure reach the route, which answers 500", async () => {
    const { reader, useCase } = setUp();
    reader.queryActivity.mockRejectedValue(new Error("down"));

    await expect(useCase.queryActivity(request({}))).rejects.toThrow("down");
  });
});
