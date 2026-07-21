import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export const appealInclude = {
  operator: { select: { id: true, fullName: true } },
  smsSentBy: { select: { id: true, fullName: true } },
  // Present only when this appeal was created by converting a Прозвон
  // contact — carries the full original extraInfo so the edit drawer can
  // show it in full, not just the trimmed ФИО/ДР that went into clientData.
  contact: { select: { id: true, extraInfo: true } },
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
    where: { branchId, date: { gte: start, lt: end }, deletedAt: null },
    include: appealInclude,
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });
}

export function listDeletedAppealsByDate(branchId: number, date: Date) {
  const { start, end } = dayRange(date);
  return prisma.appeal.findMany({
    where: { branchId, date: { gte: start, lt: end }, deletedAt: { not: null } },
    include: appealInclude,
    orderBy: [{ deletedAt: "desc" }],
  });
}

export function getAppeal(id: number, branchId: number) {
  return prisma.appeal.findFirst({ where: { id, branchId, deletedAt: null }, include: appealInclude });
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
  tf?: string | null;
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
  tf: "ТФ",
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
  const before = await prisma.appeal.findFirst({ where: { id, branchId, deletedAt: null } });
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
  const result = await prisma.appeal.updateMany({
    where: { id, branchId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return result.count > 0;
}

export async function restoreAppeal(id: number, branchId: number) {
  const result = await prisma.appeal.updateMany({
    where: { id, branchId, deletedAt: { not: null } },
    data: { deletedAt: null },
  });
  return result.count > 0;
}

export async function setSmsSent(id: number, branchId: number, sent: boolean, userId: number) {
  const before = await prisma.appeal.findFirst({ where: { id, branchId, deletedAt: null } });
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
  avatarUrl: string | null;
  count: number;
}

export interface StatBucket {
  value: string;
  count: number;
}

export interface DailyStat {
  day: string;
  count: number;
}

export interface TfTimeBucket {
  value: string;
  I: number;
  II: number;
  III: number;
  IV: number;
}

export interface RangeStats {
  total: number;
  byOperator: OperatorStat[];
  byGov: StatBucket[];
  byStatus: StatBucket[];
  byDate: DailyStat[];
  byTf: TfTimeBucket[];
}

// Shift window boundaries (Moscow local time, minutes since midnight) used to
// bucket ТФ by time of creation. createdAt is stored as a bare UTC clock
// value (see the date-bucketing note below) — Moscow has no DST, so a fixed
// +180min offset recovers the wall-clock time operators actually see.
const MOSCOW_OFFSET_MINUTES = 180;
const TF_TIME_WINDOWS: { key: "I" | "II" | "III" | "IV"; start: number; end: number }[] = [
  { key: "I", start: 8 * 60, end: 10 * 60 + 14 },
  { key: "II", start: 10 * 60 + 15, end: 12 * 60 + 59 },
  { key: "III", start: 13 * 60, end: 15 * 60 + 14 },
  { key: "IV", start: 15 * 60 + 15, end: 20 * 60 },
];

function tfTimeWindow(createdAt: Date): "I" | "II" | "III" | "IV" | null {
  const minutes = (createdAt.getUTCHours() * 60 + createdAt.getUTCMinutes() + MOSCOW_OFFSET_MINUTES) % (24 * 60);
  return TF_TIME_WINDOWS.find((w) => minutes >= w.start && minutes <= w.end)?.key ?? null;
}

// `to` is exclusive — callers pass the start of the day *after* the last day
// they want included, same convention as dayRange() above.
export async function getStatsForRange(branchId: number, from: Date, to: Date): Promise<RangeStats> {
  const where = { branchId, date: { gte: from, lt: to }, deletedAt: null };

  // Bucketed in JS off a typed Prisma query rather than raw SQL date_trunc:
  // "date" is a timestamp-without-timezone column, and $queryRaw binds Date
  // parameters through an implicit timestamptz cast that gets shifted by the
  // server process's local timezone — silently matching/labelling the wrong
  // calendar day. Prisma's typed query path doesn't have that problem.
  const [operatorGroups, govGroups, statusGroups, dateRows, total] = await Promise.all([
    prisma.appeal.groupBy({ by: ["operatorId"], where, _count: { _all: true } }),
    prisma.appeal.groupBy({ by: ["gov"], where, _count: { _all: true } }),
    prisma.appeal.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.appeal.findMany({ where, select: { date: true, tf: true, createdAt: true } }),
    prisma.appeal.count({ where }),
  ]);

  // По трубкам lists every active user of the branch — including ones with
  // zero appeals this period — plus anyone else who logged an appeal here
  // (e.g. a SUPERADMIN or a manager with extra access, whose home branch
  // differs) so an existing contributor never drops off the list.
  const countByOperator = new Map(operatorGroups.map((g) => [g.operatorId, g._count._all]));
  const branchUsers = await prisma.user.findMany({
    where: { branchId, active: true },
    select: { id: true, fullName: true, avatarUrl: true },
  });
  const outsideOperatorIds = operatorGroups
    .map((g) => g.operatorId)
    .filter((id) => !branchUsers.some((u) => u.id === id));
  const outsideUsers = outsideOperatorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: outsideOperatorIds } },
        select: { id: true, fullName: true, avatarUrl: true },
      })
    : [];

  const byOperator = [...branchUsers, ...outsideUsers]
    .map((u) => ({
      operatorId: u.id,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      count: countByOperator.get(u.id) ?? 0,
    }))
    .sort((a, b) => b.count - a.count);

  const byGov = govGroups
    .map((g) => ({ value: g.gov ?? "—", count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const byStatus = statusGroups
    .map((g) => ({ value: g.status, count: g._count._all }))
    .sort((a, b) => b.count - a.count);

  const dayCounts = new Map<string, number>();
  for (const row of dateRows) {
    const day = row.date.toISOString().slice(0, 10);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }
  const byDate = [...dayCounts.entries()]
    .map(([day, count]) => ({ day, count }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const tfCounts = new Map<string, { I: number; II: number; III: number; IV: number }>();
  for (const row of dateRows) {
    const window = tfTimeWindow(row.createdAt);
    if (!window) continue;
    const key = row.tf ?? "—";
    const counts = tfCounts.get(key) ?? { I: 0, II: 0, III: 0, IV: 0 };
    counts[window] += 1;
    tfCounts.set(key, counts);
  }
  const byTf = [...tfCounts.entries()]
    .map(([value, counts]) => ({ value, ...counts }))
    .sort((a, b) => b.I + b.II + b.III + b.IV - (a.I + a.II + a.III + a.IV));

  return { total, byOperator, byGov, byStatus, byDate, byTf };
}

export interface SummaryStats {
  today: number;
  week: number;
  total: number;
}

// Monday of the week containing date — weeks here always run Пн–Сб.
function mondayOfWeek(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diffToMonday);
  return d;
}

// Always-visible KPIs shown alongside the period filter, independent of
// whatever period the chart/breakdowns below are currently scoped to.
export async function getSummaryStats(branchId: number): Promise<SummaryStats> {
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(todayStart);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  const weekStart = mondayOfWeek(todayStart);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  const [today, week, total] = await Promise.all([
    prisma.appeal.count({ where: { branchId, deletedAt: null, date: { gte: todayStart, lt: tomorrow } } }),
    prisma.appeal.count({ where: { branchId, deletedAt: null, date: { gte: weekStart, lt: weekEnd } } }),
    prisma.appeal.count({ where: { branchId, deletedAt: null } }),
  ]);

  return { today, week, total };
}
