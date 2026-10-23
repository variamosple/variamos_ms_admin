import { AesGcmSecretCipher } from "#src/Infrastructure/Security/AesGcmSecretCipher.js";
import { SecretConfigurationValue } from "../Configuration/SecretConfigurationValue.js";
import { MicroServiceRepositoryImpl } from "./MicroServiceRepository.js";

const FULL_ID =
  "4f1c2a9b8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a";

const monitored = {
  Id: FULL_ID,
  Names: ["/variamos_main-variamos_ms_languages-1"],
  Labels: {
    "variamos.service.monitored": "true",
    "variamos.service.name": "variamos_ms_languages",
    "com.docker.compose.service": "variamos-ms-languages",
  },
};
const unmonitored = {
  Id: "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a4f1c2a9b8d7e6f5a4b3c2d1e0f",
  Names: ["/postgres"],
  Labels: { "com.docker.compose.service": "postgres" },
};

describe("MicroServiceRepositoryImpl container resolution", () => {
  const resolve = (target: string) => {
    const repository = new MicroServiceRepositoryImpl({
      socketPath: "/nonexistent/docker.sock",
      secrets: new SecretConfigurationValue(new AesGcmSecretCipher(null)),
    });
    (repository as unknown as { dockerConnection: unknown }).dockerConnection =
      {
        listContainers: vi.fn().mockResolvedValue([monitored, unmonitored]),
        getContainer: (id: string) => ({ id }),
      };
    return (
      repository as unknown as {
        resolveContainer: (t: string) => Promise<{ id: string } | null>;
      }
    ).resolveContainer(target);
  };

  it.each([
    ["the full container id", FULL_ID],
    ["the service name", "variamos_ms_languages"],
    ["the compose service name", "variamos-ms-languages"],
    ["the container name", "/variamos_main-variamos_ms_languages-1"],
  ])("finds a monitored container by %s", async (_label, target) => {
    await expect(resolve(target)).resolves.toEqual({ id: FULL_ID });
  });

  it.each([
    ["an id prefix", FULL_ID.slice(0, 6)],
    ["a partial name", "languages"],
    ["a one-letter name", "a"],
  ])("refuses %s", async (_label, target) => {
    await expect(resolve(target)).resolves.toBeNull();
  });

  it("refuses a container that does not opt in to monitoring", async () => {
    await expect(resolve("postgres")).resolves.toBeNull();
    await expect(resolve(unmonitored.Id)).resolves.toBeNull();
  });
});
