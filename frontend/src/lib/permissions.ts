import { Appeal, AuthUser } from "../types";

export function isManagerOrAdmin(user: AuthUser): boolean {
  return user.role === "MANAGER" || user.role === "ADMIN";
}

export function canEditAppeal(user: AuthUser, appeal: Appeal): boolean {
  return isManagerOrAdmin(user) || appeal.operator.id === user.id;
}

export function canEditAssignments(user: AuthUser): boolean {
  return isManagerOrAdmin(user);
}
