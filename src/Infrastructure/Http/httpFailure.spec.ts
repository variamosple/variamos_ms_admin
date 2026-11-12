import { describe, expect, it } from "vitest";
import { httpFailure, httpFailureMessage, httpStatus } from "./httpFailure.js";

const failed = (response: unknown) =>
  Object.assign(new Error("Request failed"), { response });

describe("httpStatus", () => {
  it("reads the status of the response", () => {
    expect(httpStatus(failed({ status: 404 }))).toBe(404);
    expect(httpStatus({ response: { status: 403 } })).toBe(403);
  });

  it("is undefined without a response", () => {
    expect(httpStatus(new Error("timeout"))).toBeUndefined();
    expect(httpStatus({ response: "text" })).toBeUndefined();
    expect(httpStatus(null)).toBeUndefined();
  });
});

describe("httpFailure", () => {
  it("gives the response body when there is one", () => {
    expect(httpFailure(failed({ data: { message: "Bad" } }))).toEqual({
      message: "Bad",
    });
  });

  it("falls back on the error message, then on a fixed text", () => {
    expect(httpFailure(failed({ data: "" }))).toBe("Request failed");
    expect(httpFailure("")).toBe("Unknown error");
  });
});

describe("httpFailureMessage", () => {
  it("gives the message field of the body", () => {
    expect(httpFailureMessage(failed({ data: { message: "Not Found" } }))).toBe(
      "Not Found",
    );
  });

  it("falls back on the error message when the body has no text message", () => {
    expect(httpFailureMessage(failed({ data: { message: 3 } }))).toBe(
      "Request failed",
    );
    expect(httpFailureMessage("refused")).toBe("refused");
    expect(httpFailureMessage("")).toBe("Unknown error");
  });
});
