import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { listAdminChangeLogHandler } from "./adminLog.controller";

export const adminLogRouter = Router();

adminLogRouter.use(requireAuth, requireRole(Role.ADMIN, Role.SUPERADMIN));

adminLogRouter.get("/", asyncHandler(listAdminChangeLogHandler));
