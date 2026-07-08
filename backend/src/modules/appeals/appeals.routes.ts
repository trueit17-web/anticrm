import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  createAppealHandler,
  deleteAppealHandler,
  getStatsHandler,
  listAppealsHandler,
  setSmsHandler,
  updateAppealHandler,
} from "./appeals.controller";
import { asyncHandler } from "../../utils/asyncHandler";

export const appealsRouter = Router();

appealsRouter.use(requireAuth);

// All roles (user/manager/admin) see every appeal.
appealsRouter.get("/", asyncHandler(listAppealsHandler));

// Must come before "/:id" or Express would treat "stats" as an :id value.
appealsRouter.get("/stats", asyncHandler(getStatsHandler));

appealsRouter.post("/", asyncHandler(createAppealHandler));

// Row/field-level permission (owner-only for user role) is enforced inside the handler.
appealsRouter.patch("/:id", asyncHandler(updateAppealHandler));

// Any authenticated employee may toggle the SMS flag on any appeal.
appealsRouter.patch("/:id/sms", asyncHandler(setSmsHandler));

appealsRouter.delete("/:id", requireRole(Role.MANAGER, Role.ADMIN), asyncHandler(deleteAppealHandler));
