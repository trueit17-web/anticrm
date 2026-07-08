import { AuthUser } from "../types";

export function isManagerOrAdmin(user: AuthUser): boolean {
  return user.role === "MANAGER" || user.role === "ADMIN";
}

// Any authenticated employee may edit any appeal — ownership no longer restricts editing.
export function canEditAppeal(_user: AuthUser, _appeal: unknown): boolean {
  return true;
}

// Госы/ЦБ/ФСБ/Закрыв stay manager/admin-only.
export function canEditAssignments(user: AuthUser): boolean {
  return isManagerOrAdmin(user);
}
