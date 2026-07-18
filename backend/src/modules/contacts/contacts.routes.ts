import { Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { contactsUpload } from "../../middleware/contactsUpload";
import {
  claimContactHandler,
  claimNextHandler,
  convertToAppealHandler,
  deleteBatchHandler,
  listBatchesHandler,
  listMineHandler,
  listQueueHandler,
  setOutcomeHandler,
  uploadBatchHandler,
} from "./contacts.controller";

export const contactsRouter = Router();

contactsRouter.use(requireAuth);

// Uploading and managing client-base batches — admin only.
contactsRouter.post(
  "/upload",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  contactsUpload.single("file"),
  asyncHandler(uploadBatchHandler)
);
contactsRouter.get("/batches", requireRole(Role.ADMIN, Role.SUPERADMIN), asyncHandler(listBatchesHandler));
contactsRouter.delete(
  "/batches/:id",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(deleteBatchHandler)
);

// Working the call queue — managers do the actual calling.
contactsRouter.get(
  "/queue",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(listQueueHandler)
);
contactsRouter.get(
  "/mine",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(listMineHandler)
);
contactsRouter.post(
  "/claim-next",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(claimNextHandler)
);
contactsRouter.post(
  "/:id/claim",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(claimContactHandler)
);
contactsRouter.patch(
  "/:id/outcome",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(setOutcomeHandler)
);
contactsRouter.post(
  "/:id/convert",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(convertToAppealHandler)
);
