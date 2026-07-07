import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  createAppealHandler,
  deleteAppealHandler,
  listAppealsHandler,
  updateAppealHandler,
} from "./appeals.controller";
import { asyncHandler } from "../../utils/asyncHandler";

export const appealsRouter = Router();

appealsRouter.use(requireAuth);

// All roles (user/manager/admin) see every appeal.
appealsRouter.get("/", asyncHandler(listAppealsHandler));
appealsRouter.post("/", asyncHandler(createAppealHandler));

// Row/field-level permission (owner-only for user role) is enforced inside the handler.
appealsRouter.patch("/:id", asyncHandler(updateAppealHandler));

appealsRouter.delete("/:id", requireRole(Role.MANAGER, Role.ADMIN), asyncHandler(deleteAppealHandler));
