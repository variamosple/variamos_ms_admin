import { ResponseModel } from "@src/Domain/Core/Entity/ResponseModel";
import { Menu } from "@src/Domain/Menu/Entity/Menu";
import { Request, Router } from "express";

export const CONFIGURATION_V1_ROUTE = "/v1/configurations";

const configurationV1Router = Router();

const MENU: Menu = {
  items: [
    {
      title: "Home",
      type: "location",
      location: "https://app.variamos.com/",
      target: "newWindow",
    },
    {
      title: "Admin",
      type: "location",
      location: "https://app.variamos.com//variamos_admin/",
      allowedPermissions: [
        "users::query",
        "roles::query",
        "permissions::query",
        "metrics::query",
        "micro-services",
      ],
    },
    {
      title: "Languages",
      type: "location",
      location: "https://app.variamos.com//variamos_languages/",
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
          title: "Metrics",
          location: "/metrics",
          allowedPermissions: ["metrics::query"],
        },
        {
          title: "Monitoring",
          location: "/monitoring",
          allowedPermissions: ["micro-services::query"],
        },
      ],
    },
  ],
  options: [
    {
      title: "My account",
      location: "https://app.variamos.com/variamos_admin/#/my-account",
      allowedPermissions: ["my-account::query"],
    },
    {
      title: "Report a problem",
      location: `https://github.com/variamosple/VariaMosLanguages/issues/new`,
      accessibleFrom: "/variamos_admin/",
      target: "newWindow",
      allowedPermissions: [],
    },
    {
      title: "Issues",
      location: `https://github.com/variamosple/VariaMosLanguages/issues/`,
      accessibleFrom: "/variamos_admin/",
      target: "newWindow",
      allowedPermissions: [],
    },
    {
      title: "Report a problem",
      location: `https://github.com/variamosple/VariaMosAdmin/issues/new`,
      accessibleFrom: "/variamos_languages/",
      target: "newWindow",
      allowedPermissions: ["languages::create", "product-lines::create"],
    },
    {
      title: "Issues",
      location: `https://github.com/variamosple/VariaMosAdmin/issues/`,
      accessibleFrom: "/variamos_languages/",
      target: "newWindow",
      allowedPermissions: ["languages::create", "product-lines::create"],
    },
    {
      title: "Report a problem",
      location: `https://github.com/variamosple/VariaMosPLE/issues/new`,
      accessibleFrom: "/variamos_languages/",
      target: "newWindow",
      allowedPermissions: [],
    },
    {
      title: "Issues",
      location: `https://github.com/variamosple/VariaMosPLE/issues/`,
      accessibleFrom: "/variamos_languages/",
      target: "newWindow",
      allowedPermissions: [],
    },
  ],
};

configurationV1Router.get("/menu", async (_: Request, res) => {
  const response = new ResponseModel<Menu>("getMenu");

  res.status(200).json(response.withResponse(MENU));
});

export default configurationV1Router;
