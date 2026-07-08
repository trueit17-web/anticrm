import { AppealStatus, IntakeChannel, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";

const assigneeSelect = {
  select: { id: true, fullName: true, role: true },
} as const;

export const appealInclude = {
  operator: { select: { id: true, fullName: true } },
  govAssignee: assigneeSelect,
  cbAssignee: assigneeSelect,
  fsbAssignee: assigneeSelect,
  closerAssignee: assigneeSelect,
  smsSentBy: { select: { id: true, fullName: true } },
} satisfies Prisma.AppealInclude;

export function listAppeals() {
  return prisma.appeal.findMany({
    include: appealInclude,
    orderBy: { date: "desc" },
  });
}

export function getAppeal(id: number) {
  return prisma.appeal.findUnique({ where: { id }, include: appealInclude });
}

export interface CreateAppealInput {
  operatorId: number;
  date?: Date;
  phone: string;
  intake: IntakeChannel;
  clientData?: string;
  description?: string;
  status?: AppealStatus;
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
  intake?: IntakeChannel;
  clientData?: string;
  description?: string;
  status?: AppealStatus;
  govAssigneeId?: number | null;
  cbAssigneeId?: number | null;
  fsbAssigneeId?: number | null;
  closerAssigneeId?: number | null;
}

export function updateAppeal(id: number, input: UpdateAppealInput) {
  return prisma.appeal.update({
    where: { id },
    data: input,
    include: appealInclude,
  });
}

export function deleteAppeal(id: number) {
  return prisma.appeal.delete({ where: { id } });
}

export function setSmsSent(id: number, sent: boolean, userId: number) {
  return prisma.appeal.update({
    where: { id },
    data: sent
      ? { smsSentById: userId, smsSentAt: new Date() }
      : { smsSentById: null, smsSentAt: null },
    include: appealInclude,
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
