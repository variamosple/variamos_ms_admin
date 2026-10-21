/** An operation on a role or an account, checked against the role hierarchy. */
export type AccessCheck =
  | { kind: "assign-role" | "remove-role"; userId: string; roleId: number }
  | {
      kind: "add-permission" | "remove-permission";
      roleId: number;
      permissionId: number;
    }
  | { kind: "update-role" | "delete-role"; roleId: number }
  | {
      kind:
        | "disable-account"
        | "enable-account"
        | "delete-account"
        | "recovery-link"
        | "reset-mfa";
      userId: string;
    };
