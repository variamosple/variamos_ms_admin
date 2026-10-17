export interface AccountPermissions {
  /** Enabled and not deleted. */
  isActive: boolean;
  /** Union of the permissions of all the account's roles. */
  permissions: string[];
}

export interface IAccessHierarchyRepository {
  /** Null when the account does not exist. */
  getAccountPermissions(userId: string): Promise<AccountPermissions | null>;
  /** Null when the role does not exist. */
  getRolePermissions(roleId: number): Promise<string[] | null>;
  getPermissionName(permissionId: number): Promise<string | null>;
  /** Active accounts holding the permission, with the role that grants it. */
  listActiveHolders(
    permission: string,
  ): Promise<{ userId: string; roleId: number }[]>;
}
