import { DomainError } from "#src/Domain/Core/Error/DomainError.js";
import { PersonalInformationUpdate } from "./PersonalInformationUpdate.js";

describe("PersonalInformationUpdate Entity - Unit Tests", () => {
  it("should build a PersonalInformationUpdate using constructor", () => {
    const update = new PersonalInformationUpdate("user-123", "FR");
    expect(update.getUserId()).toBe("user-123");
    expect(update.getCountryCode()).toBe("FR");
  });

  it("should build a PersonalInformationUpdate using builder", () => {
    const builder = PersonalInformationUpdate.builder()
      .setUserId("user-456")
      .setCountryCode("US");

    expect(builder.getUserId()).toBe("user-456");
    expect(builder.getCountryCode()).toBe("US");

    const update = PersonalInformationUpdate.build(builder);
    expect(update.getUserId()).toBe("user-456");
    expect(update.getCountryCode()).toBe("US");

    const updateFromBuildMethod = builder.build();
    expect(updateFromBuildMethod.getUserId()).toBe("user-456");
  });

  it("keeps no country for a blank one, and refuses a code that is not two letters (EV-47)", () => {
    expect(new PersonalInformationUpdate("u", "").getCountryCode()).toBeNull();
    expect(new PersonalInformationUpdate("u", " fr ").getCountryCode()).toBe(
      "FR",
    );
    expect(() => new PersonalInformationUpdate("u", "FRA")).toThrow(
      DomainError,
    );
  });
});
