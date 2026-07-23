import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import {
  createUserHandler,
  getUserBranchAccessHandler,
  getUserCardHandler,
  getUserLoginEventsHandler,
  listUsersHandler,
  setUserBranchAccessHandler,
  updateUserHandler,
  uploadAvatarHandler,
} from "./users.controller";
import { asyncHandler } from "../../utils/asyncHandler";
import { avatarUpload } from "../../middleware/avatarUpload";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Full account list (username, role, Telegram, bio, branch access...) is
// only rendered on the Админка "Пользователи" tab, which is ADMIN+ only —
// the route matches that; MANAGER has no UI surface that calls it.
usersRouter.get("/", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(listUsersHandler));

// Any authenticated employee may open a colleague's popup card.
usersRouter.get("/:id/card", asyncHandler(getUserCardHandler));

// Only Admin manages accounts.
usersRouter.post("/", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(createUserHandler));
usersRouter.patch("/:id", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(updateUserHandler));
usersRouter.post(
  "/:id/avatar",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  avatarUpload.single("avatar"),
  asyncHandler(uploadAvatarHandler)
);

// Only SUPERADMIN grants a user access to branches beyond their home one.
usersRouter.get("/:id/branch-access", requireRole(Role.SUPERADMIN), asyncHandler(getUserBranchAccessHandler));
usersRouter.put("/:id/branch-access", requireRole(Role.SUPERADMIN), asyncHandler(setUserBranchAccessHandler));

// Admin/superadmin can review who's been logging into an account from where.
usersRouter.get(
  "/:id/login-events",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(getUserLoginEventsHandler)
);
