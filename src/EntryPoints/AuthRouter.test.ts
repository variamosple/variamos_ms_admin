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

jest.mock("./errorMapper", () => {
  const actual = jest.requireActual("./errorMapper");
  return {
    ...actual,
    mapDomainErrorToHttpStatus: jest.fn(),
  };
});

import express from "express";
import logger from "jet-logger";
import supertest from "supertest";
import EnvVars from "@src/common/EnvVars";
import cookieParser from "cookie-parser";
import { createAuthRouter, AUTH_ROUTE } from "./AuthRouter";
import { mapDomainErrorToHttpStatus } from "./errorMapper";
import { UserAuthUseCase } from "@src/Domain/User/UseCase/UserAuthUseCase";
import {
  UserPasswordUseCase,
  UserPasswordUseCaseConfig,
} from "@src/Domain/User/UseCase/UserPasswordUseCase";
import { UserManagementUseCase } from "@src/Domain/User/UseCase/UserManagementUseCase";
import { UserQueryUseCase } from "@src/Domain/User/UseCase/UserQueryUseCase";
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
  hasPermissions,
} from "@variamosple/variamos-security";

import { IUserRepository } from "@src/Domain/User/IUserRepository";
import { IMailService } from "@src/Domain/Mail/IMailService";
import { IGuestRoleRepository } from "@src/Domain/Role/Repository/IGuestRoleRepository";
import { mock } from "jest-mock-extended";

// Mock other dependencies
jest.mock("@src/Domain/User/UseCase/UserAuthUseCase");
jest.mock("@src/Domain/User/UseCase/UserPasswordUseCase");
jest.mock("@src/Domain/User/UseCase/UserManagementUseCase");
jest.mock("@src/Domain/User/UseCase/UserQueryUseCase");
jest.mock("@variamosple/variamos-security", () => {
  const actual = jest.requireActual("@variamosple/variamos-security");
  return {
    ...actual,
    getToken: jest.fn(),
    validateToken: jest.fn(),
    isSessionExpired: jest.fn(),
    sessionInfoToSessionUser: jest.fn(),
    createJwt: jest.fn(),
    hasPermissions: jest
      .fn()
      .mockImplementation(
        (_permissions?: string[], _roles?: string[]) =>
          (req: express.Request, _res: express.Response, next: express.NextFunction) => {
            req.user = {
              id: "user-123",
              name: "John Doe",
              email: "john@example.com",
              user: "john",
              roles: ["guest"],
              permissions: ["my-account::query", "my-account::update"],
            };
            next();
            return Promise.resolve();
          },
      ),
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
    const mockUserAuthUseCase = new UserAuthUseCase(
      mock<IUserRepository>(),
      mock<IGuestRoleRepository>(),
    );
    const mockUserPasswordUseCase = new UserPasswordUseCase(
      mock<IUserRepository>(),
      mock<IMailService>(),
      mock<UserPasswordUseCaseConfig>(),
    );
    const mockUserManagementUseCase = new UserManagementUseCase(mock<IUserRepository>());
    const mockUserQueryUseCase = new UserQueryUseCase(mock<IUserRepository>());
    app.use(
      AUTH_ROUTE,
      createAuthRouter(
        mockUserAuthUseCase,
        mockUserPasswordUseCase,
        mockUserManagementUseCase,
        mockUserQueryUseCase,
      ),
    );
  });

  beforeEach(() => {
    jest.clearAllMocks();
    const actualErrorMapper = jest.requireActual("./errorMapper");
    jest
      .mocked(mapDomainErrorToHttpStatus)
      .mockImplementation(
        actualErrorMapper.mapDomainErrorToHttpStatus as typeof mapDomainErrorToHttpStatus,
      );

    jest
      .mocked(hasPermissions)
      .mockImplementation(
        (_permissions?: string[], _roles?: string[]) =>
          (req: express.Request, _res: express.Response, next: express.NextFunction) => {
            req.user = {
              id: "user-123",
              name: "John Doe",
              email: "john@example.com",
              user: "john",
              roles: ["guest"],
              permissions: ["my-account::query", "my-account::update"],
            };
            next();
            return Promise.resolve();
          },
      );
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
      expect(response.body.message).toBe("Invalid Token");
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
      expect(response.body.message).toBe("Your session has expired, please log in again.");
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
      const redirectToCookie = cookies.find((c) => c.includes("redirectTo="));
      expect(redirectToCookie).toBeDefined();
      expect(redirectToCookie?.includes("redirectTo=;")).toBe(true);
      expect(
        redirectToCookie?.includes("Max-Age=0") || !redirectToCookie?.includes("Max-Age="),
      ).toBe(true);
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
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(
        new ResponseModel<User>("getSessionInfo").withResponse(mockDomainUser),
      );

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserQueryUseCase.prototype.sessionUser).toHaveBeenCalled();
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
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(refreshedResponse);
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
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(refreshedResponse);

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
        DomainErrorCodes.UNAUTHORIZED_ACCESS,
        "Expired",
      );

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(refreshedResponse);

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
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(refreshedResponse);

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
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(refreshedResponse);
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
      (UserAuthUseCase.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

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
        DomainErrorCodes.UNAUTHORIZED_ACCESS,
        "Invalid credentials",
      );
      (UserAuthUseCase.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

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
      (UserAuthUseCase.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

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
      (UserAuthUseCase.prototype.signIn as jest.Mock).mockRejectedValue(
        new Error("Unexpected sign-in error"),
      );

      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("POST /auth/sign-up", () => {
    it("should return 200 on successful sign up", async () => {
      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel("signUp").withResponse(mockUser);

      (UserAuthUseCase.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.message).toBe("You have successfully signed up!");
    });

    it("should return 200 with signup successful message even on conflict (already exists)", async () => {
      const expectedResponse = new ResponseModel("signUp").withError(
        DomainErrorCodes.DUPLICATE_ENTITY,
        "User already exists",
      );
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

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
        DomainErrorCodes.INVALID_INPUT,
        "Passwords do not match",
      );
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

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
        DomainErrorCodes.INVALID_INPUT,
        "Invalid name",
      );
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when sign-up throws an exception", async () => {
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockRejectedValue(
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
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/guest/sign-in")
        .send({ guestId: "guest-123" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.headers["set-cookie"]).toBeDefined();
    });

    it("should return error code when guest data retrieval fails", async () => {
      const expectedResponse = new ResponseModel("signInAsGuest").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Invalid guest id",
      );
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/guest/sign-in")
        .send({ guestId: "guest-invalid" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when guest sign-in throws an exception", async () => {
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockRejectedValue(
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
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

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
      (UserQueryUseCase.prototype.myAccount as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/auth/my-account");

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when getMyAccount throws an exception", async () => {
      (UserQueryUseCase.prototype.myAccount as jest.Mock).mockRejectedValue(
        new Error("Unexpected error"),
      );

      const response = await supertest(app).get("/auth/my-account");

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
    });
  });

  describe("PUT /auth/my-account/information", () => {
    it("should return 200 on successful update", async () => {
      const expectedResponse = new ResponseModel("updateMyAccountInformation").withResponse(null);
      (UserManagementUseCase.prototype.updateProfile as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .put("/auth/my-account/information")
        .send({ countryCode: "FR" });

      expect(response.status).toBe(HttpStatusCodes.OK);
    });

    it("should return 500 when updatePersonalInformation throws an exception", async () => {
      (UserManagementUseCase.prototype.updateProfile as jest.Mock).mockRejectedValue(
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

      (UserManagementUseCase.prototype.updatePassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

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
      (UserManagementUseCase.prototype.updatePassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app).put("/auth/password-update").send({
        currentPassword: "OldPassword123!",
        newPassword: "NewPassword123!",
        passwordConfirmation: "Mismatch",
      });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when updatePassword throws an exception", async () => {
      (UserManagementUseCase.prototype.updatePassword as jest.Mock).mockRejectedValue(
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
      (UserAuthUseCase.prototype.findOrCreate as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "mock-google-id-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe("http://localhost:3000");
    });

    it("should redirect to login with error query param if findOrCreateUser fails", async () => {
      const expectedResponse = new ResponseModel("loginWithGoogle").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Creation failed",
      );
      (UserAuthUseCase.prototype.findOrCreate as jest.Mock).mockResolvedValue(expectedResponse);

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
      (UserAuthUseCase.prototype.findOrCreate as jest.Mock).mockResolvedValue(expectedResponse);

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
      (UserPasswordUseCase.prototype.requestReset as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "test@example.com" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(mapDomainErrorToHttpStatus).not.toHaveBeenCalled();
    });

    it("should return error status code when requestPasswordReset fails", async () => {
      const expectedResponse = new ResponseModel("forgotPassword").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Email not found",
      );
      (UserPasswordUseCase.prototype.requestReset as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/forgot-password")
        .send({ email: "notfound@example.com" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when forgot-password throws an exception", async () => {
      (UserPasswordUseCase.prototype.requestReset as jest.Mock).mockRejectedValue(
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
      (UserPasswordUseCase.prototype.verifyToken as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "valid-token" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(mapDomainErrorToHttpStatus).not.toHaveBeenCalled();
    });

    it("should return error status code when token verification fails", async () => {
      const expectedResponse = new ResponseModel("verifyToken").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Token expired",
      );
      (UserPasswordUseCase.prototype.verifyToken as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .get("/auth/verify-token")
        .query({ token: "expired-token" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when verify-token throws an exception", async () => {
      (UserPasswordUseCase.prototype.verifyToken as jest.Mock).mockRejectedValue(
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
      (UserPasswordUseCase.prototype.resetPassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "valid-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(mapDomainErrorToHttpStatus).not.toHaveBeenCalled();
    });

    it("should return error status code when resetPassword fails", async () => {
      const expectedResponse = new ResponseModel("resetPassword").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Invalid token",
      );
      (UserPasswordUseCase.prototype.resetPassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "invalid-token", password: "NewPassword123!" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should return 500 when resetPassword throws an exception", async () => {
      (UserPasswordUseCase.prototype.resetPassword as jest.Mock).mockRejectedValue(
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

  describe("Stryker Mutant Killers", () => {
    let originalHomeRedirectUri: string | undefined;

    beforeAll(() => {
      originalHomeRedirectUri = EnvVars.Auth.APP.HOME_REDIRECT_URI;
    });

    afterAll(() => {
      Object.defineProperty(EnvVars.Auth.APP, "HOME_REDIRECT_URI", {
        value: originalHomeRedirectUri,
        configurable: true,
        writable: true,
      });
    });

    it("should handle fallback HOME_URL when EnvVars.Auth.APP.HOME_REDIRECT_URI is empty (Line 42)", async () => {
      Object.defineProperty(EnvVars.Auth.APP, "HOME_REDIRECT_URI", {
        value: "",
        configurable: true,
        writable: true,
      });

      const mockUserAuthUseCase = mock<UserAuthUseCase>();
      const mockUserPasswordUseCase = mock<UserPasswordUseCase>();
      const mockUserManagementUseCase = mock<UserManagementUseCase>();
      const mockUserQueryUseCase = mock<UserQueryUseCase>();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(cookieParser("secret"));
      testApp.use(
        "/auth-fallback",
        createAuthRouter(
          mockUserAuthUseCase,
          mockUserPasswordUseCase,
          mockUserManagementUseCase,
          mockUserQueryUseCase,
        ),
      );

      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel<User>("signIn").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      mockUserAuthUseCase.signIn.mockResolvedValue(expectedResponse);

      const response = await supertest(testApp)
        .post("/auth-fallback/sign-in")
        .set("Cookie", ["redirectTo=http://localhost:3000/dashboard"])
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data.redirect).toBe("http://localhost:3000/dashboard");
    });

    it("should not clear cookie and not return set-cookie for redirectTo if redirectTo cookie is absent (Line 63)", async () => {
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
      const cookies = parseCookies(response);
      expect(cookies.some((c) => c.includes("redirectTo="))).toBe(false);
    });

    it("should call logger.err with invalid URL and error when getUrl throws (Lines 83, 84, 85)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

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
        .set("Cookie", ["redirectTo=http://[invalid-url]"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("getSessionInfo Invalid URL: http://[invalid-url]"),
      );
      expect(loggerSpy.mock.calls[1][0]).toHaveProperty("message");
      expect(loggerSpy.mock.calls[1][1]).toBe(true);
      loggerSpy.mockRestore();
    });

    it("should return secure false cookie when sameSite is not none (Line 109)", async () => {
      const originalSecure = EnvVars.CookieProps.Options.secure;
      Object.defineProperty(EnvVars.CookieProps.Options, "secure", {
        value: false,
        configurable: true,
      });

      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel<User>("signIn").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      (UserAuthUseCase.prototype.signIn as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      const cookies = parseCookies(response);
      const authCookie = cookies.find((c) => c.includes("authToken="));
      expect(authCookie).toBeDefined();
      expect(authCookie?.includes("Secure")).toBe(false);

      Object.defineProperty(EnvVars.CookieProps.Options, "secure", {
        value: originalSecure,
        configurable: true,
      });
    });

    it("should return early when validationResponse has errorCode (Line 130)", async () => {
      const validationResponse = new SecurityResponseModel<SessionInfo>("getSessionInfo").withError(
        HttpStatusCodes.UNAUTHORIZED,
        "Invalid Token",
      );
      jest.mocked(getToken).mockReturnValue("bad-token");
      jest.mocked(validateToken).mockResolvedValue(validationResponse);

      jest.mocked(isSessionExpired).mockClear();

      const response = await supertest(app).get("/auth/session-info");

      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      expect(isSessionExpired).not.toHaveBeenCalled();
    });

    it("should handle refresh boundary at exactly refreshLimit (Line 160)", async () => {
      const mockToken = "valid-token";
      const maxAge = EnvVars.CookieProps.Options.maxAge;
      const now = Date.now();
      const userIat = Math.floor((now - maxAge) / 1000);
      const mockUserPayload = {
        sub: "user-123",
        exp: 1000,
        iat: userIat,
      } as SessionInfo;

      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);

      const dateSpy = jest.spyOn(Date, "now").mockReturnValue(userIat * 1000 + maxAge + 1);

      const response = await supertest(app).get("/auth/session-info");
      expect(response.status).toBe(HttpStatusCodes.UNAUTHORIZED);
      dateSpy.mockRestore();
    });

    it("should handle missing roles gracefully by defaulting to empty array (Line 171)", async () => {
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
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(
        new ResponseModel<User>("getSessionInfo").withResponse(mockDomainUser),
      );
      jest.mocked(createJwt).mockResolvedValue("new-jwt-token");

      const response = await supertest(app).get("/auth/session-info");
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserQueryUseCase.prototype.sessionUser).toHaveBeenCalled();
      expect(createJwt).toHaveBeenCalledWith(expect.objectContaining({ roles: [] }), undefined);
    });

    it("should return undefined authToken when mixed local/external aud and origin are provided (Line 218)", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const mockToken = "valid-token";

      // Case A: aud is external, origin is local (no Origin header provided)
      const mockUserPayloadA = {
        sub: "user-123",
        aud: "allowed-origin.com",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
        roles: ["admin"],
      } as SessionInfo;
      const validationResponseA = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayloadA);
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
      jest.mocked(validateToken).mockResolvedValue(validationResponseA);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      jest.mocked(sessionInfoToSessionUser).mockReturnValue(sessionUser);
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(refreshedResponse);
      jest.mocked(createJwt).mockResolvedValue("new-refreshed-jwt-token");

      const responseA = await supertest(app).get("/auth/session-info");
      expect(responseA.status).toBe(HttpStatusCodes.OK);
      expect(responseA.body.data.authToken).toBeUndefined();

      // Case B: aud is local, origin is external
      const mockUserPayloadB = {
        sub: "user-123",
        aud: "localhost",
        exp: 1000,
        iat: Math.floor(Date.now() / 1000),
        roles: ["admin"],
      } as SessionInfo;
      const validationResponseB = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayloadB);

      jest.mocked(validateToken).mockResolvedValue(validationResponseB);

      const responseB = await supertest(app)
        .get("/auth/session-info")
        .set("Origin", "http://allowed-origin.com");

      expect(responseB.status).toBe(HttpStatusCodes.OK);
      expect(responseB.body.data.authToken).toBeUndefined();

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should call logger.err with error and true flag when signIn throws (Line 290)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      (UserAuthUseCase.prototype.signIn as jest.Mock).mockRejectedValue(
        new Error("Unexpected sign-in error"),
      );

      const response = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId is returned in signIn and signUp responses (Line 235 & 303)", async () => {
      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedSignInResponse = new ResponseModel("signIn").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      (UserAuthUseCase.prototype.signIn as jest.Mock).mockResolvedValue(expectedSignInResponse);

      const signInResponse = await supertest(app)
        .post("/auth/sign-in")
        .send({ email: "john@example.com", password: "Password123!" });

      expect(signInResponse.status).toBe(HttpStatusCodes.OK);
      expect(signInResponse.body.transactionId).toBe("signIn");

      const expectedSignUpResponse = new ResponseModel("signUp").withResponse(mockUser);
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockResolvedValue(expectedSignUpResponse);

      const signUpResponse = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(signUpResponse.status).toBe(HttpStatusCodes.OK);
      expect(signUpResponse.body.transactionId).toBe("signUp");
    });

    it("should handle errorCode in signUp response mapping and return mapped error (Line 336)", async () => {
      const expectedResponse = new ResponseModel("signUp").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "System failure",
      );
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(response.body.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });

    it("should call logger.err with true flag when signUp throws (Line 344)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserAuthUseCase.prototype.signUp as jest.Mock).mockRejectedValue(
        new Error("Database offline"),
      );

      const response = await supertest(app).post("/auth/sign-up").send({
        name: "John Doe",
        email: "john@example.com",
        password: "Password123!",
        passwordConfirmation: "Password123!",
      });

      expect(response.status).toBe(HttpStatusCodes.INTERNAL_SERVER_ERROR);
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should set cookie maxAge false when logout is called (Lines 357 & 358)", async () => {
      const response = await supertest(app).post("/auth/logout");
      expect(response.status).toBe(HttpStatusCodes.OK);
      const cookies = parseCookies(response);
      const authCookie = cookies.find((c) => c.includes("authToken="));
      expect(authCookie).toBeDefined();
      expect(
        authCookie?.includes("Max-Age=0") || authCookie?.includes("Expires=Thu, 01 Jan 1970"),
      ).toBe(true);
    });

    it("should call logger.err in validateGoogleCode when verification throws (Line 390)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "invalid-token" });

      expect(response.status).toBe(302);
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error));
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in findOrCreate call during google callback (Line 397)", async () => {
      const mockUser = User.builder()
        .setId("user-123")
        .setName("John Doe")
        .setEmail("john@example.com")
        .build();
      const expectedResponse = new ResponseModel("loginWithGoogle").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("google-jwt-token");
      (UserAuthUseCase.prototype.findOrCreate as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "mock-google-id-token" });

      expect(response.status).toBe(302);
      expect(UserAuthUseCase.prototype.findOrCreate).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "loginWithGoogle" }),
      );
    });

    it("should redirect to login with errorMessage when findOrCreate returns null data (Line 415)", async () => {
      const expectedResponse = new ResponseModel("loginWithGoogle").withResponse(null);
      (UserAuthUseCase.prototype.findOrCreate as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "mock-google-id-token" });

      expect(response.status).toBe(302);
      expect(response.headers.location).toContain("errorMessage=Login%20failed");
    });

    it("should call logger.err with true flag when google callback throws (Line 440)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      const response = await supertest(app)
        .post("/auth/google/callback")
        .send({ credential: "invalid-token" });

      expect(response.status).toBe(302);
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in myAccount call (Line 446)", async () => {
      const expectedResponse = new ResponseModel("myAccount").withResponse(null);
      (UserQueryUseCase.prototype.myAccount as jest.Mock).mockResolvedValue(expectedResponse);

      await supertest(app).get("/auth/my-account");
      expect(UserQueryUseCase.prototype.myAccount).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "myAccount" }),
      );
    });

    it("should call logger.err with true flag when my-account throws (Line 456)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserQueryUseCase.prototype.myAccount as jest.Mock).mockRejectedValue(
        new Error("MyAccount failed"),
      );

      await supertest(app).get("/auth/my-account");
      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in updateProfile call (Line 470)", async () => {
      const expectedResponse = new ResponseModel("updateMyAccountInformation").withResponse(null);
      (UserManagementUseCase.prototype.updateProfile as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      await supertest(app).put("/auth/my-account/information").send({ countryCode: "US" });

      expect(UserManagementUseCase.prototype.updateProfile).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "updateMyAccountInformation" }),
      );
    });

    it("should call logger.err with true flag when updateProfile throws (Line 490)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserManagementUseCase.prototype.updateProfile as jest.Mock).mockRejectedValue(
        new Error("Update failed"),
      );

      await supertest(app).put("/auth/my-account/information").send({ countryCode: "US" });

      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in updatePassword call (Line 502)", async () => {
      const expectedResponse = new ResponseModel("passwordUpdate").withResponse(null);
      (UserManagementUseCase.prototype.updatePassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      await supertest(app)
        .put("/auth/password-update")
        .send({ currentPassword: "a", newPassword: "b", passwordConfirmation: "b" });

      expect(UserManagementUseCase.prototype.updatePassword).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "passwordUpdate" }),
      );
    });

    it("should call logger.err with true flag when updatePassword throws (Line 523)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserManagementUseCase.prototype.updatePassword as jest.Mock).mockRejectedValue(
        new Error("Pass failed"),
      );

      await supertest(app)
        .put("/auth/password-update")
        .send({ currentPassword: "a", newPassword: "b", passwordConfirmation: "b" });

      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in getGuestData call (Line 534)", async () => {
      const expectedResponse = new ResponseModel("signInAsGuest").withResponse(null);
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      await supertest(app).post("/auth/guest/sign-in").send({ guestId: "abc" });

      expect(UserAuthUseCase.prototype.getGuestData).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "signInAsGuest" }),
      );
    });

    it("should fallback to HOME_REDIRECT_URI during guest sign-in when redirect is empty (Line 572)", async () => {
      const mockUser = User.builder().setId("guest-123").setName("Guest").build();
      const expectedResponse = new ResponseModel("signInAsGuest").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("guest-token");
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/guest/sign-in").send({ guestId: "abc" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data.redirect).toBe(EnvVars.Auth.APP.HOME_REDIRECT_URI);
    });

    it("should call logger.err with true flag when guest sign-in throws (Line 577)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockRejectedValue(
        new Error("Guest throw"),
      );

      await supertest(app).post("/auth/guest/sign-in").send({ guestId: "abc" });

      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should not execute catch block when url is not provided to /redirects (Line 593)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      const response = await supertest(app).post("/auth/redirects").send({});

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(loggerSpy).not.toHaveBeenCalled();
      loggerSpy.mockRestore();
    });

    it("should execute catch block and log error when url is invalid in /redirects (Line 603)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "not-a-valid-url" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(loggerSpy).toHaveBeenCalledWith("POST: /auth/redirects Invalid redirect URL:");
      expect(loggerSpy.mock.calls[1][0]).toHaveProperty("message");
      expect(loggerSpy.mock.calls[2][0]).toHaveProperty("message");
      expect(loggerSpy.mock.calls[2][1]).toBe(true);
      loggerSpy.mockRestore();
    });

    it("should call getCookieOptions with sameSite none in /redirects (Line 610)", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/allowed-origin\.com$/],
        configurable: true,
      });

      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "http://allowed-origin.com/dashboard" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      const cookies = parseCookies(response);
      expect(cookies.some((c) => c.includes("redirectTo=") && c.includes("SameSite=None"))).toBe(
        true,
      );

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should verify transactionId in forgotPassword call (Line 617)", async () => {
      const expectedResponse = new ResponseModel("forgotPassword").withResponse(null);
      (UserPasswordUseCase.prototype.requestReset as jest.Mock).mockResolvedValue(expectedResponse);

      await supertest(app).post("/auth/forgot-password").send({ email: "test@example.com" });

      expect(UserPasswordUseCase.prototype.requestReset).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "forgotPassword" }),
      );
    });

    it("should return early when forgotPasswordResponse has errorCode (Line 625)", async () => {
      const expectedResponse = new ResponseModel("forgotPassword").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Email missing",
      );
      (UserPasswordUseCase.prototype.requestReset as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).post("/auth/forgot-password").send({ email: "" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should call logger.err with true flag when forgot-password throws (Line 633)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserPasswordUseCase.prototype.requestReset as jest.Mock).mockRejectedValue(
        new Error("Forgot error"),
      );

      await supertest(app).post("/auth/forgot-password").send({ email: "test@example.com" });

      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in verifyToken call (Line 646) and query token gets passed (Line 647)", async () => {
      const expectedResponse = new ResponseModel("verifyToken").withResponse(null);
      (UserPasswordUseCase.prototype.verifyToken as jest.Mock).mockResolvedValue(expectedResponse);

      await supertest(app).get("/auth/verify-token").query({ token: "test" });

      expect(UserPasswordUseCase.prototype.verifyToken).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "verifyToken",
          data: "test",
        }),
      );
    });

    it("should return early when verifyToken response has errorCode (Line 654)", async () => {
      const expectedResponse = new ResponseModel("verifyToken").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Expired",
      );
      (UserPasswordUseCase.prototype.verifyToken as jest.Mock).mockResolvedValue(expectedResponse);

      const response = await supertest(app).get("/auth/verify-token").query({ token: "expired" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should call logger.err with true flag when verifyToken throws (Line 662)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserPasswordUseCase.prototype.verifyToken as jest.Mock).mockRejectedValue(
        new Error("Verify throw"),
      );

      await supertest(app).get("/auth/verify-token").query({ token: "token" });

      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should verify transactionId in resetPassword call (Line 675)", async () => {
      const expectedResponse = new ResponseModel("resetPassword").withResponse(null);
      (UserPasswordUseCase.prototype.resetPassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      await supertest(app).post("/auth/reset-password").send({ token: "t", password: "p" });

      expect(UserPasswordUseCase.prototype.resetPassword).toHaveBeenCalledWith(
        expect.objectContaining({ transactionId: "resetPassword" }),
      );
    });

    it("should return early when resetPassword response has errorCode (Line 686)", async () => {
      const expectedResponse = new ResponseModel("resetPassword").withError(
        DomainErrorCodes.INVALID_INPUT,
        "Fail",
      );
      (UserPasswordUseCase.prototype.resetPassword as jest.Mock).mockResolvedValue(
        expectedResponse,
      );

      const response = await supertest(app)
        .post("/auth/reset-password")
        .send({ token: "t", password: "p" });

      expect(response.status).toBe(HttpStatusCodes.BAD_REQUEST);
    });

    it("should call logger.err with true flag when resetPassword throws (Line 692)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});
      (UserPasswordUseCase.prototype.resetPassword as jest.Mock).mockRejectedValue(
        new Error("Reset throw"),
      );

      await supertest(app).post("/auth/reset-password").send({ token: "t", password: "p" });

      expect(loggerSpy).toHaveBeenCalledWith(expect.any(Error), true);
      loggerSpy.mockRestore();
    });

    it("should compile HOME_URL_HOST_REGEX using the hostname (Line 43)", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/my-home-domain\.com$/],
        configurable: true,
      });

      Object.defineProperty(EnvVars.Auth.APP, "HOME_REDIRECT_URI", {
        value: "http://my-home-domain.com",
        configurable: true,
        writable: true,
      });

      const mockUserAuthUseCase = mock<UserAuthUseCase>();
      const mockUserPasswordUseCase = mock<UserPasswordUseCase>();
      const mockUserManagementUseCase = mock<UserManagementUseCase>();
      const mockUserQueryUseCase = mock<UserQueryUseCase>();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(cookieParser("secret"));
      testApp.use(
        "/auth-regex",
        createAuthRouter(
          mockUserAuthUseCase,
          mockUserPasswordUseCase,
          mockUserManagementUseCase,
          mockUserQueryUseCase,
        ),
      );

      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel<User>("signIn").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      mockUserAuthUseCase.signIn.mockResolvedValue(expectedResponse);

      const response = await supertest(testApp)
        .post("/auth-regex/sign-in")
        .set("Cookie", ["redirectTo=http://my-home-domain.com/dashboard"])
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data.redirect).toBe("http://my-home-domain.com/dashboard");

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should call logger.err with getSessionInfo when invalid redirect is passed during refresh (Line 208)", async () => {
      const loggerSpy = jest.spyOn(logger, "err").mockImplementation(() => {});

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
      (UserQueryUseCase.prototype.sessionUser as jest.Mock).mockResolvedValue(refreshedResponse);
      jest.mocked(createJwt).mockResolvedValue("new-jwt-token");

      const response = await supertest(app)
        .get("/auth/session-info")
        .set("Cookie", ["redirectTo=http://[invalid-url]"]);

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining("getSessionInfo Invalid URL: http://[invalid-url]"),
      );
      loggerSpy.mockRestore();
    });

    it("should verify permissions are passed correctly to hasPermissions middleware (Lines 445, 468, 501)", () => {
      jest.mocked(hasPermissions).mockClear();

      createAuthRouter(
        mock<UserAuthUseCase>(),
        mock<UserPasswordUseCase>(),
        mock<UserManagementUseCase>(),
        mock<UserQueryUseCase>(),
      );

      const calls = jest.mocked(hasPermissions).mock.calls;
      expect(calls).toHaveLength(3);
      expect(calls[0][0]).toEqual(["my-account::query"]);
      expect(calls[1][0]).toEqual(["my-account::update"]);
      expect(calls[2][0]).toEqual(["my-account::update"]);
    });

    it("should handle local redirect origin containing fallback hostname but is actually external (Line 43)", async () => {
      const mockUserAuthUseCase = mock<UserAuthUseCase>();
      const mockUserPasswordUseCase = mock<UserPasswordUseCase>();
      const mockUserManagementUseCase = mock<UserManagementUseCase>();
      const mockUserQueryUseCase = mock<UserQueryUseCase>();

      const testApp = express();
      testApp.use(express.json());
      testApp.use(cookieParser("secret"));
      testApp.use(
        "/auth-anchor",
        createAuthRouter(
          mockUserAuthUseCase,
          mockUserPasswordUseCase,
          mockUserManagementUseCase,
          mockUserQueryUseCase,
        ),
      );

      const mockUser = User.builder().setId("user-123").setName("John Doe").build();
      const expectedResponse = new ResponseModel<User>("signIn").withResponse(mockUser);
      jest.mocked(createJwt).mockResolvedValue("jwt-token");
      mockUserAuthUseCase.signIn.mockResolvedValue(expectedResponse);

      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [/^https?:\/\/localhost\.external\.com$/],
        configurable: true,
      });

      const response = await supertest(testApp)
        .post("/auth-anchor/sign-in")
        .set("Cookie", ["redirectTo=http://localhost.external.com/dashboard"])
        .send({ email: "john@example.com", password: "Password123!" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(response.body.data.redirect).toBe(
        "http://localhost.external.com/dashboard?authToken=jwt-token",
      );

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should authorize redirect origin if origin evaluates to null (Line 48)", async () => {
      const originalPatterns = EnvVars.CORS.AllowedOriginsPatterns;
      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: [],
        configurable: true,
      });

      const response = await supertest(app)
        .post("/auth/redirects")
        .send({ url: "data:text/html,hello" });

      expect(response.status).toBe(HttpStatusCodes.OK);
      const cookies = parseCookies(response);
      const redirectCookie = cookies.find((c) => c.includes("redirectTo="));
      expect(redirectCookie).toBeDefined();
      const decodedCookie = decodeURIComponent(redirectCookie ?? "");
      expect(decodedCookie.includes("redirectTo=data:text/html,hello")).toBe(true);

      Object.defineProperty(EnvVars.CORS, "AllowedOriginsPatterns", {
        value: originalPatterns,
        configurable: true,
      });
    });

    it("should treat user as guest if roles contains GUEST alongside other roles (Line 171 ME)", async () => {
      const mockToken = "guest-token";
      const mockUserPayload = {
        sub: "guest-123",
        exp: 9999999999,
        iat: Math.floor(Date.now() / 1000),
        roles: ["GUEST", "other-role"],
      } as SessionInfo;
      const validationResponse = new SecurityResponseModel<SessionInfo>(
        "getSessionInfo",
      ).withResponse(mockUserPayload);

      const mockDomainUser = User.builder()
        .setId("guest-123")
        .setName("Guest User")
        .setRoles(["guest", "other-role"])
        .build();

      jest.mocked(getToken).mockReturnValue(mockToken);
      jest.mocked(validateToken).mockResolvedValue(validationResponse);
      jest.mocked(isSessionExpired).mockReturnValue(true);
      (UserAuthUseCase.prototype.getGuestData as jest.Mock).mockResolvedValue(
        new ResponseModel<User>("getSessionInfo").withResponse(mockDomainUser),
      );
      jest.mocked(createJwt).mockResolvedValue("guest-jwt");

      const response = await supertest(app).get("/auth/session-info");
      expect(response.status).toBe(HttpStatusCodes.OK);
      expect(UserAuthUseCase.prototype.getGuestData).toHaveBeenCalled();
      expect(UserQueryUseCase.prototype.sessionUser).not.toHaveBeenCalled();
    });
  });
});
