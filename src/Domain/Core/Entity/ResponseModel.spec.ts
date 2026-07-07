import { ResponseModel } from "./ResponseModel";

describe("ResponseModel Entity", () => {
  it("should support helper promise wrappers not covered elsewhere", async () => {
    const res = new ResponseModel<string>("tx-123");

    // Test withResponsePromise
    await res.withResponsePromise("async-data", 8);
    expect(res.data).toBe("async-data");
    expect(res.totalCount).toBe(8);

    // Test copyErrorWithPromise
    const errorSource = new ResponseModel<unknown>("tx-source").withError(
      "ERR_SOURCE",
      "Source message",
    );
    await res.copyErrorWithPromise(errorSource);
    expect(res.errorCode).toBe("ERR_SOURCE");
    expect(res.message).toBe("Source message");
  });
});
