import type { Nullable } from "#src/Domain/Core/Entity/Nullable.js";
import { Email } from "./Email.js";

/**
 * An account as the list of accounts shows it (EV-29). The list reads what
 * is stored and never refuses a row: one address that is not well formed
 * used to fail the whole page with a 500. Such an address is shown as
 * stored and flagged, so that the administrator sees it. Writing stays
 * strict: this is not a User, and nothing is saved from it.
 */
export interface UserListItem {
  id: Nullable<string>;
  user: string;
  name: string;
  email: string;
  /** False when the stored address would be refused today. */
  emailValid: boolean;
  isEnabled: boolean;
  isDeleted: boolean;
  /** Null when not stored: never a made-up date. */
  createdAt: Nullable<Date>;
  lastLogin: Nullable<Date>;
}

/** A stored account row, as the database gives it. */
export interface StoredAccountRow {
  id?: Nullable<string>;
  user: string;
  name: string | null;
  email: string | null;
  isEnabled?: boolean | null;
  isDeleted?: boolean | null;
  createdAt?: Date | null;
  lastLogin?: Date | null;
}

/**
 * The list item of a stored row. A state that is not stored reads as
 * disabled and not deleted: an unknown state is never shown as active.
 */
export const userListItemOf = (row: StoredAccountRow): UserListItem => {
  const emailValid = Email.isValid(row.email);
  return {
    id: row.id ?? null,
    user: row.user,
    name: row.name ?? "",
    email: emailValid
      ? new Email(row.email ?? "").getValue()
      : (row.email ?? ""),
    emailValid,
    isEnabled: row.isEnabled === true,
    isDeleted: row.isDeleted === true,
    createdAt: row.createdAt ?? null,
    lastLogin: row.lastLogin ?? null,
  };
};
