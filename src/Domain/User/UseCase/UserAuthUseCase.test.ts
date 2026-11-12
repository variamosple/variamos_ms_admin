import { type MockProxy, mock } from "vitest-mock-extended";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { ILogger } from "#src/Domain/Core/Service/ILogger.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import { Role } from "#src/Domain/Role/Entity/Role.js";
import type { IGuestRoleRepository } from "#src/Domain/Role/Repository/IGuestRoleRepository.js";
import { Credentials } from "#src/Domain/User/Entity/Credentials.js";
import type { GoogleProfile } from "#src/Domain/User/Entity/GoogleIdentity.js";
import { User } from "#src/Domain/User/Entity/User.js";
import { UserRegistration } from "#src/Domain/User/Entity/UserRegistration.js";
import type { IUserPasswordRepository } from "#src/Domain/User/IUserPasswordRepository.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import type { IUserSignInRepository } from "#src/Domain/User/IUserSignInRepository.js";
import type {
  AccountPasswordService,
  OpenedAccount,
} from "#src/Domain/User/Service/AccountPasswordService.js";
import { UserAuthUseCase } from "./UserAuthUseCase.js";

describe("UserAuthUseCase", () => {
  let useCase: UserAuthUseCase;
  let logger: MockProxy<ILogger>;
  let mockUserRepository: MockProxy<
    IUserRepository & IUserSignInRepository & IUserPasswordRepository
  >;
  let mockRoleRepository: MockProxy<IGuestRoleRepository>;
  let mailService: MockProxy<IMailService>;
  let accountPasswords: MockProxy<AccountPasswordService>;

  beforeEach(() => {
    logger = mock<ILogger>();
    mockUserRepository = mock<
      IUserRepository & IUserSignInRepository & IUserPasswordRepository
    >();
    mockRoleRepository = mock<IGuestRoleRepository>();
    mailService = mock<IMailService>();
    accountPasswords = mock<AccountPasswordService>();
    useCase = new UserAuthUseCase({
      userRepository: mockUserRepository,
      roleRepository: mockRoleRepository,
      logger,
      mailService,
      config: { adminHomeUri: "https://app.example.com" },
      accountPasswords,
    });
  });

  describe("signUp", () => {
    it("should fail if required fields are missing", async () => {
      const reg = {
        name: "",
        email: "",
        password: "",
        passwordConfirmation: "",
      } as unknown as UserRegistration;
      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should fail if password does not match confirmation", async () => {
      const reg = {
        name: "Name",
        email: "test@e.com",
        password: "Password123!",
        passwordConfirmation: "OtherPass!",
      } as unknown as UserRegistration;
      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe(
        "Password and password confirmation do not match.",
      );
    });

    it("should fail if password does not match complex regexp pattern", async () => {
      const reg = {
        name: "Name",
        email: "test@e.com",
        password: "simple",
        passwordConfirmation: "simple",
      } as unknown as UserRegistration;
      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
    });

    it("should signup successfully if inputs are valid", async () => {
      const reg = UserRegistration.builder()
        .setName("Name")
        .setEmail("test@e.com")
        .setPassword("Password123!")
        .setPasswordConfirmation("Password123!")
        .build();
      const mockUser = User.builder()
        .setId("1")
        .setUser("u1")
        .setName("Name")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .setCreatedAt(new Date())
        .build();
      const mockResponse = new ResponseModel<User>("tx-1").withResponse(
        mockUser,
      );
      mockUserRepository.signUp.mockResolvedValue(mockResponse);

      const req = new RequestModel<UserRegistration>("tx-1", reg);
      const res = await useCase.signUp(req);
      expect(res.data).toBe(mockUser);
      expect(mailService.sendExistingAccountMail).not.toHaveBeenCalled();
      // The registration checked once, here, is the one saved
      const saved = mockUserRepository.signUp.mock.calls[0]?.[0];
      expect(saved?.data).toBeInstanceOf(UserRegistration);
      expect(saved?.data).toMatchObject({
        name: "Name",
        email: "test@e.com",
      });
      expect(saved?.transactionId).toBe("tx-1");
    });

    describe("with a taken address (UX-33)", () => {
      const registration = () =>
        new RequestModel<UserRegistration>(
          "tx-1",
          UserRegistration.builder()
            .setName("Name")
            .setEmail("taken@e.com")
            .setPassword("Password123!")
            .setPasswordConfirmation("Password123!")
            .build(),
        );

      beforeEach(() => {
        mockUserRepository.signUp.mockResolvedValue(
          new ResponseModel<User>("tx-1").withError(
            DomainErrorCodes.DUPLICATE_ENTITY,
            "",
          ),
        );
      });

      it("answers as for a free address, so that no one learns who has an account", async () => {
        const res = await useCase.signUp(registration());

        expect(res.errorCode).toBeUndefined();
        expect(res.message).toBeUndefined();
        expect(res.data).toBeUndefined();
        expect(res.transactionId).toBe("tx-1");
      });

      it("tells the owner by mail, with links to sign in and recover", async () => {
        const res = await useCase.signUp(registration());

        expect(res.errorCode).toBeUndefined();
        expect(mailService.sendExistingAccountMail).toHaveBeenCalledWith(
          "taken@e.com",
          "https://app.example.com/#/login",
          "https://app.example.com/#/forgot-password",
        );
      });

      it("answers the same when the mail fails", async () => {
        mailService.sendExistingAccountMail.mockRejectedValue(
          new Error("SMTP down"),
        );

        const res = await useCase.signUp(registration());
        await vi.waitFor(() => expect(logger.err).toHaveBeenCalled());

        expect(res.errorCode).toBeUndefined();
      });
    });
  });

  describe("signIn", () => {
    const account = (): OpenedAccount => ({
      user: User.builder()
        .setId("user-123")
        .setUser("testuser")
        .setName("Test User")
        .setEmail("test@e.com")
        .setIsEnabled(true)
        .setIsDeleted(false)
        .build(),
      passwordHash: "$2b$10$hash",
    });
    const signIn = (data?: Credentials) =>
      useCase.signIn(new RequestModel<Credentials>("tx-1", data));

    it("records the sign-in of the account the password opens", async () => {
      const opened = account();
      const signedIn = User.builder().setId("user-123").build();
      accountPasswords.accountOpenedBy.mockResolvedValue(opened);
      accountPasswords.rehashIfOutdated.mockResolvedValue("$2b$12$new");
      mockUserRepository.recordSignIn.mockResolvedValue(signedIn);

      const res = await signIn(new Credentials("test@e.com", "Password123!"));

      expect(res.errorCode).toBeUndefined();
      expect(res.data).toBe(signedIn);
      expect(accountPasswords.accountOpenedBy).toHaveBeenCalledWith(
        { email: "test@e.com" },
        "Password123!",
      );
      expect(accountPasswords.rehashIfOutdated).toHaveBeenCalledWith(
        opened,
        "Password123!",
      );
      expect(mockUserRepository.recordSignIn).toHaveBeenCalledWith(
        opened.user,
        "$2b$12$new",
      );
    });

    it("refuses with the same words whatever the reason", async () => {
      accountPasswords.accountOpenedBy.mockResolvedValue(null);

      const res = await signIn(new Credentials("test@e.com", "Password123!"));

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Incorrect username or password.");
      expect(accountPasswords.rehashIfOutdated).not.toHaveBeenCalled();
      expect(mockUserRepository.recordSignIn).not.toHaveBeenCalled();
    });

    it("asks for credentials", async () => {
      const res = await signIn();

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("Credentials are required.");
    });

    it.each([
      ["an e-mail", { email: "", password: "Password123!" }],
      ["a password", { email: "test@e.com", password: "" }],
    ])("asks for %s, without reading an account", async (_, data) => {
      const res = await signIn(data as Credentials);

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe("email and password are required.");
      expect(accountPasswords.accountOpenedBy).not.toHaveBeenCalled();
    });

    it("hides a failure behind a system error, and logs it", async () => {
      accountPasswords.accountOpenedBy.mockRejectedValue(new Error("db down"));

      const res = await signIn(new Credentials("test@e.com", "Password123!"));

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Internal server error");
      expect(logger.err).toHaveBeenCalledWith(new Error("db down"));
    });
  });

  describe("signInWithGoogle", () => {
    const account = (isEnabled = true, isDeleted = false) =>
      User.builder()
        .setId("user-123")
        .setUser("testuser")
        .setName("Test User")
        .setEmail("test@e.com")
        .setIsEnabled(isEnabled)
        .setIsDeleted(isDeleted)
        .build();
    const profile = (over: Partial<GoogleProfile> = {}): GoogleProfile => ({
      sub: "google-sub-1",
      email: "test@e.com",
      name: "Test User",
      emailVerified: true,
      ...over,
    });
    const signInWith = (p: GoogleProfile) =>
      useCase.signInWithGoogle(new RequestModel<GoogleProfile>("tx-1", p));
    const signedIn = User.builder().setId("user-123").build();

    beforeEach(() => {
      mockUserRepository.findGoogleAccount.mockResolvedValue(null);
      mockUserRepository.findPasswordAccount.mockResolvedValue(null);
      mockUserRepository.recordSignIn.mockResolvedValue(signedIn);
    });

    it("refuses an address Google has not verified, before reading any account", async () => {
      const res = await signInWith(profile({ emailVerified: false }));

      expect(res.errorCode).toBe(DomainErrorCodes.UNAUTHORIZED_ACCESS);
      expect(res.message).toBe("google_email_unverified");
      expect(mockUserRepository.linkGoogleIdentity).not.toHaveBeenCalled();
      expect(mockUserRepository.findOrCreateUser).not.toHaveBeenCalled();
      expect(mockUserRepository.recordSignIn).not.toHaveBeenCalled();
    });

    it("opens the account linked to the Google account, whatever its address", async () => {
      const linked = account();
      mockUserRepository.findGoogleAccount.mockResolvedValue(linked);

      const res = await signInWith(profile({ email: "renamed@e.com" }));

      expect(res.data).toBe(signedIn);
      expect(mockUserRepository.findGoogleAccount).toHaveBeenCalledWith(
        "google-sub-1",
      );
      expect(mockUserRepository.findPasswordAccount).not.toHaveBeenCalled();
      expect(mockUserRepository.linkGoogleIdentity).not.toHaveBeenCalled();
      expect(mockUserRepository.recordSignIn).toHaveBeenCalledWith(linked);
    });

    it.each([
      ["a Gmail address", "someone@gmail.com", undefined, "hash"],
      ["a Google Workspace address", "someone@uni.edu", "uni.edu", "hash"],
      ["an account without a password", "someone@outlook.com", undefined, null],
    ])(
      "links an account found by %s",
      async (_label, email, hostedDomain, passwordHash) => {
        const found = account();
        mockUserRepository.findPasswordAccount.mockResolvedValue({
          user: found,
          passwordHash,
        });

        const res = await signInWith(profile({ email, hostedDomain }));

        expect(res.data).toBe(signedIn);
        expect(mockUserRepository.findPasswordAccount).toHaveBeenCalledWith({
          email,
        });
        expect(mockUserRepository.linkGoogleIdentity).toHaveBeenCalledWith(
          "user-123",
          "google-sub-1",
        );
        expect(mockUserRepository.recordSignIn).toHaveBeenCalledWith(found);
      },
    );

    it("leaves an account with a password to it when Google does not vouch for the address", async () => {
      mockUserRepository.findPasswordAccount.mockResolvedValue({
        user: account(),
        passwordHash: "hash",
      });

      const res = await signInWith(profile({ email: "someone@outlook.com" }));

      expect(res.errorCode).toBe(DomainErrorCodes.UNAUTHORIZED_ACCESS);
      expect(res.message).toBe("google_password_account");
      expect(mockUserRepository.linkGoogleIdentity).not.toHaveBeenCalled();
      expect(mockUserRepository.recordSignIn).not.toHaveBeenCalled();
    });

    it("creates and links the account of an unknown address", async () => {
      const created = account();
      mockUserRepository.findOrCreateUser.mockResolvedValue(
        new ResponseModel<User>("tx-1").withResponse(created),
      );

      const res = await signInWith(profile());

      expect(res.data).toBe(signedIn);
      expect(mockUserRepository.findOrCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          transactionId: "tx-1",
          data: expect.objectContaining({
            email: "test@e.com",
            name: "Test User",
            user: "Test User",
          }),
        }),
      );
      expect(mockUserRepository.linkGoogleIdentity).toHaveBeenCalledWith(
        "user-123",
        "google-sub-1",
      );
    });

    it.each([
      ["disabled", account(false), "Your account is disabled."],
      ["deleted", account(true, true), "Your account is deleted."],
    ])(
      "refuses a %s account without linking or recording it",
      async (_, found, message) => {
        mockUserRepository.findPasswordAccount.mockResolvedValue({
          user: found,
          passwordHash: null,
        });

        const res = await signInWith(profile());

        expect(res.errorCode).toBe(DomainErrorCodes.FORBIDDEN);
        expect(res.message).toBe(message);
        expect(res.data).toBeUndefined();
        expect(mockUserRepository.linkGoogleIdentity).not.toHaveBeenCalled();
        expect(mockUserRepository.recordSignIn).not.toHaveBeenCalled();
      },
    );

    it("refuses a closed account linked to the Google account", async () => {
      mockUserRepository.findGoogleAccount.mockResolvedValue(account(false));

      const res = await signInWith(profile());

      expect(res.errorCode).toBe(DomainErrorCodes.FORBIDDEN);
      expect(mockUserRepository.recordSignIn).not.toHaveBeenCalled();
    });

    it("passes on a failure to create the account", async () => {
      const failure = new ResponseModel<User>("tx-1").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Internal server error",
      );
      mockUserRepository.findOrCreateUser.mockResolvedValue(failure);

      const res = await signInWith(profile());

      expect(res).toBe(failure);
      expect(mockUserRepository.linkGoogleIdentity).not.toHaveBeenCalled();
      expect(mockUserRepository.recordSignIn).not.toHaveBeenCalled();
    });

    it("refuses a profile without a Google identifier", async () => {
      const res = await signInWith(profile({ sub: "" }));

      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(mockUserRepository.findGoogleAccount).not.toHaveBeenCalled();
    });

    it("answers a system error when the sign-in cannot be recorded", async () => {
      mockUserRepository.findGoogleAccount.mockResolvedValue(account());
      mockUserRepository.recordSignIn.mockRejectedValue(new Error("db down"));

      const res = await signInWith(profile());

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Internal server error");
      expect(res.data).toBeUndefined();
      expect(logger.err).toHaveBeenCalledWith(new Error("db down"));
    });
  });

  describe("getGuestData", () => {
    it("should return Guest user details successfully", async () => {
      const mockExistsResponse1 = new ResponseModel<boolean>(
        "tx-1",
      ).withResponse(true);
      const mockExistsResponse2 = new ResponseModel<boolean>(
        "tx-1",
      ).withResponse(false);
      mockUserRepository.userExists
        .mockResolvedValueOnce(mockExistsResponse1)
        .mockResolvedValueOnce(mockExistsResponse2);

      const mockPermission = new Permission(1, "users::read");
      const mockRole = new Role(1, "Guest", [mockPermission]);
      mockRoleRepository.queryGuestRole.mockResolvedValue(
        new ResponseModel<Role>("tx-1").withResponse(mockRole),
      );

      const req = new RequestModel<string>("tx-1", "existing-guest");
      const res = await useCase.getGuestData(req);

      expect(res.data?.id).not.toBe("existing-guest");
      expect(res.data?.name).toBe("Guest");
      expect(res.data?.user).toBe("Guest");
      expect(res.data?.email).toBe("guest@variamos.com");
      expect(res.data?.roles).toContain("Guest");
      expect(res.data?.permissions).toContain("users::read");
      expect(mockUserRepository.userExists).toHaveBeenCalledTimes(2);
    });

    it("should generate a random guest UUID if no id is provided in request", async () => {
      mockUserRepository.userExists.mockResolvedValue(
        new ResponseModel<boolean>("tx-1").withResponse(false),
      );
      mockRoleRepository.queryGuestRole.mockResolvedValue(
        new ResponseModel<Role>("tx-1").withResponse(null),
      );

      const req = new RequestModel<string>("tx-1");
      const res = await useCase.getGuestData(req);

      const guestId = res.data?.id;
      expect(guestId).toBeDefined();
      expect(typeof guestId).toBe("string");
      expect(guestId?.length).toBe(36); // UUID length
      expect(res.data?.roles).toEqual([]);
      expect(res.data?.permissions).toEqual([]);
    });

    it("should fallback to empty roles and permissions if guest role details are not found in DB", async () => {
      mockUserRepository.userExists.mockResolvedValue(
        new ResponseModel<boolean>("tx-1").withResponse(false),
      );
      mockRoleRepository.queryGuestRole.mockResolvedValue(
        new ResponseModel<Role>("tx-1").withResponse(null),
      );

      const req = new RequestModel<string>("tx-1", "guest-user");
      const res = await useCase.getGuestData(req);

      expect(res.data?.id).toBe("guest-user");
      expect(res.data?.roles).toEqual([]);
      expect(res.data?.permissions).toEqual([]);
    });

    it("should return error if userExists check returns an error response", async () => {
      const mockExistsResponse = new ResponseModel<boolean>("tx-1").withError(
        DomainErrorCodes.SYSTEM_ERROR,
        "Database issue",
      );
      mockUserRepository.userExists.mockResolvedValue(mockExistsResponse);

      const req = new RequestModel<string>("tx-1", "guest-id");
      const res = await useCase.getGuestData(req);

      expect(res.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
      expect(res.message).toBe("Database issue");
    });
  });

  describe("signUp errors", () => {
    it("should return error if signUp request data is missing", async () => {
      const req = new RequestModel<UserRegistration>("tx-1");
      const res = await useCase.signUp(req);
      expect(res.errorCode).toBe(DomainErrorCodes.INVALID_INPUT);
      expect(res.message).toBe(
        "Full name, Email and password, and password confirmation are required.",
      );
    });
  });
});
