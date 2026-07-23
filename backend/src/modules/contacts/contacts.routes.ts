import { NextFunction, Request, Response, Router } from "express";
import { Role } from "@prisma/client";
import { requireAuth, requireRole } from "../../middleware/auth";
import { asyncHandler } from "../../utils/asyncHandler";
import { contactsUpload } from "../../middleware/contactsUpload";
import { resolveBranchId } from "../../utils/branchScope";
import { isContactsEnabled } from "../branches/branches.service";
import {
  claimContactHandler,
  claimNextHandler,
  convertToAppealHandler,
  deleteBatchHandler,
  listBatchesHandler,
  listMineHandler,
  listQueueHandler,
  lookupOrgHandler,
  releaseContactHandler,
  setOutcomeHandler,
  uploadBatchHandler,
} from "./contacts.controller";
import {
  countSocialFundOfficesHandler,
  createSocialFundOfficeHandler,
  deleteSocialFundOfficeHandler,
  exportSocialFundOfficesHandler,
  listSocialFundOfficesHandler,
  lookupSocialFundOfficeHandler,
  updateSocialFundOfficeHandler,
} from "./socialFundOffices.controller";

export const contactsRouter = Router();

contactsRouter.use(requireAuth);

// SUPERADMIN can flip the whole module off per branch (Филиалы page) — a
// disabled branch 403s every /contacts route, not just a hidden nav icon.
// branchId === null (SUPERADMIN with no branch picked) falls through; the
// individual handlers already require a branch to be selected.
contactsRouter.use(
  asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
    const branchId = await resolveBranchId(req);
    if (branchId !== null && !(await isContactsEnabled(branchId))) {
      return res.status(403).json({ error: "Модуль «Прозвон» отключён для этого филиала" });
    }
    next();
  })
);

// Uploading a client base — admin manages the shared queue; a manager may
// also upload, but their batch stays visible only to them (see
// contacts.service.ts's listQueue/claimNext scoping).
contactsRouter.post(
  "/upload",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
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
  "/:id/release",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(releaseContactHandler)
);
contactsRouter.post(
  "/:id/convert",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(convertToAppealHandler)
);

// ИНН ЮЛ → название организации (DaData) for the call card's "Доп. инфа".
contactsRouter.post(
  "/lookup-org",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(lookupOrgHandler)
);

// Admin-curated "город → адрес СФР" reference list used by the call card.
contactsRouter.get(
  "/social-fund-offices",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(listSocialFundOfficesHandler)
);
contactsRouter.get(
  "/social-fund-offices/count",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(countSocialFundOfficesHandler)
);
contactsRouter.get(
  "/social-fund-offices/export",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(exportSocialFundOfficesHandler)
);
contactsRouter.post(
  "/social-fund-offices",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(createSocialFundOfficeHandler)
);
contactsRouter.patch(
  "/social-fund-offices/:id",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(updateSocialFundOfficeHandler)
);
contactsRouter.delete(
  "/social-fund-offices/:id",
  requireRole(Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(deleteSocialFundOfficeHandler)
);
contactsRouter.get(
  "/social-fund-offices/lookup",
  requireRole(Role.MANAGER, Role.ADMIN, Role.SUPERADMIN),
  asyncHandler(lookupSocialFundOfficeHandler)
);
