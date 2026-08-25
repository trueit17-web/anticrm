import { NextFunction, Request, Response, Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { resolveBranchId } from "../../utils/branchScope";
import { isInnEnabled } from "../branches/branches.service";
import {
  adminDeleteInnEntryHandler,
  adminUpdateInnEntryHandler,
  checkInnHandler,
  createInnEntryHandler,
  deleteInnEntryHandler,
  getInnStatsHandler,
  getMyInnStatsHandler,
  getOperatorInnEntriesHandler,
  listBranchInnEntriesHandler,
  listMyInnEntriesHandler,
  listMyInnEntriesInRangeHandler,
  lookupInnHandler,
  refreshInnEntryHandler,
  searchBranchInnEntriesHandler,
  searchInnEntryHandler,
  searchMyInnEntriesHandler,
  updateInnEntryHandler,
} from "./inn.controller";

export const innRouter = Router();

innRouter.use(requireAuth);

// SUPERADMIN can flip the whole module off per branch (Филиалы page) — a
// disabled branch 403s every /inn route, not just a hidden dock icon.
// branchId === null (SUPERADMIN with no branch picked) falls through; the
// individual handlers already require a branch to be selected.
innRouter.use(
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const branchId = await resolveBranchId(req);
    if (branchId !== null && !(await isInnEnabled(branchId))) {
      return res.status(403).json({ error: "Модуль «ИНН» отключён для этого филиала" });
    }
    next();
  })
);

innRouter.get("/mine", asyncHandler(listMyInnEntriesHandler));
innRouter.get("/check", asyncHandler(checkInnHandler));
innRouter.get("/search", asyncHandler(searchInnEntryHandler));
innRouter.post("/", asyncHandler(createInnEntryHandler));
innRouter.patch("/:id", asyncHandler(updateInnEntryHandler));
innRouter.delete("/:id", asyncHandler(deleteInnEntryHandler));
innRouter.post("/lookup", asyncHandler(lookupInnHandler));
innRouter.get("/stats/mine", asyncHandler(getMyInnStatsHandler));
innRouter.get("/stats/mine/entries", asyncHandler(listMyInnEntriesInRangeHandler));
// Поиск по ИНН ignores the period picker — any operator can search their
// own rows across every date.
innRouter.get("/stats/mine/entries/search", asyncHandler(searchMyInnEntriesHandler));
innRouter.get("/stats/summary", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(getInnStatsHandler));
innRouter.get(
  "/stats/operator/:operatorId",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(getOperatorInnEntriesHandler)
);
innRouter.get("/stats/entries", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(listBranchInnEntriesHandler));
innRouter.get(
  "/stats/entries/search",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(searchBranchInnEntriesHandler)
);
innRouter.patch("/admin/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(adminUpdateInnEntryHandler));
innRouter.delete("/admin/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(adminDeleteInnEntryHandler));
// Any operator can refresh their own row from dadata (handler scopes
// non-admins to their own operatorId); ADMIN/SUPERADMIN can refresh any row.
innRouter.post("/:id/refresh", asyncHandler(refreshInnEntryHandler));
