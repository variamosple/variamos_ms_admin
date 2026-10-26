import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import VARIAMOS_ORM from "#src/Infrastructure/VariamosORM.js";
import { MetricsRepositoryImpl } from "./MetricsRepository.js";

vi.mock("jet-logger");

const definitionsWith = (visits: number) => [
  {
    data: [
      {
        id: "visitsByDay",
        title: "Visits by day",
        chartType: "line",
        defaultFilter: "week",
        filters: ["week"],
        labelKey: "day",
        data: { visits },
      },
    ],
  },
];

/** The dashboard metrics are read from the database at each request. */
describe("MetricsRepositoryImpl.getMetrics", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("reads nothing when built, then today's figures at each request", async () => {
    const query = vi
      .spyOn(VARIAMOS_ORM, "query")
      .mockResolvedValueOnce(definitionsWith(3) as never)
      .mockResolvedValueOnce(definitionsWith(5) as never);

    const repository = new MetricsRepositoryImpl();
    expect(query).not.toHaveBeenCalled();

    const first = await repository.getMetrics(new RequestModel("t"));
    const second = await repository.getMetrics(new RequestModel("t"));

    expect(first.data?.[0].getData()).toEqual({ visits: 3 });
    expect(second.data?.[0].getData()).toEqual({ visits: 5 });
  });

  it("answers a system error when the database cannot be read", async () => {
    vi.spyOn(VARIAMOS_ORM, "query").mockRejectedValue(new Error("down"));

    const response = await new MetricsRepositoryImpl().getMetrics(
      new RequestModel("t"),
    );

    expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
  });
});
