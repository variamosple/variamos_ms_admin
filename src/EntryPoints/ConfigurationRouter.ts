import HttpStatusCodes from "@src/common/HttpStatusCodes.js";
import type { ConfigurationUseCase } from "@src/Domain/Configuration/UseCase/ConfigurationUseCase.js";
import { RequestModel } from "@src/Domain/Core/Entity/RequestModel.js";
import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel.js";
import { DomainErrorCodes } from "@src/Domain/Core/Error/DomainErrorCodes.js";
import type { Menu } from "@src/Domain/Menu/Entity/Menu.js";
import { hasPermissions } from "@variamosple/variamos-security";
import { type Request, Router } from "express";
import logger from "jet-logger";
import { mapDomainErrorToHttpStatus } from "./errorMapper.js";

export const CONFIGURATION_V1_ROUTE = "/v1/configurations";

export type ConfigurationValueDto =
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
  targetServices: string[];
  description?: string;
  updatedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

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
      allowedPermissions: [
        "users::query",
        "roles::query",
        "permissions::query",
        "metrics::query",
        "micro-services::query",
        "bugs::query",
      ],
    },
    {
      title: "Languages",
      type: "location",
      location: "https://app.variamos.com/variamos_languages/",
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
      items: [
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
      ],
    },
  ],
  options: [
    {
      title: "My account",
      location: "/variamos_admin/#/my-account",
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

export function createConfigurationRouter(
  configurationUseCase: ConfigurationUseCase,
): Router {
  const configurationV1Router = Router();

  configurationV1Router.get("/menu", (req: Request, res) => {
    const response = new ResponseModel<Menu>("getMenu");

    const menuCopy = JSON.parse(JSON.stringify(MENU)) as Menu;
    const referer = req.headers.referer || "";
    const hasAdminSubpath = referer.includes("/variamos_admin/");

    // Rewrite prod URLs to local dev server in development environment
    if (process.env.NODE_ENV === "development") {
      if (menuCopy.items) {
        for (const item of menuCopy.items) {
          if (item.location?.startsWith("https://app.variamos.com")) {
            const urlPath = item.location.substring(
              "https://app.variamos.com".length,
            );
            item.location = `http://localhost:3000${urlPath}`;
          }
        }
      }
    } else {
      if (hasAdminSubpath) {
        const adminItem = menuCopy.items?.find(
          (item) => item.title === "Admin",
        );
        if (adminItem) {
          adminItem.location = "/variamos_admin/#/";
        }
      }
    }

    const myAccountOption = menuCopy.options?.find(
      (opt) => opt.title === "My account",
    );
    if (myAccountOption) {
      myAccountOption.location = hasAdminSubpath
        ? "/variamos_admin/#/my-account"
        : "/my-account";
    }

    res.status(200).json(response.withResponse(menuCopy));
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
          category: category as string,
          environmentScope: environmentScope as string,
        };
        const request = new RequestModel(transactionId, filter);
        const useCaseResponse =
          await configurationUseCase.queryConfigurations(request);

        const response = new ResponseModel<ConfigurationResponseDto[]>(
          useCaseResponse.transactionId,
          useCaseResponse.errorCode,
          useCaseResponse.message,
          useCaseResponse.totalCount,
        );

        if (useCaseResponse.data) {
          response.data = useCaseResponse.data.map((config) => {
            return {
              id: config.id,
              key: config.key.getValue(),
              value: config.getDisplayValue(),
              type: config.type,
              category: config.category,
              requiresMfa: config.requiresMfa,
              isSecret: config.isSecret,
              environmentScope: config.environmentScope,
              isReadOnly: config.isReadOnly,
              targetServices: config.targetServices,
              description: config.description,
              updatedBy: config.updatedBy,
              createdAt: config.createdAt,
              updatedAt: config.updatedAt,
            };
          });
        }

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  // Update a configuration option
  configurationV1Router.put(
    "/:key",
    hasPermissions(["configurations::update"]),
    async (req: Request<{ key: string }>, res) => {
      const transactionId = "updateConfiguration";
      const key = req.params.key;
      const { value, isMfaVerified } = req.body as {
        value: ConfigurationValueDto;
        isMfaVerified?: boolean;
      };

      try {
        const operatorId = (req.user as { id?: string })?.id || "system";

        const request = new RequestModel(transactionId, {
          key,
          value,
          operatorId,
          isMfaVerified,
        });

        const useCaseResponse =
          await configurationUseCase.updateConfiguration(request);

        const response = new ResponseModel<ConfigurationResponseDto>(
          useCaseResponse.transactionId,
          useCaseResponse.errorCode,
          useCaseResponse.message,
          useCaseResponse.totalCount,
        );

        if (useCaseResponse.data) {
          const config = useCaseResponse.data;
          response.data = {
            id: config.id,
            key: config.key.getValue(),
            value: config.getDisplayValue(),
            type: config.type,
            category: config.category,
            requiresMfa: config.requiresMfa,
            isSecret: config.isSecret,
            environmentScope: config.environmentScope,
            isReadOnly: config.isReadOnly,
            targetServices: config.targetServices,
            description: config.description,
            updatedBy: config.updatedBy,
            createdAt: config.createdAt,
            updatedAt: config.updatedAt,
          };
        }

        const status = mapDomainErrorToHttpStatus(response.errorCode);
        res.status(status).json(response);
      } catch (error) {
        logger.err(error);
        const response = new ResponseModel(
          transactionId,
          DomainErrorCodes.SYSTEM_ERROR,
          "Internal Server Error",
        );
        res.status(HttpStatusCodes.INTERNAL_SERVER_ERROR).json(response);
      }
    },
  );

  return configurationV1Router;
}
