import { isSecretMask, SECRET_MASK } from "./SecretMask.js";

describe("isSecretMask", () => {
  it.each([SECRET_MASK, "••••••••", `  ${SECRET_MASK} `])(
    "detects the mask %j",
    (value) => {
      expect(isSecretMask(value)).toBe(true);
    },
  );

  it.each(["new-password", "", "*******", 8, null, undefined])(
    "does not treat %j as a mask",
    (value) => {
      expect(isSecretMask(value)).toBe(false);
    },
  );
});
