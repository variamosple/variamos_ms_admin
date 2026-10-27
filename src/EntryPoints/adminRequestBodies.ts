import { z } from "zod";
import { EMAIL_MAX, NAME_MAX, numericId, optionalText } from "./requestBody.js";

// Bodies of the administration routes (EV-97 lot 6b). As for the
// authentication routes, the schemas refuse a wrong type or an oversized
// value; each route and the domain keep their own rules and messages

// The size of a GitHub issue body, where bug texts end up
const LONG_TEXT_MAX = 65_536;

const accountIds = z.array(z.string().max(NAME_MAX)).max(10_000).optional();

export const notificationAudienceBody = z.object({
  audience: optionalText(32),
  roles: z.array(z.string().max(NAME_MAX)).max(1_000).optional(),
  userIds: accountIds,
});

export const notificationDispatchBody = notificationAudienceBody.extend({
  title: optionalText(1_000),
  body: optionalText(LONG_TEXT_MAX),
});

const bugFields = {
  title: optionalText(1_000),
  description: optionalText(LONG_TEXT_MAX),
  priority: optionalText(32),
  category: optionalText(NAME_MAX),
  component: optionalText(NAME_MAX),
  githubRepo: optionalText(NAME_MAX),
};

export const bugCreateBody = z.object({
  ...bugFields,
  reporterEmail: optionalText(EMAIL_MAX),
});

export const bugStatusBody = z.object({
  ...bugFields,
  status: optionalText(32),
  comment: optionalText(LONG_TEXT_MAX),
});

export const bugNoteBody = z.object({
  body: optionalText(LONG_TEXT_MAX),
});

// The value types a configuration accepts; its own type is checked by the
// use case
export const configurationUpdateBody = z.object({
  value: z
    .union([
      z.string().max(LONG_TEXT_MAX),
      z.number(),
      z.boolean(),
      z.array(z.string().max(LONG_TEXT_MAX)).max(1_000),
      z.record(z.string(), z.unknown()),
    ])
    .optional(),
});

export const microServiceCheckBody = z.object({
  serviceName: optionalText(NAME_MAX),
});

export const microServiceConfigurationBody = z.object({
  value: optionalText(LONG_TEXT_MAX),
});

export const nameBody = z.object({
  name: optionalText(NAME_MAX),
});

export const rolePermissionBody = z.object({
  permissionId: numericId,
});

export const userRoleBody = z.object({
  roleId: numericId,
});

export const visitBody = z.object({
  pageId: optionalText(NAME_MAX),
});
