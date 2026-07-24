import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { updateCheckHandler } from "./system.controller";

export const systemRouter = Router();

systemRouter.use(requireAuth);

// Checking for updates is a deploy-adjacent action — SUPERADMIN only.
systemRouter.get("/update-check", requireRole(Role.SUPERADMIN), asyncHandler(updateCheckHandler));
