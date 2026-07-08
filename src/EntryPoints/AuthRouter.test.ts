// Mock google-auth-library as a standard class to bypass Jest resetMocks: true
jest.mock("google-auth-library", () => {
  return {
    OAuth2Client: class {
      public verifyIdToken({ idToken }: { idToken: string }) {
        if (idToken === "invalid-token") {
          return Promise.reject(new Error("Invalid ID token"));
        }
        return Promise.resolve({
          getPayload: () => {
            if (idToken === "empty-payload-token") {
              return undefined;
            }
            return {
              name: "John Doe",
              email: "john@example.com",
            };
          },
        });
      }
    },
  };
});

import express from "express";
import supertest from "supertest";
import EnvVars from "@src/common/EnvVars";
import cookieParser from "cookie-parser";
import authRouter, { AUTH_ROUTE } from "./AuthRouter";
import { UsersUseCases } from "@src/Domain/User/UserUseCases";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import HttpStatusCodes from "@src/common/HttpStatusCodes";
import { User } from "@src/Domain/User/Entity/User";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes";
import {
  getToken,
  validateToken,
  isSessionExpired,
  sessionInfoToSessionUser,
  createJwt,
  SessionInfo,
  ResponseModel as SecurityResponseModel,
} from "@variamosple/variamos-security";

// Mock other dependencies
jest.mock("@src/Domain/User/UserUseCases");
jest.mock("@variamosple/variamos-security", () => {
  const actual = jest.requireActual("@variamosple/variamos-security");
  return {
    ...actual,
    getToken: jest.fn(),
    validateToken: jest.fn(),
    isSessionExpired: jest.fn(),
    sessionInfoToSessionUser: jest.fn(),
    createJwt: jest.fn(),
    hasPermissions:
      () => (req: express.Request, res: express.Response, next: express.NextFunction) => {
        req.user = {
          id: "user-123",
          name: "John Doe",
          email: "john@example.com",
          user: "john",
          roles: ["guest"],
          permissions: ["my-account::query", "my-account::update"],
        };
        next();
      },
  };
});

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

function parseCookies(response: supertest.Response): string[] {
  const rawCookies = response.headers["set-cookie"] as string | string[] | undefined;
  if (!rawCookies) {
    return [];
  }
  return Array.isArray(rawCookies) ? rawCookies : [rawCookies];
}

describe("AuthRouter Integration Tests - Fixed OAuth Mocks", () => {
  let app: express.Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(cookieParser("secret"));
    app.use(AUTH_ROUTE, authRouter);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("AUTH_ROUTE Constant", () => {
    it("should be exactly /auth", () => {
      expect(AUTH_ROUTE).toBe("/auth");
    });
  });

  describe("GET /auth/session-info", () => {
    it("should return 200 and session details if valid", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
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

    it("should return error code if validationResponse has error", async () => {
      const validationResponse = new SecurityResponseModel<SessionInfo>("getSessionInfo").withError(
        HttpStatusCodes.UNAUTHORIZED,
        "Invalid Token",
      );
      jest.mocked(getToken).mockReturnValue("bad-token");
      jest.mocked(validateToken).mockResolvedValue(validationResponse);

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it("should return 401 if session is expired", async () => {
      const mockToken = "expired-token";
      const mockUserPayload = { sub: "user-123", exp: 1000, iat: 1000 } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it("should return 401 if user is missing iat during expired check", async () => {
      const mockUserPayload = { sub: "user-123", exp: 1000 } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);

      jest.mocked(getToken).mockReturnValue("expired-token-no-iat");
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it("should return 401 when session-info logic throws an exception (AuthRouter handles this as 401)", async () => {
      jest.mocked(getToken).mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it("should handle external allowed redirect origin and set secure SameSite none cookie", async () => {
      // Mock AllowedOrigins to authorize allowed-origin.com
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        aud: "allowed-origin.com",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
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

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Cookie", ["redirectTo=http://allowed-origin.com/dashboard"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      const cookies = parseCookies(response);
      expect(cookies.some((c) => c.includes("redirectTo=;"))).toBe(true);
      expect(cookies.some((c) => c.includes("SameSite=None") && c.includes("Secure"))).toBe(true);

      // Restore AllowedOrigins
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should allow data URLs with null origin in getRedirectUrl", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        aud: "allowed-origin.com",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
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

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Cookie", ["redirectTo=data:text/html,Hello"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as TestSessionApiResponse & { data: { redirect?: string } };
      expect(body.data.redirect).toBe("data:text/html,Hello");
    });

    it("should handle invalid url throwing error in getUrl and return undefined redirect", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
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

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Cookie", ["redirectTo=not-a-valid-url"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as TestSessionApiResponse & { data: { redirect?: string } };
      expect(body.data.redirect).toBeUndefined();
    });

    it("should handle session user payload with missing roles defaulting to empty array", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);

      const mockDomainUser = User.builder()
        .setId("user-123")
        .setName("John Doe")
        .setUser("john")
        .setEmail("john@example.com")
        .setRoles([])
        .setPermissions([])
        .build();

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      (UsersUseCases.prototype.findSessionUser as jest.Mock).mockResolvedValue(
        new ResponseModel<User>("getSessionInfo").withResponse(mockDomainUser),
      );

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UsersUseCases.prototype.findSessionUser).toHaveBeenCalled();
    });

    it("should ignore disallowed redirect origin", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
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

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Cookie", ["redirectTo=http://disallowed-origin.com/dashboard"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should handle local redirect origin and not set SameSite none or append token", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
      const sessionUser = {
        id: "user-123",
        name: "John Doe",
        user: "john",
        email: "john@example.com",
      };
      const refreshedResponse = new ResponseModel("getSessionInfo").withResponse(
        User.builder().setId("user-123").setName("John Doe").build(),
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UsersUseCases.prototype.findSessionUser as jest.Mock).mockResolvedValue(refreshedResponse);
      jest.mocked(createJwt).mockResolvedValue("new-jwt-token");

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Cookie", ["redirectTo=http://localhost:3000/dashboard"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as { data: { redirect: string; authToken?: string } };
      expect(body.data.redirect).toBe("http://localhost:3000/dashboard");
      // Local redirects must NOT expose the authToken in the body
      expect(body.data.authToken).toBeUndefined();

      const cookies = parseCookies(response);

      // The refreshed authToken cookie must have SameSite=Strict (not None)
      const authCookie = cookies.find((c) => c.includes("authToken="));
      expect(authCookie).toBeDefined();
      expect(authCookie?.includes("SameSite=Strict")).toBe(true);
    });

    it("should refresh guest user session successfully if guest role is found", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
        roles: ["guest"],
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
      const sessionUser = {
        id: "user-123",
        name: "Guest User",
        user: "guest",
        email: "guest@example.com",
        roles: ["guest"],
      };
      const refreshedResponse = new ResponseModel("getSessionInfo").withResponse(
        User.builder().setId("user-123").setName("Guest User").build(),
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UsersUseCases.prototype.getGuestData as jest.Mock).mockResolvedValue(refreshedResponse);

      const response = await supertest(app).get("/auth/session-info");
      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 401 if refreshedUser yields an errorCode", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
        roles: ["guest"],
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
      const sessionUser = {
        id: "user-123",
        name: "Guest User",
        user: "guest",
        email: "guest@example.com",
        roles: ["guest"],
      };
      const refreshedResponse = new ResponseModel("getSessionInfo").withError(
        HttpStatusCodes.UNAUTHORIZED.toString(),
        "Expired",
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UsersUseCases.prototype.getGuestData as jest.Mock).mockResolvedValue(refreshedResponse);

      const response = await supertest(app).get("/auth/session-info");
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it("should refresh standard user session successfully", async () => {
      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
        roles: ["admin"],
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
      const sessionUser = {
        id: "user-123",
        name: "Admin User",
        user: "admin",
        email: "admin@example.com",
        roles: ["admin"],
      };
      const refreshedResponse = new ResponseModel("getSessionInfo").withResponse(
        User.builder().setId("user-123").setName("Admin User").build(),
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UsersUseCases.prototype.findSessionUser as jest.Mock).mockResolvedValue(refreshedResponse);

      const response = await supertest(app).get("/auth/session-info");
      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return authToken in response body if session is refreshed and aud/origin are external", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const mockToken = "valid-token";
      const mockUserPayload = {
        sub: "user-123",
        aud: "allowed-origin.com",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
        roles: ["admin"],
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);
      const sessionUser = {
        id: "user-123",
        name: "Admin User",
        user: "admin",
        email: "admin@example.com",
        roles: ["admin"],
      };
      const refreshedResponse = new ResponseModel("getSessionInfo").withResponse(
        User.builder().setId("user-123").setName("Admin User").build(),
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UsersUseCases.prototype.findSessionUser as jest.Mock).mockResolvedValue(refreshedResponse);
      jest.mocked(createJwt).mockResolvedValue("new-refreshed-jwt-token");

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Origin", "http://allowed-origin.com")
        .set("Cookie", ["redirectTo=http://allowed-origin.com/dashboard"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as { data: { authToken: string } };
      expect(body.data.authToken).toBe("new-refreshed-jwt-token");

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
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
      const body = response.body as { data: { redirect: string } };
      expect(body.data.redirect).toBe("http://localhost:3000");

      const cookies = parseCookies(response);
      // Default SameSite must be Strict, and Max-Age/Expires must be present (maxAge = true)
      expect(cookies.some((c) => c.includes("SameSite=Strict"))).toBe(true);
      expect(cookies.some((c) => c.includes("Max-Age=") || c.includes("Expires="))).toBe(true);
      expect(cookies.some((c) => c.includes("Domain=localhost"))).toBe(true);
      expect(cookies.some((c) => c.includes("HttpOnly"))).toBe(true);
    });

    it("should return error status code when sign-in fails", async () => {
      const expectedResponse = new ResponseModel("signIn").withError(
        HttpStatusCodes.UNAUTHORIZED.toString(),
        "Invalid credentials",
      );
      (UsersUseCases.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "WrongPassword" });

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
    });

    it("should redirect to external allowed redirect origin on successful sign in", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel("signIn").withResponse(mockUser);

      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      (UsersUseCases.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/sign-in")
        .set("Cookie", ["redirectTo=http://allowed-origin.com/dashboard"])
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as { data: { redirect: string } };
      expect(body.data.redirect).toBe("http://allowed-origin.com/dashboard?authToken=jwt-token");

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should return 400 if email is missing", async () => {
      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 if password is missing", async () => {
      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 400 if body is completely empty", async () => {
      const response = await supertest(app)
        .post("/auth/sign-in")
        .set("Content-Type", "text/plain") // Bypass json parser
        .send("hello");

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when sign-in throws an exception", async () => {
      (UsersUseCases.prototype.signIn as jest.Mock).mockRejectedValue(
        new Error("Unexpected sign-in error"),
      );

      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR.toString());
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

    it("should return 200 with signup successful message even on conflict (already exists)", async () => {
      const expectedResponse = new ResponseModel("signUp").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "User already exists",
      );
      (UsersUseCases.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "already@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 400 when password and passwordConfirmation do not match", async () => {
      const expectedResponse = new ResponseModel("signUp").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Passwords do not match",
      );
      (UsersUseCases.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Mismatch123!",
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return internal status code on validation failure", async () => {
      const expectedResponse = new ResponseModel("signUp").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Invalid name",
      );
      (UsersUseCases.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when sign-up throws an exception", async () => {
      (UsersUseCases.prototype.signUp as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /auth/logout", () => {
    it("should clear authToken cookie and return 200", async () => {
      const response = await supertest(app).post("/auth/logout");

      expect(response.status).toBe(HttpStatusCodes.OK);
      const cookies = parseCookies(response);
      expect(cookies.some((c) => c.includes("authToken=;"))).toBe(true);
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

    it("should return error code when guest data retrieval fails", async () => {
      const expectedResponse = new ResponseModel("signInAsGuest").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Invalid guest id",
      );
      (UsersUseCases.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/guest/sign-in")
        .send({ guestId: "guest-invalid" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when guest sign-in throws an exception", async () => {
      (UsersUseCases.prototype.getGuestData as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/auth/guest/sign-in")
        .send({ guestId: "guest-123" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });

    it("should handle external allowed redirect origin on guest sign in", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const mockUser = User.builder().setId("guest-123").setName("Guest").build();
      const expectedResponse = new ResponseModel("signInAsGuest").withResponse(mockUser);

      jest.mocked(createJwt).mockResolvedValue("guest-jwt-token");
      (UsersUseCases.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/guest/sign-in")
        .set("Cookie", ["redirectTo=http://allowed-origin.com/dashboard"])
        .send({ guestId: "guest-123" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      const body = response.body as { data: { redirect: string } };
      expect(body.data.redirect).toBe(
        "http://allowed-origin.com/dashboard?authToken=guest-jwt-token",
      );

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });
  });

  describe("GET /auth/my-account", () => {
    it("should return 200 on successful fetch", async () => {
      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel("myAccount").withResponse(mockUser);
      (UsersUseCases.prototype.getMyAccount as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/auth/my-account");

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when getMyAccount throws an exception", async () => {
      (UsersUseCases.prototype.getMyAccount as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/auth/my-account");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /auth/my-account/information", () => {
    it("should return 200 on successful update", async () => {
      const expectedResponse = new ResponseModel("updateMyAccountInformation").withResponse(null);
      (UsersUseCases.prototype.updatePersonalInformation as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .put("/auth/my-account/information")
        .send({ countryCode: "FR" });

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when updatePersonalInformation throws an exception", async () => {
      (UsersUseCases.prototype.updatePersonalInformation as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .put("/auth/my-account/information")
        .send({ countryCode: "FR" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
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
    });

    it("should return 400 if validation or password parameters are invalid", async () => {
      const expectedResponse = new ResponseModel("passwordUpdate").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Invalid password",
      );
      (UsersUseCases.prototype.updatePassword as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).put("/auth/password-update").send({
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
        passwordConfirmation: "Mismatch",
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when updatePassword throws an exception", async () => {
      (UsersUseCases.prototype.updatePassword as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).put("/auth/password-update").send({
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
        passwordConfirmation: "NewPassword123!",
      });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /auth/google/callback", () => {
    it("should verify ID token, create session user, and return 302 redirect", async () => {
      const mockUser = User.builder()
        .setId("user-123")
        .setName("John Doe")
        .setEmail("john@example.com")
        .build();
      const expectedResponse = new ResponseModel("loginWithGoogle").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("google-jwt-token");
      (UsersUseCases.prototype.findOrCreateUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "mock-google-id-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("http://localhost:3000");
    });

    it("should redirect to login with error query param if findOrCreateUser fails", async () => {
      const expectedResponse = new ResponseModel("loginWithGoogle").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Creation failed",
      );
      (UsersUseCases.prototype.findOrCreateUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "mock-google-id-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("errorMessage=Creation%20failed");
    });

    it("should redirect to login if ticket verification throws an exception", async () => {
      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "invalid-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("errorMessage=Login%20error");
    });

    it("should redirect to login if ticket verification succeeds but payload is empty", async () => {
      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "empty-payload-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("errorMessage=Login%20error");
    });

    it("should handle external allowed redirect origin and append token to redirect location", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const mockUser = User.builder()
        .setId("user-123")
        .setName("John Doe")
        .setEmail("john@example.com")
        .build();
      const expectedResponse = new ResponseModel("loginWithGoogle").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("google-jwt-token");
      (UsersUseCases.prototype.findOrCreateUser as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/google/callback")
        .set("Cookie", ["redirectTo=http://allowed-origin.com/dashboard"])
        .send({ credential: "mock-google-id-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("http://localhost:3000");

      const cookies = parseCookies(response);
      // Ensure redirectTo is NOT cleared since remove=false
      expect(cookies.some((c) => c.includes("redirectTo=;"))).toBe(false);

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
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
    });

    it("should return error status code when requestPasswordReset fails", async () => {
      const expectedResponse = new ResponseModel("forgotPassword").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Email not found",
      );
      (UsersUseCases.prototype.requestPasswordReset as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "notfound@example.com" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when forgot-password throws an exception", async () => {
      (UsersUseCases.prototype.requestPasswordReset as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "test@example.com" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
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
    });

    it("should return error status code when token verification fails", async () => {
      const expectedResponse = new ResponseModel("verifyToken").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Token expired",
      );
      (UsersUseCases.prototype.verifyPasswordResetToken as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "expired-token" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when verify-token throws an exception", async () => {
      (UsersUseCases.prototype.verifyPasswordResetToken as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/auth/verify-token").query({ token: "token" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
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
    });

    it("should return error status code when resetPassword fails", async () => {
      const expectedResponse = new ResponseModel("resetPassword").withError(
        HttpStatusCodes.BAD_REQUEST.toString(),
        "Invalid token",
      );
      (UsersUseCases.prototype.resetPassword as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "invalid-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when resetPassword throws an exception", async () => {
      (UsersUseCases.prototype.resetPassword as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("POST /auth/redirects", () => {
    it("should return 200 and set redirect cookie if valid allowed origin", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "http://allowed-origin.com/dashboard" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeDefined();

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should return 200 but ignore cookie set if disallowed origin", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [],
        configurable: true,
      });

      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "http://disallowed-origin.com/dashboard" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeUndefined();

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should return 200 directly if no url parameter is provided", async () => {
      const response = await supertest(app).post("/auth/redirects").send({});

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("should handle invalid url gracefully and return 200 without cookie set", async () => {
      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "not-a-valid-url" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeUndefined();
    });

    it("should authorize redirect origin if origin evaluates to null", async () => {
      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "data:text/html,hello" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeDefined();
    });
  });
});
