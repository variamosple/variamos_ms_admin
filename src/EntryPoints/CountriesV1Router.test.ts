import express from "express";
import supertest from "supertest";
import { createCountriesRouter } from "./CountriesV1Router";
import { CountriesUseCases } from "@src/Domain/Countries/CountriesUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

import { mock } from "jest-mock-extended";

// Mock dependencies
jest.mock("@src/Domain/Countries/CountriesUseCases");
jest.mock("@variamosple/variamos-security", () => ({
  isAuthenticated: (_req: unknown, _res: unknown, next: () => void) => {
    next();
  },
}));

interface CountriesApiResponse {
  data: string[];
}

import { ICountriesRepository } from "@src/Domain/Countries/Repository/ICountriesRepository";

describe("CountriesV1Router Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    const mockCountriesUseCases = new CountriesUseCases(mock<ICountriesRepository>());
    app.use("/v1/countries", createCountriesRouter(mockCountriesUseCases));
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /v1/countries", () => {
    it("should return 200 and list of countries on success", async () => {
      const mockCountries = ["Colombia", "France", "Spain"];
      const expectedResponse = new ResponseModel("getCountries").withResponse(mockCountries);

      (CountriesUseCases.prototype.getCountries as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/v1/countries");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as CountriesApiResponse;
      expect(body.data).toEqual(mockCountries);
      expect(CountriesUseCases.prototype.getCountries).toHaveBeenCalledTimes(1);
    });

    it("should return 500 when CountriesUseCases throws an exception", async () => {
      (CountriesUseCases.prototype.getCountries as jest.Mock).mockRejectedValue(
        new Error("Database error"),
      );

      const response = await supertest(app).get("/v1/countries");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });
});
