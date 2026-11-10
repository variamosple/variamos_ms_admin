import type { z } from "zod";
import {
  bugCreateBody,
  bugNoteBody,
  bugStatusBody,
  configurationUpdateBody,
  microServiceCheckBody,
  microServiceConfigurationBody,
  nameBody,
  notificationAudienceBody,
  notificationDispatchBody,
  rolePermissionBody,
  userRoleBody,
  visitBody,
} from "./adminRequestBodies.js";

const accepts = (schema: z.ZodType, body: unknown) =>
  schema.safeParse(body).success;

describe("administration request bodies (EV-97 lot 6b)", () => {
  // What the administration interface sends today
  it.each<[string, z.ZodType, unknown]>([
    [
      "audience",
      notificationAudienceBody,
      { audience: "role", roles: ["admin"] },
    ],
    [
      "dispatch",
      notificationDispatchBody,
      { audience: "users", userIds: ["u-1"], title: "Hi", body: "Text" },
    ],
    [
      "bug creation (multipart text fields)",
      bugCreateBody,
      {
        title: "Crash",
        description: "Steps",
        priority: "high",
        category: "ui",
      },
    ],
    ["bug status", bugStatusBody, { status: "approved", comment: "Ok" }],
    ["bug note", bugNoteBody, { body: "Seen" }],
    ["text configuration", configurationUpdateBody, { value: "on" }],
    ["number configuration", configurationUpdateBody, { value: 12 }],
    ["boolean configuration", configurationUpdateBody, { value: false }],
    ["list configuration", configurationUpdateBody, { value: ["a", "b"] }],
    ["object configuration", configurationUpdateBody, { value: { a: 1 } }],
    ["health check of every service", microServiceCheckBody, {}],
    ["service configuration", microServiceConfigurationBody, { value: "" }],
    ["name", nameBody, { id: 3, name: "bugs::query" }],
    ["permission id as a number", rolePermissionBody, { permissionId: 2 }],
    ["permission id as digits", rolePermissionBody, { permissionId: "2" }],
    ["role id", userRoleBody, { userId: "u-1", roleId: 4 }],
    ["visit", visitBody, { pageId: "dashboard" }],
  ])("accepts the %s body", (_name, schema, body) => {
    expect(accepts(schema, body)).toBe(true);
  });

  it.each<[string, z.ZodType, unknown]>([
    [
      "an audience given as a list",
      notificationAudienceBody,
      { audience: ["role"] },
    ],
    ["user ids that are not text", notificationAudienceBody, { userIds: [1] }],
    [
      "more than 10 000 user ids",
      notificationAudienceBody,
      { userIds: Array.from({ length: 10_001 }, (_, i) => `u-${i}`) },
    ],
    [
      "a title over 1 000 characters",
      notificationDispatchBody,
      { title: "x".repeat(1_001) },
    ],
    ["a repeated multipart field", bugCreateBody, { title: ["a", "b"] }],
    [
      "a bug text over 65 536 characters",
      bugStatusBody,
      { comment: "x".repeat(65_537) },
    ],
    ["a note that is not text", bugNoteBody, { body: { text: "x" } }],
    ["a null configuration", configurationUpdateBody, { value: null }],
    [
      "a list of numbers as configuration",
      configurationUpdateBody,
      { value: [1] },
    ],
    [
      "a service name that is not text",
      microServiceCheckBody,
      { serviceName: 1 },
    ],
    [
      "a service value that is not text",
      microServiceConfigurationBody,
      { value: 3 },
    ],
    ["a name over 255 characters", nameBody, { name: "x".repeat(256) }],
    ["an id given as a list", rolePermissionBody, { permissionId: [2] }],
    ["a negative id", userRoleBody, { roleId: -1 }],
    ["a decimal id", userRoleBody, { roleId: 1.5 }],
    ["an id with other characters", userRoleBody, { roleId: "4 OR 1=1" }],
    ["a page id that is not text", visitBody, { pageId: 7 }],
  ])("refuses %s", (_name, schema, body) => {
    expect(accepts(schema, body)).toBe(false);
  });
});
