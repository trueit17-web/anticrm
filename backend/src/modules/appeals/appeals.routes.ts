import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  createAppealHandler,
  deleteAppealHandler,
  getHistoryHandler,
  getStatsHandler,
  getSummaryHandler,
  listAppealsHandler,
  listDeletedAppealsHandler,
  restoreAppealHandler,
  setSmsHandler,
  updateAppealHandler,
} from "./appeals.controller";
import { asyncHandler } from "../../utils/asyncHandler";

export const appealsRouter = Router();

appealsRouter.use(requireAuth);

// All roles (user/manager/admin) see every appeal for the requested day
// (defaults to today; ?date=YYYY-MM-DD for the stats page's history view).
appealsRouter.get("/", asyncHandler(listAppealsHandler));

// Must come before "/:id" or Express would treat "stats"/"summary"/"deleted" as an :id value.
appealsRouter.get("/stats", asyncHandler(getStatsHandler));
appealsRouter.get("/summary", asyncHandler(getSummaryHandler));

// Trash view — same role gate as delete, since restoring is the undo for it.
appealsRouter.get(
  "/deleted",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(listDeletedAppealsHandler)
);

appealsRouter.post("/", asyncHandler(createAppealHandler));

// Any authenticated role may edit any appeal; Госы/ЦБ/ФСБ/Закрыв stay
// manager/admin-only inside the handler.
appealsRouter.patch("/:id", asyncHandler(updateAppealHandler));

// Any authenticated employee may toggle the SMS flag on any appeal.
appealsRouter.patch("/:id/sms", asyncHandler(setSmsHandler));

appealsRouter.get("/:id/history", asyncHandler(getHistoryHandler));

appealsRouter.delete(
  "/:id",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(deleteAppealHandler)
);

appealsRouter.post(
  "/:id/restore",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(restoreAppealHandler)
);
