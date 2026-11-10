import jetLogger from "jet-logger";
import logger from "./logger.js";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes an error as its name and message, never its details", () => {
    const err = vi.spyOn(jetLogger, "err").mockImplementation(() => {});
    const error = Object.assign(new Error("Request failed"), {
      config: { headers: { "x-internal-token": "secret-token" } },
    });

    logger.err(error);

    expect(err).toHaveBeenCalledWith("Error: Request failed");
    expect(String(err.mock.calls[0])).not.toContain("secret-token");
  });

  it("writes an object as text, not its fields", () => {
    const warn = vi.spyOn(jetLogger, "warn").mockImplementation(() => {});

    logger.warn({ password: "hunter2" });

    expect(warn).toHaveBeenCalledWith("[object Object]");
  });

  it.each(["info", "imp"] as const)("passes %s text through", (level) => {
    const write = vi.spyOn(jetLogger, level).mockImplementation(() => {});

    logger[level]("Server started");

    expect(write).toHaveBeenCalledWith("Server started");
  });
});
