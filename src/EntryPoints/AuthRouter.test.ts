process.env.HOME_REDIRECT_URI = "http://localhost:3000";
process.env.LOGIN_REDIRECT_URI = "http://localhost:3000/login";

import express from "express";
import supertest from "supertest";
import authRouter from "./AuthRouter";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";

jest.mock("@src/Domain/User/UserUseCases");

describe("AuthRouter Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use("/auth", authRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /auth/forgot-password", () => {
    it("should return 200 and forgotPasswordResponse on success", async () => {
      const expectedResponse = new ResponseModel(
        "forgotPassword",
        undefined,
        "Password reset email sent",
      ).withResponse(null);
      (
        UsersUseCases.prototype.requestPasswordReset as jest.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "test@example.com" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body).toEqual({
        transactionId: "forgotPassword",
        message: "Password reset email sent",
        data: null,
      });
      expect(
        UsersUseCases.prototype.requestPasswordReset,
      ).toHaveBeenCalledTimes(1);
    });

    it("should return the error code returned by the usecase on failure", async () => {
      const expectedResponse = new ResponseModel("forgotPassword").withError(
        HttpStatusCodes.BAD_REQUEST,
        "User not found",
      );
      (
        UsersUseCases.prototype.requestPasswordReset as jest.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "invalid@example.com" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body).toEqual({
        transactionId: "forgotPassword",
        errorCode: HttpStatusCodes.BAD_REQUEST,
        message: "User not found",
      });
    });

    it("should return 500 when the usecase throws an exception", async () => {
      (
        UsersUseCases.prototype.requestPasswordReset as jest.Mock
      ).mockRejectedValue(new Error("Database connection failure"));

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "error@example.com" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.transactionId).toBe("forgotPassword");
      expect(response.body.errorCode).toBe(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
      );
      expect(response.body.message).toBe(
        "Forgot password error. Please try again later.",
      );
    });
  });

  describe("GET /auth/verify-token", () => {
    it("should return 200 and verifyResponse on success", async () => {
      const expectedResponse = new ResponseModel(
        "verifyToken",
        undefined,
        "Token verified",
      ).withResponse(null);
      (
        UsersUseCases.prototype.verifyPasswordResetToken as jest.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "valid-token" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body).toEqual({
        transactionId: "verifyToken",
        message: "Token verified",
        data: null,
      });
      expect(
        UsersUseCases.prototype.verifyPasswordResetToken,
      ).toHaveBeenCalledTimes(1);
    });

    it("should return the error code returned by the usecase on failure", async () => {
      const expectedResponse = new ResponseModel("verifyToken").withError(
        HttpStatusCodes.BAD_REQUEST,
        "Token expired",
      );
      (
        UsersUseCases.prototype.verifyPasswordResetToken as jest.Mock
      ).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "expired-token" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body).toEqual({
        transactionId: "verifyToken",
        errorCode: HttpStatusCodes.BAD_REQUEST,
        message: "Token expired",
      });
    });

    it("should return 500 when the usecase throws an exception", async () => {
      (
        UsersUseCases.prototype.verifyPasswordResetToken as jest.Mock
      ).mockRejectedValue(new Error("Unexpected error"));

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "some-token" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.transactionId).toBe("verifyToken");
      expect(response.body.errorCode).toBe(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
      );
      expect(response.body.message).toBe("Token verification error.");
    });
  });

  describe("POST /auth/reset-password", () => {
    it("should return 200 and resetResponse on success", async () => {
      const expectedResponse = new ResponseModel(
        "resetPassword",
        undefined,
        "Password updated successfully",
      ).withResponse(null);
      (UsersUseCases.prototype.resetPassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "valid-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body).toEqual({
        transactionId: "resetPassword",
        message: "Password updated successfully",
        data: null,
      });
      expect(UsersUseCases.prototype.resetPassword).toHaveBeenCalledTimes(1);
    });

    it("should return the error code returned by the usecase on failure", async () => {
      const expectedResponse = new ResponseModel("resetPassword").withError(
        HttpStatusCodes.BAD_REQUEST,
        "Invalid token",
      );
      (UsersUseCases.prototype.resetPassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "invalid-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
      expect(response.body).toEqual({
        transactionId: "resetPassword",
        errorCode: HttpStatusCodes.BAD_REQUEST,
        message: "Invalid token",
      });
    });

    it("should return 500 when the usecase throws an exception", async () => {
      (UsersUseCases.prototype.resetPassword as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "some-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.transactionId).toBe("resetPassword");
      expect(response.body.errorCode).toBe(
        HttpStatusCodes.INTERNAL_SERVER_ERROR,
      );
      expect(response.body.message).toBe(
        "Reset password error. Please try again later.",
      );
    });
  });
});
