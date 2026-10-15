import { isMonitoredContainer } from "./MicroServiceRepository.js";

describe("isMonitoredContainer", () => {
  test("accepts a container that explicitly opts in", () => {
    expect(isMonitoredContainer({ "variamos.service.monitored": "true" })).toBe(
      true,
    );
  });

  test("rejects a compose container without the monitored label, even with a variamos name", () => {
    expect(
      isMonitoredContainer({
        "com.docker.compose.service": "variamos-web",
        "com.docker.compose.project": "variamos_main",
      }),
    ).toBe(false);
  });

  test("rejects a container whose monitored label is not true", () => {
    expect(
      isMonitoredContainer({ "variamos.service.monitored": "false" }),
    ).toBe(false);
  });

  test("rejects a container without labels", () => {
    expect(isMonitoredContainer({})).toBe(false);
  });
});
