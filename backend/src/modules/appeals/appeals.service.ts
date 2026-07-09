import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export const appealInclude = {
  operator: { select: { id: true, fullName: true } },
  smsSentBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AppealInclude;

function dayRange(date: Date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export function listAppealsByDate(branchId: number, date: Date) {
  const { start, end } = dayRange(date);
  return prisma.appeal.findMany({
    where: { branchId, date: { gte: start, lt: end } },
    include: appealInclude,
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

export function getAppeal(id: number, branchId: number) {
  return prisma.appeal.findFirst({ where: { id, branchId }, include: appealInclude });
}

export interface CreateAppealInput {
  branchId: number;
  operatorId: number;
  date?: Date;
  phone: string;
  intake?: boolean;
  clientData?: string;
  dep?: string;
  reportedTime?: string;
  description?: string;
  status?: string;
}

export function createAppeal(input: CreateAppealInput) {
  return prisma.appeal.create({
    data: input,
    include: appealInclude,
  });
}

export interface UpdateAppealInput {
  date?: Date;
  phone?: string;
  intake?: boolean;
  clientData?: string;
  dep?: string;
  reportedTime?: string;
  description?: string;
  status?: string;
  gov?: string | null;
  cb?: string | null;
  fsb?: string | null;
  closer?: string | null;
}

const FIELD_LABELS: Record<keyof UpdateAppealInput, string> = {
  date: "Дата",
  phone: "Телефон",
  intake: "Прием",
  clientData: "Данные клиента",
  dep: "Деп.",
  reportedTime: "Время события",
  description: "Описание",
  status: "Статус",
  gov: "Госы",
  cb: "ЦБ",
  fsb: "ФСБ",
  closer: "Закрыв",
};

function resolveDisplayValue(field: keyof UpdateAppealInput, value: unknown): string | null {
  if (field === "intake") return value ? "Отмечено" : "Не отмечено";
  if (value === null || value === undefined || value === "") return null;
  if (field === "date") return (value as Date).toISOString().slice(0, 10);
  return String(value);
}

export async function updateAppealWithHistory(
  id: number,
  branchId: number,
  changes: UpdateAppealInput,
  changedById: number
) {
  const before = await prisma.appeal.findFirst({ where: { id, branchId } });
  if (!before) return null;

  const updated = await prisma.appeal.update({
    where: { id },
    data: changes,
    include: appealInclude,
  });

  const historyRows: Prisma.AppealHistoryCreateManyInput[] = [];
  for (const key of Object.keys(changes) as (keyof UpdateAppealInput)[]) {
    const oldRaw = (before as Record<string, unknown>)[key];
    const newRaw = changes[key];
    const oldComparable = oldRaw instanceof Date ? oldRaw.toISOString() : oldRaw;
    const newComparable = newRaw instanceof Date ? newRaw.toISOString() : newRaw;
    if (oldComparable === newComparable) continue;

    const oldValue = resolveDisplayValue(key, oldRaw);
    const newValue = resolveDisplayValue(key, newRaw);

    historyRows.push({
      appealId: id,
      changedById,
      field: key,
      fieldLabel: FIELD_LABELS[key],
      oldValue,
      newValue,
    });
  }

  if (historyRows.length > 0) {
    await prisma.appealHistory.createMany({ data: historyRows });
  }

  return updated;
}

export async function deleteAppeal(id: number, branchId: number) {
  const result = await prisma.appeal.deleteMany({ where: { id, branchId } });
  return result.count > 0;
}

export async function setSmsSent(id: number, branchId: number, sent: boolean, userId: number) {
  const before = await prisma.appeal.findFirst({ where: { id, branchId } });
  if (!before) return null;

  const updated = await prisma.appeal.update({
    where: { id },
    data: sent
      ? { smsSentById: userId, smsSentAt: new Date() }
      : { smsSentById: null, smsSentAt: null },
    include: appealInclude,
  });

  await prisma.appealHistory.create({
    data: {
      appealId: id,
      changedById: userId,
      field: "sms",
      fieldLabel: "СМС",
      oldValue: before.smsSentById ? "Отправлено" : "Не отправлено",
      newValue: sent ? "Отправлено" : "Не отправлено",
    },
  });

  return updated;
}

export async function getAppealHistory(appealId: number, branchId: number) {
  const appeal = await prisma.appeal.findFirst({ where: { id: appealId, branchId }, select: { id: true } });
  if (!appeal) return null;
  return prisma.appealHistory.findMany({
    where: { appealId },
    include: { changedBy: { select: { id: true, fullName: true } } },
    orderBy: { changedAt: "desc" },
  });
}

export interface OperatorStat {
  operatorId: number;
  fullName: string;
  count: number;
}

export interface DailyStat {
  day: string;
  count: number;
}

export async function getOperatorStats(branchId: number): Promise<OperatorStat[]> {
  const grouped = await prisma.appeal.groupBy({
    by: ["operatorId"],
    where: { branchId },
    _count: { _all: true },
  });

  const operatorIds = grouped.map((g) => g.operatorId);
  const users = await prisma.user.findMany({
    where: { id: { in: operatorIds } },
    select: { id: true, fullName: true },
  });
  const nameById = new Map(users.map((u) => [u.id, u.fullName]));

  return grouped
    .map((g) => ({
      operatorId: g.operatorId,
      fullName: nameById.get(g.operatorId) ?? "—",
      count: g._count._all,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function getDailyStats(branchId: number, days: number): Promise<DailyStat[]> {
  const rows = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
    SELECT to_char(date_trunc('day', "date"), 'YYYY-MM-DD') AS day, count(*)::bigint AS count
    FROM "Appeal"
    WHERE "branchId" = ${branchId} AND "date" >= NOW() - (${days}::text || ' days')::interval
    GROUP BY day
    ORDER BY day
  `;
  return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}
