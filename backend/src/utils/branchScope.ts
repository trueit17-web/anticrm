import { Request } from "express";
import { Role } from "@prisma/client";

// SUPERADMIN accounts aren't tied to a branch — they pick which one to act
// on via ?branchId=. Every other role is locked to the branch set on their
// account at registration time; any branchId query param is ignored for them.
export function resolveBranchId(req: Request): number | null {
  if (req.user!.role === Role.SUPERADMIN) {
    const raw = req.query.branchId;
    const parsed = typeof raw === "string" ? Number(raw) : NaN;
    return Number.isInteger(parsed) ? parsed : null;
  }
  return req.user!.branchId;
}
