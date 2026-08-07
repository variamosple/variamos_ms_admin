export type NavigationTarget =
  | "newWindow"
  | "sameWindow"
  | "parentContainer"
  | "rootContainer";

export interface MenuItemBase {
  title: string;
  allowedRoles?: string[];
  allowedPermissions?: string[];
  target?: NavigationTarget;
}

export interface MenuSubItem extends MenuItemBase {
  location: string;
}

export interface SubMenu {
  accessibleFrom: string;
  items: MenuSubItem[];
}

export interface MenuItem extends MenuItemBase {
  type: "location" | "dropdown";
  location?: string;
  children?: MenuSubItem[];
}

export interface MenuOption extends MenuItemBase {
  accessibleFrom?: string;
  location: string;
}

export interface Menu {
  items: MenuItem[];
  subMenu: SubMenu[];
  options: MenuOption[];
}
