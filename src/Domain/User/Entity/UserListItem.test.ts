import { userListItemOf } from "./UserListItem.js";

const stored = {
  id: "u1",
  user: "jane",
  name: "Jane",
  email: " Jane@Example.com ",
  isEnabled: true,
  isDeleted: false,
  createdAt: new Date("2026-01-10T08:00:00Z"),
  lastLogin: new Date("2026-11-02T08:00:00Z"),
};

describe("userListItemOf (EV-29)", () => {
  it("shows a well-formed address as the domain cleans it", () => {
    expect(userListItemOf(stored)).toEqual({
      ...stored,
      email: "jane@example.com",
      emailValid: true,
    });
  });

  it.each(["not an address", "jane@example", ""])(
    "keeps the stored address %j and flags it, instead of failing",
    (email) => {
      expect(userListItemOf({ ...stored, email })).toMatchObject({
        email,
        emailValid: false,
      });
    },
  );

  it("reads what is missing without making it up", () => {
    expect(
      userListItemOf({
        id: undefined,
        user: "old",
        name: null,
        email: null,
        isEnabled: null,
        isDeleted: null,
        createdAt: null,
        lastLogin: null,
      }),
    ).toEqual({
      id: null,
      user: "old",
      name: "",
      email: "",
      emailValid: false,
      // An unknown state is never shown as active
      isEnabled: false,
      isDeleted: false,
      createdAt: null,
      lastLogin: null,
    });
  });
});
