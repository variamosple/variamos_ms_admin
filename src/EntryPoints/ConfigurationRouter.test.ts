import express from "express";
import supertest from "supertest";
import configurationV1Router from "./ConfigurationRouter";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { Menu } from "@src/Domain/Menu/Entity/Menu";

interface MenuApiResponse {
  data: Menu;
}

describe("ConfigurationRouter Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/v1/configurations", configurationV1Router);
  });

  describe("GET /v1/configurations/menu", () => {
    it("should return 200 and the configurations menu", async () => {
      const response = await supertest(app).get("/v1/configurations/menu");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as MenuApiResponse;
      expect(body.data).toBeDefined();
      expect(body.data.items).toBeDefined();
      expect(body.data.items.length).toBeGreaterThan(0);
    });
  });
});
