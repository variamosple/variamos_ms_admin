import logger from "jet-logger";
import { mock } from "vitest-mock-extended";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "#src/Domain/Core/Error/DomainErrorCodes.js";
import type { IMailService } from "#src/Domain/Mail/IMailService.js";
import type {
  IUserMfaRepository,
  UserMfaRecord,
} from "#src/Domain/Mfa/Repository/IUserMfaRepository.js";
import { User } from "#src/Domain/User/Entity/User.js";
import type { IUserRepository } from "#src/Domain/User/IUserRepository.js";
import { MfaResetUseCase } from "./MfaResetUseCase.js";

// The activity journal is checked by its own tests (T-24)
const activityJournal = { record: vi.fn().mockResolvedValue(undefined) };

const ON: UserMfaRecord = {
  userId: "user-2",
  secretEncrypted: "v1:x",
  enabledAt: new Date(),
  lastUsedStep: 1,
};

const bea = () =>
  User.builder()
    .setId("user-2")
    .setName("Bea")
    .setUser("bea")
    .setEmail("bea@example.com")
    .build();

function setUp(record: UserMfaRecord | null) {
  const mfaRepository = mock<IUserMfaRepository>();
  mfaRepository.findByUser.mockResolvedValue(record);
  const userRepository = mock<IUserRepository>();
  userRepository.queryById.mockResolvedValue(
    new ResponseModel<User>("t").withResponse(bea()),
  );
  const mailService = mock<IMailService>();
  mailService.sendMfaResetMail.mockResolvedValue(true);
  const useCase = new MfaResetUseCase(
    mfaRepository,
    userRepository,
    mailService,
    activityJournal,
  );
  return { useCase, mfaRepository, userRepository, mailService };
}

describe("MfaResetUseCase", () => {
  beforeEach(() => {
    vi.spyOn(logger, "info").mockImplementation(() => logger);
    vi.spyOn(logger, "warn").mockImplementation(() => logger);
    vi.spyOn(logger, "err").mockImplementation(() => logger);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("status", () => {
    it.each([
      ["on", ON, true],
      ["pending, not confirmed", { ...ON, enabledAt: null }, false],
      ["absent", null, false],
    ])("reports a factor %s", async (_label, record, enabled) => {
      const { useCase } = setUp(record);

      const response = await useCase.status("t", "user-2");

      expect(response.data).toEqual({ enabled });
    });

    it("hides a storage error", async () => {
      const { useCase, mfaRepository } = setUp(ON);
      mfaRepository.findByUser.mockRejectedValue(new Error("down"));

      const response = await useCase.status("t", "user-2");

      expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });

  describe("reset", () => {
    it("turns the factor off, logs who did it and tells the owner", async () => {
      const { useCase, mfaRepository, mailService } = setUp(ON);

      const response = await useCase.reset("t", "user-2", "admin-1");

      expect(response.data).toEqual({ emailSent: true });
      expect(mfaRepository.remove).toHaveBeenCalledWith("user-2");
      expect(mailService.sendMfaResetMail).toHaveBeenCalledWith(
        "bea@example.com",
      );
      expect(JSON.stringify(vi.mocked(logger.info).mock.calls)).toContain(
        "user-2 turned off by administrator admin-1",
      );
      expect(activityJournal.record).toHaveBeenLastCalledWith(
        expect.objectContaining({
          actorId: "admin-1",
          action: "user.mfa.reset",
          entityType: "user",
          entityId: "user-2",
        }),
      );
    });

    it.each([
      ["absent", null],
      ["pending, not confirmed", { ...ON, enabledAt: null }],
    ])("answers not found for a factor %s", async (_label, record) => {
      const { useCase, mfaRepository, mailService } = setUp(record);

      const response = await useCase.reset("t", "user-2", "admin-1");

      expect(response.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(mfaRepository.remove).not.toHaveBeenCalled();
      expect(mailService.sendMfaResetMail).not.toHaveBeenCalled();
    });

    it("keeps the factor when the account cannot be read", async () => {
      const { useCase, mfaRepository, userRepository } = setUp(ON);
      userRepository.queryById.mockResolvedValue(
        new ResponseModel<User>("t").withError(
          DomainErrorCodes.ENTITY_NOT_FOUND,
          "User not found",
        ),
      );

      const response = await useCase.reset("t", "user-2", "admin-1");

      expect(response.errorCode).toBe(DomainErrorCodes.ENTITY_NOT_FOUND);
      expect(mfaRepository.remove).not.toHaveBeenCalled();
    });

    it.each([
      ["refuses", () => Promise.resolve(false)],
      ["throws", () => Promise.reject(new Error("smtp down"))],
    ])("still turns the factor off when the mail %s", async (_label, send) => {
      const { useCase, mfaRepository, mailService } = setUp(ON);
      mailService.sendMfaResetMail.mockImplementation(send);

      const response = await useCase.reset("t", "user-2", "admin-1");

      expect(response.data).toEqual({ emailSent: false });
      expect(mfaRepository.remove).toHaveBeenCalledWith("user-2");
      expect(logger.warn).toHaveBeenCalled();
    });

    it("hides a storage error", async () => {
      const { useCase, mfaRepository } = setUp(ON);
      mfaRepository.remove.mockRejectedValue(new Error("down"));

      const response = await useCase.reset("t", "user-2", "admin-1");

      expect(response.errorCode).toBe(DomainErrorCodes.SYSTEM_ERROR);
    });
  });
});
