import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  addRuleHandler,
  deleteRuleHandler,
  getPetConfigHandler,
  updateProfileHandler,
  updateRuleHandler,
} from "./pet.controller";

export const petRouter = Router();

petRouter.use(requireAuth);

// Every role reads the config — the pet overlay is shown to operators too.
petRouter.get("/config", asyncHandler(getPetConfigHandler));

// Configuring the pet (profile + learnable rules) is admin-only.
petRouter.patch("/profile", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(updateProfileHandler));
petRouter.post("/rules", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(addRuleHandler));
petRouter.patch("/rules/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(updateRuleHandler));
petRouter.delete("/rules/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(deleteRuleHandler));
