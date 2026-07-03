/* eslint-disable @typescript-eslint/unbound-method */
/* eslint-disable node/no-process-env */
process.env.HOME_REDIRECT_URI = "http://localhost:3000";
process.env.LOGIN_REDIRECT_URI = "http://localhost:3000/login";
process.env.COOKIE_EXP_IN_MS = "3600000"; // 1 hour for session validation to prevent immediate expiration

import express from "express";
import supertest from "supertest";
import cookieParser from "cookie-parser";
import authRouter from "./AuthRouter";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { User } from "@src/Domain/User/Entity/User";
import {
  getToken,
  validateToken,
  isSessionExpired,
  sessionInfoToSessionUser,
  createJwt,
  SessionInfo,
} from "@variamosple/variamos-security";

interface CustomRequest {
  user?: { id: string; aud: string };
}

// Mock the dependencies
jest.mock("@src/Domain/User/UserUseCases");
jest.mock("@variamosple/variamos-security", () => ({
  getToken: jest.fn(),
  validateToken: jest.fn(),
  isSessionExpired: jest.fn(),
  sessionInfoToSessionUser: jest.fn(),
  createJwt: jest.fn(),
  hasPermissions: () => (req: express.Request, _res: express.Response, next: () => void) => {
    (req as CustomRequest).user = { id: "user-123", aud: "localhost" };
    next();
  },
}));

interface SessionUserMock {
  id: string;
  name: string;
  user: string;
  email: string;
}

interface TestSessionApiResponse {
  data: {
    user: SessionUserMock;
  };
}

describe("AuthRouter Integration Tests", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser("secret")); // Setup cookie-parser to resolve req.cookies.redirectTo
    app.use("/auth", authRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /auth/session-info", () => {
    it("should return 200 and session details if valid", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new ResponseModel<SessionInfo>("getSessionInfo").withResponse(
        mockUserPayload,
      );
      const sessionUser = {
        id: "user-123",
        name: "John Doe",
        user: "john",
        email: "john@example.com",
      };

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(false);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as TestSessionApiResponse;
      expect(body.data.user).toEqual(sessionUser);
    });

    it("should return 401 if session is expired", async () => {
      const mockToken = "expired-token";
      const mockUserPayload = { sub: "user-123", exp: 1000, iat: 1000 } as SessionInfo;
      const validationResponse = new ResponseModel<SessionInfo>("getSessionInfo").withResponse(
        mockUserPayload,
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });
  });

  describe("POST /auth/sign-in", () => {
    it("should return 200 and set cookie on successful sign in", async () => {
      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel("signIn").withResponse(mockUser);

      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      (UsersUseCases.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeDefined();
      expect(UsersUseCases.prototype.signIn).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /auth/sign-up", () => {
    it("should return 200 on successful sign up", async () => {
      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel("signUp").withResponse(mockUser);

      (UsersUseCases.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.OK);
    });
  });

  describe("POST /auth/logout", () => {
    it("should clear authToken cookie and return 200", async () => {
      const response = await supertest(app).post("/auth/logout");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("POST /auth/guest/sign-in", () => {
    it("should return 200 and set cookie on guest sign in", async () => {
      const mockUser = User.builder().setId("guest-123").setName("Guest").build();
      const expectedResponse = new ResponseModel("signInAsGuest").withResponse(mockUser);

      jest.mocked(createJwt).mockResolvedValue("guest-jwt-token");
      (UsersUseCases.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/guest/sign-in")
        .send({ guestId: "guest-123" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeDefined();
    });
  });

  describe("PUT /auth/password-update", () => {
    it("should return 200 on successful password update", async () => {
      const expectedResponse = new ResponseModel("passwordUpdate").withResponse(null);

      (UsersUseCases.prototype.updatePassword as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/auth/password-update").send({
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
        passwordConfirmation: "NewPassword123!",
      });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UsersUseCases.prototype.updatePassword).toHaveBeenCalledTimes(1);
    });
  });

  describe("POST /auth/forgot-password", () => {
    it("should return 200 and forgotPasswordResponse on success", async () => {
      const expectedResponse = new ResponseModel(
        "forgotPassword",
        undefined,
        "Password reset email sent",
      ).withResponse(null);
      (UsersUseCases.prototype.requestPasswordReset as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "test@example.com" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body).toEqual({
        transactionId: "forgotPassword",
        message: "Password reset email sent",
        data: null,
      });
    });
  });

  describe("GET /auth/verify-token", () => {
    it("should return 200 and verifyResponse on success", async () => {
      const expectedResponse = new ResponseModel(
        "verifyToken",
        undefined,
        "Token verified",
      ).withResponse(null);
      (UsersUseCases.prototype.verifyPasswordResetToken as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "valid-token" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body).toEqual({
        transactionId: "verifyToken",
        message: "Token verified",
        data: null,
      });
    });
  });

  describe("POST /auth/reset-password", () => {
    it("should return 200 and resetResponse on success", async () => {
      const expectedResponse = new ResponseModel(
        "resetPassword",
        undefined,
        "Password updated successfully",
      ).withResponse(null);
      (UsersUseCases.prototype.resetPassword as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "valid-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body).toEqual({
        transactionId: "resetPassword",
        message: "Password updated successfully",
        data: null,
      });
    });
  });
});
