import { Request } from "express";
import { Role } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { DomainError } from "./DomainError";

// SUPERADMIN accounts aren't tied to a branch — they pick which one to act
// on via ?branchId=, and may pick any branch that exists. Every other role
// has a home branch (User.branchId) set at registration, plus optionally
// extra branches granted by a SUPERADMIN (UserBranchAccess) for managers
// who work cases across offices.
//
// A branchId that's missing from the request falls back to the home branch
// (or null/"all branches" for SUPERADMIN) — that's the only silent
// fallback. A branchId that's present but malformed or not one this user
// may act on is a 400/403, not a silent substitution: previously an
// unauthorized or stale branchId (e.g. from a different open tab that
// switched branches — see HI-05) got quietly rewritten to the caller's
// home branch, so a write could land in the wrong tenant without any
// indication something was off.
export async function resolveBranchId(req: Request): Promise<number | null> {
  const raw = req.query.branchId;
  if (raw === undefined) {
    return req.user!.role === Role.SUPERADMIN ? null : req.user!.branchId;
  }
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) {
    throw new DomainError(400, "Некорректный branchId");
  }
  const requested = Number(raw);

  if (req.user!.role === Role.SUPERADMIN) {
    return requested;
  }

  const homeBranchId = req.user!.branchId;
  if (requested === homeBranchId) {
    return homeBranchId;
  }

  const granted = await prisma.userBranchAccess.findUnique({
    where: { userId_branchId: { userId: req.user!.id, branchId: requested } },
  });
  if (granted) return requested;

  throw new DomainError(403, "Нет доступа к филиалу");
}
