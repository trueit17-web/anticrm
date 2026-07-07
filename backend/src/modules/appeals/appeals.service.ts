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
