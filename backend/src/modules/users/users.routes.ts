import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { createUserHandler, listUsersHandler, updateUserHandler } from "./users.controller";
import { asyncHandler } from "../../utils/asyncHandler";

export const usersRouter = Router();

usersRouter.use(requireAuth);

// Manager/Admin need the user list to populate assignment dropdowns (Госы/ЦБ/ФСБ/Закрыв).
usersRouter.get("/", requireRole(Role.MANAGER, Role.ADMIN), asyncHandler(listUsersHandler));

// Only Admin manages accounts.
usersRouter.post("/", requireRole(Role.ADMIN), asyncHandler(createUserHandler));
usersRouter.patch("/:id", requireRole(Role.ADMIN), asyncHandler(updateUserHandler));
