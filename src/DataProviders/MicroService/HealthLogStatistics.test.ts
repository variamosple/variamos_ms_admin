import { Op, type Sequelize } from "sequelize";
import { HealthLogStatistics } from "./HealthLogStatistics.js";
import { MicroServiceHealthLogModel } from "./MicroServiceHealthLogModel.js";

describe("HealthLogStatistics.purgeChecksBefore", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("deletes only the checks made before the cutoff", async () => {
    const destroy = vi
      .spyOn(MicroServiceHealthLogModel, "destroy")
      .mockResolvedValue(2880);
    const cutoff = new Date("2026-09-25T09:30:00.000Z");

    const purged = await new HealthLogStatistics(
      {} as Sequelize,
      "variamos",
    ).purgeChecksBefore(cutoff);

    expect(destroy.mock.calls[0]?.[0]?.where).toEqual({
      checkedAt: { [Op.lt]: cutoff },
    });
    expect(purged).toBe(2880);
  });
});
