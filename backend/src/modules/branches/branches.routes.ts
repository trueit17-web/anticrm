import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { createBranchHandler, listBranchesHandler } from "./branches.controller";

export const branchesRouter = Router();

branchesRouter.use(requireAuth);

// Only SUPERADMIN manages branches; everyone else is fixed to their own.
branchesRouter.get("/", requireRole(Role.SUPERADMIN), asyncHandler(listBranchesHandler));
branchesRouter.post("/", requireRole(Role.SUPERADMIN), asyncHandler(createBranchHandler));
