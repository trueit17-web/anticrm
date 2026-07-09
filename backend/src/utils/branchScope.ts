import { Request } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";

// SUPERADMIN accounts aren't tied to a branch — they pick which one to act
// on via ?branchId=, and may pick any branch that exists. Every other role
// has a home branch (User.branchId) set at registration, plus optionally
// extra branches granted by a SUPERADMIN (UserBranchAccess) for managers
// who work cases across offices. Requesting a branch outside that set
// silently falls back to their home branch rather than erroring.
export async function resolveBranchId(req: Request): Promise<number | null> {
  const raw = req.query.branchId;
  const requested = typeof raw === "string" ? Number(raw) : NaN;
  const hasRequested = Number.isInteger(requested);

  if (req.user!.role === Role.SUPERADMIN) {
    return hasRequested ? requested : null;
  }

  const homeBranchId = req.user!.branchId;
  if (!hasRequested || requested === homeBranchId) {
    return homeBranchId;
  }

  const granted = await prisma.userBranchAccess.findUnique({
    where: { userId_branchId: { userId: req.user!.id, branchId: requested } },
  });
  return granted ? requested : homeBranchId;
}
