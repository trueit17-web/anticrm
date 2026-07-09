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

export function listAppealsByDate(date: Date) {
  const { start, end } = dayRange(date);
  return prisma.appeal.findMany({
    where: { date: { gte: start, lt: end } },
    include: appealInclude,
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

export function getAppeal(id: number) {
  return prisma.appeal.findUnique({ where: { id }, include: appealInclude });
}

export interface CreateAppealInput {
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
  changes: UpdateAppealInput,
  changedById: number
) {
  const before = await prisma.appeal.findUnique({ where: { id } });
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

export function deleteAppeal(id: number) {
  return prisma.appeal.delete({ where: { id } });
}

export async function setSmsSent(id: number, sent: boolean, userId: number) {
  const before = await prisma.appeal.findUnique({ where: { id } });
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

export function getAppealHistory(appealId: number) {
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

export async function getOperatorStats(): Promise<OperatorStat[]> {
  const grouped = await prisma.appeal.groupBy({
    by: ["operatorId"],
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

export async function getDailyStats(days: number): Promise<DailyStat[]> {
  const rows = await prisma.$queryRaw<{ day: string; count: bigint }[]>`
    SELECT to_char(date_trunc('day', "date"), 'YYYY-MM-DD') AS day, count(*)::bigint AS count
    FROM "Appeal"
    WHERE "date" >= NOW() - (${days}::text || ' days')::interval
    GROUP BY day
    ORDER BY day
  `;
  return rows.map((r) => ({ day: r.day, count: Number(r.count) }));
}
