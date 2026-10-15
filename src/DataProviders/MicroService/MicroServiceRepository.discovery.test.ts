import {
  containerIpsOf,
  isMonitoredContainer,
} from "./MicroServiceRepository.js";

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

describe("containerIpsOf", () => {
  test("returns the IP of the container on every network", () => {
    expect(
      containerIpsOf({
        NetworkSettings: {
          Networks: {
            "net-a": { IPAddress: "172.19.0.8" },
            "net-b": { IPAddress: "172.20.0.3" },
          },
        },
      }),
    ).toEqual(["172.19.0.8", "172.20.0.3"]);
  });

  test("skips networks without an address", () => {
    expect(
      containerIpsOf({
        NetworkSettings: { Networks: { host: { IPAddress: "" } } },
      }),
    ).toEqual([]);
  });

  test("returns no IP when the container has no network settings", () => {
    expect(containerIpsOf({})).toEqual([]);
  });
});
