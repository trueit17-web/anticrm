import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createRecipientHandler,
  deleteRecipientHandler,
  addSourceHandler,
  deleteSourceHandler,
  getWalletConfigHandler,
  getWalletStatsHandler,
  setWalletConfigHandler,
  updateRecipientHandler,
} from "./wallet.controller";

export const walletRouter = Router();

walletRouter.use(requireAuth);

// The whole "Считать кош" module is admin-only (financial data + config).
walletRouter.use(requireRole(Role.ADMIN, Role.SUPERADMIN));

walletRouter.get("/config", asyncHandler(getWalletConfigHandler));
walletRouter.patch("/config", asyncHandler(setWalletConfigHandler));

walletRouter.post("/sources", asyncHandler(addSourceHandler));
walletRouter.delete("/sources/:id", asyncHandler(deleteSourceHandler));

walletRouter.get("/stats", asyncHandler(getWalletStatsHandler));

walletRouter.post("/recipients", asyncHandler(createRecipientHandler));
walletRouter.patch("/recipients/:id", asyncHandler(updateRecipientHandler));
walletRouter.delete("/recipients/:id", asyncHandler(deleteRecipientHandler));
