type NavigationTarget =
  | "newWindow"
  | "sameWindow"
  | "parentContainer"
  | "rootContainer";

interface MenuItemBase {
  title: string;
  allowedRoles?: string[];
  allowedPermissions?: string[];
  target?: NavigationTarget;
}

interface MenuSubItem extends MenuItemBase {
  location: string;
}

interface SubMenu {
  accessibleFrom: string;
  items: MenuSubItem[];
}

interface MenuItem extends MenuItemBase {
  type: "location" | "dropdown";
  location?: string;
  children?: MenuSubItem[];
}

interface MenuOption extends MenuItemBase {
  accessibleFrom?: string;
  location: string;
}

export interface Menu {
  items: MenuItem[];
  subMenu: SubMenu[];
  options: MenuOption[];
}
