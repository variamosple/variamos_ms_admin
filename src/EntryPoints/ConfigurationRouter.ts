import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import EnvVars from "#src/common/EnvVars.js";
import {
  announcementOf,
  type ConfigurationAnnouncement,
} from "#src/Domain/Configuration/Entity/AnnouncedConfigurationKeys.js";
import {
  type AcceptedConfigurationValues,
  acceptedValuesOf,
  isConfigurationApplied,
} from "#src/Domain/Configuration/Entity/AppliedConfigurationKeys.js";
import type { Configuration } from "#src/Domain/Configuration/Entity/Configuration.js";
import type { ConfigurationUseCase } from "#src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { RequestModel } from "#src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "#src/Domain/Core/Entity/ResponseModel.js";
import type { Menu } from "#src/Domain/Menu/Entity/Menu.js";
import { configurationUpdateBody } from "./adminRequestBodies.js";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";
import { sendError } from "./errorResponse.js";
import { queryText } from "./queryText.js";
import { checkedBody, validBody } from "./requestBody.js";

export const CONFIGURATION_V1_ROUTE = "/v1/configurations";

type ConfigurationValueDto =
  | string
  | number
  | boolean
  | string[]
  | Record<string, unknown>;

export interface ConfigurationResponseDto {
  id?: number;
  key: string;
  value: ConfigurationValueDto;
  type: "boolean" | "string" | "number" | "array" | "object";
  category: "general" | "security" | "notification" | "env";
  requiresMfa: boolean;
  isSecret: boolean;
  environmentScope: string;
  isReadOnly: boolean;
  /** False when no code reads the key yet: changing it has no effect. */
  isApplied: boolean;
  /** What a key the code reads accepts, for the form (EV-18 lot C). */
  accepts?: AcceptedConfigurationValues;
  /** The announcement its value suggests, for a setting users notice (EV-115). */
  announcement?: ConfigurationAnnouncement;
  targetServices: string[];
  description?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/** A configuration as the screen shows it: a secret only as its mask. */
const toConfigurationResponse = (
  config: Configuration,
): ConfigurationResponseDto => ({
  id: config.id,
  key: config.key.getValue(),
  value: config.getDisplayValue(),
  type: config.type,
  category: config.category,
  requiresMfa: config.requiresMfa,
  isSecret: config.isSecret,
  environmentScope: config.environmentScope,
  isReadOnly: config.isReadOnly,
  isApplied: isConfigurationApplied(config.key.getValue()),
  accepts: acceptedValuesOf(config.key.getValue()),
  announcement:
    announcementOf(config.key.getValue(), config.getDisplayValue()) ??
    undefined,
  targetServices: config.targetServices,
  description: config.description,
  updatedBy: config.updatedBy,
  createdAt: config.createdAt,
  updatedAt: config.updatedAt,
});

/** What every page may know before signing in (EV-87 lot 2). */
interface PublicSettingsDto {
  siteName: string;
}

// The pages of the administration, in the order of its sub-menu
const ADMIN_PAGES: Menu["subMenu"][number]["items"] = [
  {
    title: "Users",
    location: "/users",
    allowedPermissions: ["users::query"],
  },
  {
    title: "Roles",
    location: "/roles",
    allowedPermissions: ["roles::query"],
  },
  {
    title: "Permission",
    location: "/permissions",
    allowedPermissions: ["permissions::query"],
  },
  {
    title: "Languages",
    location: "/languages",
    allowedPermissions: ["admin::languages::query"],
  },
  {
    title: "Projects",
    location: "/projects",
    allowedPermissions: ["admin::projects::query"],
  },
  {
    title: "Models",
    location: "/models",
    allowedPermissions: ["admin::models::query"],
  },
  {
    title: "Metrics",
    location: "/metrics",
    allowedPermissions: ["metrics::query"],
  },
  {
    title: "Monitoring",
    location: "/monitoring",
    allowedPermissions: ["micro-services::query"],
  },
  {
    title: "Bugs",
    location: "/bugs",
    allowedPermissions: ["bugs::query"],
  },
  {
    title: "Configurations",
    location: "/configurations",
    allowedPermissions: ["configurations::query"],
  },
  {
    title: "Notifications",
    location: "/admin/notifications",
    allowedPermissions: ["admin::notifications::dispatch"],
  },
  {
    title: "Journal",
    location: "/journal",
    allowedPermissions: ["activity-logs::query"],
  },
];

/**
 * The "Admin" entry is shown to whoever may open at least one of its pages:
 * its permissions are those of its pages, so that they cannot diverge (EV-96).
 */
const ADMIN_ENTRY_PERMISSIONS = [
  ...new Set(ADMIN_PAGES.flatMap((page) => page.allowedPermissions ?? [])),
];

const MENU: Menu = {
  items: [
    {
      title: "Home",
      type: "location",
      location: "https://app.variamos.com/",
    },
    {
      title: "Admin",
      type: "location",
      location: "https://app.variamos.com/variamos_admin/",
      allowedPermissions: ADMIN_ENTRY_PERMISSIONS,
    },
    {
      title: "Languages",
      type: "location",
      location: "https://app.variamos.com/variamos_languages/",
    },
    {
      title: "Laboratory",
      type: "location",
      location: "https://app.variamos.com/variamos_laboratory/",
      // Given to administrators only at first (migration 0012), as the
      // Laboratory backend refuses every other account
      allowedPermissions: ["laboratory::access"],
    },
    {
      title: "Wiki",
      type: "location",
      location: "https://github.com/variamosple/VariaMosPLE/wiki",
      target: "newWindow",
    },
  ],
  subMenu: [
    {
      accessibleFrom: "/variamos_admin/",
      items: ADMIN_PAGES,
    },
  ],
  options: [
    {
      title: "My account",
      // Absolute: the shared header opens it from PLE and Languages too
      location: "https://app.variamos.com/variamos_admin/#/my-account",
      allowedPermissions: ["my-account::query"],
    },
    {
      title: "Report a problem",
      location: "#report-bug",
      accessibleFrom: "/variamos_languages/",
      target: "sameWindow",
      allowedPermissions: [],
    },
    {
      title: "Issues",
      location: "https://github.com/variamosple/VariaMosLanguages/issues/",
      accessibleFrom: "/variamos_languages/",
      target: "newWindow",
      allowedPermissions: [],
    },
    {
      title: "Report a problem",
      location: "#report-bug",
      accessibleFrom: "/",
      target: "sameWindow",
      allowedPermissions: [],
    },
    {
      title: "Issues",
      location: "https://github.com/variamosple/VariaMosPLE/issues/",
      accessibleFrom: "/",
      target: "newWindow",
      allowedPermissions: [],
    },
    {
      title: "Report a problem",
      location: "#report-bug",
      accessibleFrom: "/variamos_admin/",
      target: "sameWindow",
      allowedPermissions: ["languages::create", "product-lines::create"],
    },
    {
      title: "Issues",
      location: "https://github.com/variamosple/VariaMosAdmin/issues/",
      accessibleFrom: "/variamos_admin/",
      target: "newWindow",
      allowedPermissions: ["languages::create", "product-lines::create"],
    },
  ],
};

const PRODUCTION_ORIGIN = "https://app.variamos.com";

// In development, the production addresses point to the local dev server
const toLocalServer = (menu: Menu) => {
  for (const item of [...(menu.items ?? []), ...(menu.options ?? [])]) {
    if (item.location?.startsWith(PRODUCTION_ORIGIN)) {
      const urlPath = item.location.slice(PRODUCTION_ORIGIN.length);
      item.location = `http://localhost:3000${urlPath}`;
    }
  }
};

/**
 * The menu for the page that asks for it: inside the admin, the Admin entry
 * and "My account" stay in the same page; elsewhere, they open the admin.
 */
const menuFor = (referer: string, isDevelopment: boolean): Menu => {
  const menu = structuredClone(MENU);
  const inAdmin = referer.includes("/variamos_admin/");
  if (isDevelopment) {
    toLocalServer(menu);
  } else if (inAdmin) {
    const adminItem = menu.items?.find((item) => item.title === "Admin");
    if (adminItem) adminItem.location = "/variamos_admin/#/";
  }
  const myAccount = menu.options?.find((opt) => opt.title === "My account");
  if (myAccount && inAdmin) {
    myAccount.location = "/variamos_admin/#/my-account";
  }
  return menu;
};

export function createConfigurationRouter(
  configurationUseCase: ConfigurationUseCase,
): Router {
  const configurationV1Router = Router();

  configurationV1Router.get("/menu", (req: Request, res) => {
    const response = new ResponseModel<Menu>("getMenu");
    const menu = menuFor(req.headers.referer || "", EnvVars.IsDevelopment);
    res.status(200).json(response.withResponse(menu));
  });

  // Open to all, like the menu: the name the browser tabs show. Only the
  // settings listed in PublicSettingsDto leave here, never another key.
  configurationV1Router.get("/public", async (_req: Request, res) => {
    const transactionId = "getPublicSettings";
    try {
      const siteName = await configurationUseCase.getSiteName();
      const response = new ResponseModel<PublicSettingsDto>(transactionId);
      res.status(200).json(response.withResponse({ siteName }));
    } catch (error) {
      sendError(res, error, transactionId);
    }
  });

  // Query configurations
  configurationV1Router.get(
    "/",
    hasPermissions(["configurations::query"]),
    async (req: Request, res) => {
      const transactionId = "queryConfigurations";
      const { category, environmentScope } = req.query;

      try {
        const filter = {
          category: queryText(category),
          environmentScope: queryText(environmentScope),
        };
        const request = new RequestModel(transactionId, filter);
        const useCaseResponse =
          await configurationUseCase.queryConfigurations(request);

        const response = new ResponseModel<ConfigurationResponseDto[]>(
          useCaseResponse.transactionId,
          {
            errorCode: useCaseResponse.errorCode,
            message: useCaseResponse.message,
            totalCount: useCaseResponse.totalCount,
          },
        );

        if (useCaseResponse.data) {
          response.data = useCaseResponse.data.map(toConfigurationResponse);
        }

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  // Update a configuration option
  configurationV1Router.put(
    "/:key",
    hasPermissions(["configurations::update"]),
    validBody(configurationUpdateBody, "updateConfiguration"),
    async (req: Request<{ key: string }>, res) => {
      const transactionId = "updateConfiguration";
      const key = req.params.key;
      // A client-sent MFA flag is ignored: the proof must come from the
      // server (T-10); until it exists, MFA-protected keys stay locked.
      const { value } = checkedBody(configurationUpdateBody, req);

      try {
        const operatorId = req.user?.id || "system";

        const request = new RequestModel(transactionId, {
          key,
          value,
          operatorId,
        });

        const useCaseResponse =
          await configurationUseCase.updateConfiguration(request);

        const response = new ResponseModel<ConfigurationResponseDto>(
          useCaseResponse.transactionId,
          {
            errorCode: useCaseResponse.errorCode,
            message: useCaseResponse.message,
            totalCount: useCaseResponse.totalCount,
          },
        );

        if (useCaseResponse.data) {
          response.data = toConfigurationResponse(useCaseResponse.data);
        }

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        sendError(res, error, transactionId);
      }
    },
  );

  return configurationV1Router;
}
