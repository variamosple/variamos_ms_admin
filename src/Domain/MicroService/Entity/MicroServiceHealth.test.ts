import { isRunning, resolveServiceStatus } from "./MicroServiceHealth.js";

const running = { state: "running" };
const exited = { state: "exited" };

describe("resolveServiceStatus (EV-106)", () => {
  it("shows NO_DATA for a running container never checked, never UP", () => {
    expect(resolveServiceStatus([running])).toBe("NO_DATA");
  });

  it.each(["UP", "DEGRADED", "DOWN"] as const)(
    "shows the last persisted check (%s) of a running container",
    (check) => {
      expect(resolveServiceStatus([exited, running], check)).toBe(check);
    },
  );

  it("shows DOWN for a stopped container, whatever its last check said", () => {
    expect(resolveServiceStatus([exited], "UP")).toBe("DOWN");
  });

  it("shows the last check of a service without a container, DOWN without one", () => {
    expect(resolveServiceStatus([], "UP")).toBe("UP");
    expect(resolveServiceStatus([])).toBe("DOWN");
  });
});

describe("isRunning", () => {
  it("needs at least one running container", () => {
    expect(isRunning([exited, running])).toBe(true);
    expect(isRunning([exited])).toBe(false);
    expect(isRunning([])).toBe(false);
  });
});
