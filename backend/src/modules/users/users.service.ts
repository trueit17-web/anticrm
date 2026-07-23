import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { hashPassword } from "../../utils/password";
import { AVATARS_DIR } from "../../config/uploads";
import { FetchedAvatar } from "../../utils/telegramAvatar";
import { reencodeToWebp } from "../../utils/reencodeImage";

const publicUserSelect = {
  id: true,
  username: true,
  fullName: true,
  role: true,
  active: true,
  createdAt: true,
  avatarUrl: true,
  telegram: true,
  bio: true,
  branch: { select: { id: true, name: true } },
  branchAccess: { select: { branch: { select: { id: true, name: true } } } },
} as const;

function toUserSummary<T extends { branchAccess: { branch: { id: number; name: string } }[] }>(user: T) {
  return { ...user, branchAccess: user.branchAccess.map((a) => a.branch) };
}

// branchId === null means "no branch selected" (SUPERADMIN viewing across
// all branches) — list everyone in that case rather than nobody.
export async function listUsers(branchId: number | null) {
  const users = await prisma.user.findMany({
    where: branchId === null ? {} : { branchId },
    select: publicUserSelect,
    orderBy: { fullName: "asc" },
  });
  return users.map(toUserSummary);
}

export async function createUser(input: {
  username: string;
  password: string;
  fullName: string;
  role: Role;
  branchId: number | null;
}) {
  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      username: input.username,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      branchId: input.branchId,
    },
    select: publicUserSelect,
  });
  return toUserSummary(user);
}

export async function updateUser(
  id: number,
  branchId: number | null,
  input: Partial<{
    fullName: string;
    role: Role;
    active: boolean;
    password: string;
    telegram: string | null;
    bio: string | null;
  }>
) {
  const data: Record<string, unknown> = {};
  if (input.fullName !== undefined) data.fullName = input.fullName;
  if (input.role !== undefined) data.role = input.role;
  if (input.active !== undefined) data.active = input.active;
  if (input.password) data.passwordHash = await hashPassword(input.password);
  if (input.telegram !== undefined) data.telegram = input.telegram || null;
  if (input.bio !== undefined) data.bio = input.bio || null;

  // branchId === null (SUPERADMIN, no branch selected) may edit anyone;
  // everyone else is confined to their own branch's accounts.
  const where = branchId === null ? { id } : { id, branchId };
  const result = await prisma.user.updateMany({ where, data });
  if (result.count === 0) return null;
  const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  return user ? toUserSummary(user) : null;
}

// branchId === null means SUPERADMIN with no branch selected — may inspect
// anyone's login history; everyone else is confined to their own branch's accounts.
export async function getUserLoginEvents(id: number, branchId: number | null) {
  const where = branchId === null ? { id } : { id, branchId };
  const user = await prisma.user.findFirst({ where, select: { id: true } });
  if (!user) return null;

  return prisma.loginEvent.findMany({
    where: { userId: id },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, ip: true, userAgent: true, createdAt: true },
  });
}

function dayStart(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Monday of the week containing date — weeks here always run Пн–Сб.
function mondayOfWeek(date: Date): Date {
  const d = dayStart(date);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

// Popup employee card shown when clicking a name in a table — profile
// fields plus a quick trubki count (today / this week, Пн–Сб / all time).
// branchId === null (SUPERADMIN, no branch selected) sees anyone and their
// all-branch totals; everyone else is confined to colleagues visible in the
// branch they're currently viewing — either the colleague's home branch or
// one they've been granted extra access to (e.g. a manager working cases
// across offices) — and the stats are counted for that same branch.
export async function getUserCard(id: number, branchId: number | null) {
  const where =
    branchId === null ? { id } : { id, OR: [{ branchId }, { branchAccess: { some: { branchId } } }] };
  const user = await prisma.user.findFirst({
    where,
    select: { id: true, fullName: true, avatarUrl: true, telegram: true, bio: true, branchId: true },
  });
  if (!user) return null;

  const today = dayStart(new Date());
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const weekStart = mondayOfWeek(today);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const appealWhere = { operatorId: id, branchId: branchId ?? user.branchId ?? undefined, deletedAt: null };

  const [todayCount, weekCount, totalCount] = await Promise.all([
    prisma.appeal.count({ where: { ...appealWhere, date: { gte: today, lt: tomorrow } } }),
    prisma.appeal.count({ where: { ...appealWhere, date: { gte: weekStart, lt: weekEnd } } }),
    prisma.appeal.count({ where: appealWhere }),
  ]);

  return {
    id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    telegram: user.telegram,
    bio: user.bio,
    stats: { today: todayCount, week: weekCount, total: totalCount },
  };
}

export async function setUserAvatar(id: number, branchId: number | null, avatarUrl: string) {
  const where = branchId === null ? { id } : { id, branchId };
  const result = await prisma.user.updateMany({ where, data: { avatarUrl } });
  return result.count > 0;
}

export async function getUserAvatarUrl(id: number): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id }, select: { avatarUrl: true } });
  return user?.avatarUrl ?? null;
}

export async function getUserTelegram(id: number, branchId: number | null): Promise<string | null> {
  const where = branchId === null ? { id } : { id, branchId };
  const user = await prisma.user.findFirst({ where, select: { telegram: true } });
  return user?.telegram ?? null;
}

// Writes a Telegram-fetched avatar to disk and swaps it in, same as a
// manual upload — used when a Telegram handle is added/changed on a user.
export async function applyFetchedAvatar(
  id: number,
  branchId: number | null,
  avatar: FetchedAvatar
): Promise<string | null> {
  // Same treatment as a direct upload: decode/re-encode rather than trust
  // whatever Content-Type the remote server declared for the fetched image.
  const webp = await reencodeToWebp(avatar.buffer);
  if (!webp) return null;

  const previousAvatarUrl = await getUserAvatarUrl(id);

  const filename = `${randomUUID()}.webp`;
  const filePath = path.join(AVATARS_DIR, filename);
  await fs.writeFile(filePath, webp);

  const avatarUrl = `/uploads/avatars/${filename}`;
  const updated = await setUserAvatar(id, branchId, avatarUrl);
  if (!updated) {
    await fs.unlink(filePath).catch(() => {});
    return null;
  }

  if (previousAvatarUrl && previousAvatarUrl.startsWith("/uploads/avatars/")) {
    await fs.unlink(path.join(AVATARS_DIR, path.basename(previousAvatarUrl))).catch(() => {});
  }

  return avatarUrl;
}
