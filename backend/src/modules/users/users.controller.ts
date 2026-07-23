import { Request, Response } from "express";
import { Prisma, Role } from "@prisma/client";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import { resolveBranchId } from "../../utils/branchScope";
import { AVATARS_DIR } from "../../config/uploads";
import { getUserBranchAccess, setUserBranchAccess } from "../branches/branches.service";
import { fetchTelegramAvatar } from "../../utils/telegramAvatar";
import { reencodeToWebp } from "../../utils/reencodeImage";
import {
  applyFetchedAvatar,
  createUser,
  getUserAvatarUrl,
  getUserCard,
  getUserLoginEvents,
  getUserTelegram,
  listUsers,
  setUserAvatar,
  updateUser,
} from "./users.service";

export async function listUsersHandler(req: Request, res: Response) {
  const branchId = await resolveBranchId(req);
  const users = await listUsers(branchId);
  res.json({ users });
}

const createUserSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(6),
  fullName: z.string().min(1),
  role: z.nativeEnum(Role).default(Role.USER),
});

export async function createUserHandler(req: Request, res: Response) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  // Only a SUPERADMIN may mint another SUPERADMIN account.
  if (parsed.data.role === Role.SUPERADMIN && req.user!.role !== Role.SUPERADMIN) {
    return res.status(403).json({ error: "Недостаточно прав" });
  }

  // SUPERADMIN accounts aren't tied to a branch; every other role is
  // registered into whichever branch the request is scoped to.
  const branchId = parsed.data.role === Role.SUPERADMIN ? null : await resolveBranchId(req);
  if (branchId === null && parsed.data.role !== Role.SUPERADMIN) {
    return res.status(400).json({ error: "Выберите филиал" });
  }

  try {
    const user = await createUser({ ...parsed.data, branchId });
    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "Такой логин уже занят" });
    }
    throw err;
  }
}

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.nativeEnum(Role).optional(),
  active: z.boolean().optional(),
  password: z.string().min(6).optional(),
  telegram: z.string().nullable().optional(),
  bio: z.string().nullable().optional(),
});

export async function updateUserHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }

  if (parsed.data.role === Role.SUPERADMIN && req.user!.role !== Role.SUPERADMIN) {
    return res.status(403).json({ error: "Недостаточно прав" });
  }

  const branchId = await resolveBranchId(req);

  // Captured before the update so we only auto-fetch a Telegram avatar when
  // the handle is actually being added/changed, not on every unrelated save.
  const previousTelegram = parsed.data.telegram !== undefined ? await getUserTelegram(id, branchId) : undefined;

  const user = await updateUser(id, branchId, parsed.data);
  if (!user) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }

  const newTelegram = parsed.data.telegram?.trim();
  if (newTelegram && newTelegram !== previousTelegram) {
    // Best-effort: Telegram has no API for this, we scrape the public t.me
    // preview page's og:image. Silently does nothing if that fails (private
    // account, no photo, network hiccup) — the manual upload still works.
    const avatar = await fetchTelegramAvatar(newTelegram);
    if (avatar) {
      const avatarUrl = await applyFetchedAvatar(id, branchId, avatar);
      if (avatarUrl) user.avatarUrl = avatarUrl;
    }
  }

  res.json({ user });
}

export async function getUserBranchAccessHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const access = await getUserBranchAccess(id);
  res.json({ branches: access.map((a) => a.branch) });
}

const branchAccessSchema = z.object({ branchIds: z.array(z.number().int()) });

export async function setUserBranchAccessHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const parsed = branchAccessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Проверьте поля формы", details: parsed.error.flatten() });
  }
  const access = await setUserBranchAccess(id, parsed.data.branchIds);
  res.json({ branches: access.map((a) => a.branch) });
}

export async function getUserLoginEventsHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const branchId = await resolveBranchId(req);
  const events = await getUserLoginEvents(id, branchId);
  if (events === null) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }
  res.json({ events });
}

// Popup card shown when clicking a name in a table — any authenticated
// employee may look up a colleague's card (name/avatar/telegram/bio + a
// quick trubki count), same branch-visibility rule as the rest of /users.
export async function getUserCardHandler(req: Request, res: Response) {
  const id = Number(req.params.id);
  const branchId = await resolveBranchId(req);
  const card = await getUserCard(id, branchId);
  if (!card) {
    return res.status(404).json({ error: "Пользователь не найден" });
  }
  res.json({ card });
}

export async function uploadAvatarHandler(req: Request, res: Response) {
  // :id is validated as a plain integer by requireIntegerId before this
  // handler runs, so it's safe to use — but it never touches a filename or
  // path anymore anyway (see the randomUUID() below).
  const id = Number(req.params.id);
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "Файл не получен" });
  }

  // Decoding + re-encoding is the actual proof this is an image, not the
  // client-declared MIME type multer already checked (which is spoofable).
  const webp = await reencodeToWebp(file.buffer);
  if (!webp) {
    return res.status(400).json({ error: "Файл повреждён или не является изображением" });
  }

  const branchId = await resolveBranchId(req);
  const previousAvatarUrl = await getUserAvatarUrl(id);

  const filename = `${randomUUID()}.webp`;
  const filePath = path.join(AVATARS_DIR, filename);
  await fs.promises.writeFile(filePath, webp);

  const avatarUrl = `/uploads/avatars/${filename}`;
  const updated = await setUserAvatar(id, branchId, avatarUrl);
  if (!updated) {
    // Roll back the file we just wrote — the user wasn't found/accessible.
    fs.unlink(filePath, () => {});
    return res.status(404).json({ error: "Пользователь не найден" });
  }

  // Best-effort cleanup of the old file so avatars don't pile up on disk.
  if (previousAvatarUrl && previousAvatarUrl.startsWith("/uploads/avatars/")) {
    const oldPath = path.join(AVATARS_DIR, path.basename(previousAvatarUrl));
    fs.unlink(oldPath, () => {});
  }

  res.json({ avatarUrl });
}
