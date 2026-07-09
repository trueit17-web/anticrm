import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createOptionHandler,
  deleteOptionHandler,
  listOptionsHandler,
  updateOptionHandler,
} from "./select-options.controller";

export const selectOptionsRouter = Router();

selectOptionsRouter.use(requireAuth);

// Every role needs the current lists to populate dropdowns.
selectOptionsRouter.get("/", asyncHandler(listOptionsHandler));

// Only admins curate the lists themselves.
selectOptionsRouter.post("/", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(createOptionHandler));
selectOptionsRouter.patch("/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(updateOptionHandler));
selectOptionsRouter.delete("/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(deleteOptionHandler));
