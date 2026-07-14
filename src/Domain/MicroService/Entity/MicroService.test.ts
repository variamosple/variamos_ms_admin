import { MicroService } from "./MicroService";

describe("MicroService Entity - Unit Tests", () => {
  const validCreated = new Date();
  const validLabels = { app: "gateway" };

  it("should build a MicroService successfully using builder and constructor", () => {
    const service1 = new MicroService(
      "service-1",
      ["gateway"],
      validCreated,
      validLabels,
      "running",
      "up",
    );

    expect(service1.getId()).toBe("service-1");
    expect(service1.getNames()).toEqual(["gateway"]);
    expect(service1.getCreated()).toBe(validCreated);
    expect(service1.getLabels()).toBe(validLabels);
    expect(service1.getState()).toBe("running");
    expect(service1.getStatus()).toBe("up");

    const builder = MicroService.builder()
      .setId("service-2")
      .setNames(["auth"])
      .setCreated(validCreated)
      .setLabels(validLabels)
      .setState("stopped")
      .setStatus("down");

    expect(builder.getId()).toBe("service-2");
    expect(builder.getNames()).toEqual(["auth"]);
    expect(builder.getCreated()).toBe(validCreated);
    expect(builder.getLabels()).toBe(validLabels);
    expect(builder.getState()).toBe("stopped");
    expect(builder.getStatus()).toBe("down");

    const service2 = builder.build();
    expect(service2.getId()).toBe("service-2");
    expect(service2.getNames()).toEqual(["auth"]);
    expect(service2.getState()).toBe("stopped");
    expect(service2.getStatus()).toBe("down");

    const service3 = MicroService.build(builder);
    expect(service3.getId()).toBe("service-2");
    expect(service3.getNames()).toEqual(["auth"]);
  });

  it("should throw an error for empty ID", () => {
    expect(
      () => new MicroService("", ["gateway"], validCreated, validLabels, "running", "up"),
    ).toThrow("Microservice ID is required.");
  });

  it("should throw an error for empty names list", () => {
    expect(() => new MicroService("s1", [], validCreated, validLabels, "running", "up")).toThrow(
      "Microservice names must be a non-empty list of non-empty strings.",
    );
    expect(() => new MicroService("s1", [""], validCreated, validLabels, "running", "up")).toThrow(
      "Microservice names must be a non-empty list of non-empty strings.",
    );
  });

  it("should throw an error for empty state", () => {
    expect(() => new MicroService("s1", ["gateway"], validCreated, validLabels, "", "up")).toThrow(
      "Microservice state is required.",
    );
  });

  it("should throw an error for empty status", () => {
    expect(
      () => new MicroService("s1", ["gateway"], validCreated, validLabels, "running", ""),
    ).toThrow("Microservice status is required.");
  });
});
