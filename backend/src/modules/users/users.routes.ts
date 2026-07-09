import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  createUserHandler,
  getUserBranchAccessHandler,
  listUsersHandler,
  setUserBranchAccessHandler,
  updateUserHandler,
} from "./users.controller";
import { asyncHandler } from "../../utils/asyncHandler";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Manager/Admin need the user list to populate assignment dropdowns (Госы/ЦБ/ФСБ/Закрыв).
usersRouter.get("/", requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN), asyncHandler(listUsersHandler));

// Only Admin manages accounts.
usersRouter.post("/", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(createUserHandler));
usersRouter.patch("/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(updateUserHandler));

// Only SUPERADMIN grants a user access to branches beyond their home one.
usersRouter.get("/:id/branch-access", requireRole(Role.SUPERADMIN), asyncHandler(getUserBranchAccessHandler));
usersRouter.put("/:id/branch-access", requireRole(Role.SUPERADMIN), asyncHandler(setUserBranchAccessHandler));
