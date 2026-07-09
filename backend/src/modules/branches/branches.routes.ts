import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createBranchHandler,
  listBranchesHandler,
  listMyBranchesHandler,
  updateBranchHandler,
} from "./branches.controller";

export const branchesRouter = Router();

branchesRouter.use(requireAuth);

// Any authenticated role needs this to populate the branch switcher.
branchesRouter.get("/mine", asyncHandler(listMyBranchesHandler));

// Only SUPERADMIN manages branches; everyone else is fixed to their own.
branchesRouter.get("/", requireRole(Role.SUPERADMIN), asyncHandler(listBranchesHandler));
branchesRouter.post("/", requireRole(Role.SUPERADMIN), asyncHandler(createBranchHandler));
branchesRouter.patch("/:id", requireRole(Role.SUPERADMIN), asyncHandler(updateBranchHandler));
