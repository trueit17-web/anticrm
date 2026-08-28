import { Prisma, Role } from "@prisma/client";
import { prisma } from "../../lib/prisma";

export type AdminLogEntityType = "user" | "branch";

function resolveDisplayValue(value: unknown): string | null {
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

// Diffs `before` against `changes` field-by-field and appends one
// AdminChangeLog row per actually-changed field — same "diff at write time"
// approach as AppealHistory/InnEntryHistory. Fields listed in `secretFields`
// (API keys, passwords) never have their actual values stored: only that a
// change happened.
export async function recordAdminChange(
  tx: Prisma.TransactionClient,
  entityType: AdminLogEntityType,
  entityId: number,
  entityLabel: string,
  before: Record<string, unknown>,
  changes: Record<string, unknown>,
  changedById: number,
  fieldLabels: Record<string, string>,
  secretFields: Set<string> = new Set()
): Promise<void> {
  const rows: Prisma.AdminChangeLogCreateManyInput[] = [];
  for (const field of Object.keys(changes)) {
    const oldRaw = before[field];
    const newRaw = changes[field];
    if (oldRaw === newRaw) continue;

    const isSecret = secretFields.has(field);
    const oldValue = isSecret ? (oldRaw ? "задан" : null) : resolveDisplayValue(oldRaw);
    const newValue = isSecret ? (newRaw ? "задан" : null) : resolveDisplayValue(newRaw);
    if (oldValue === newValue) continue;

    rows.push({
      entityType,
      entityId,
      entityLabel,
      changedById,
      field,
      fieldLabel: fieldLabels[field] ?? field,
      oldValue,
      newValue,
    });
  }
  if (rows.length > 0) {
    await tx.adminChangeLog.createMany({ data: rows });
  }
}

// Powers "Журнал изменений" в Админке. SUPERADMIN sees every entry;
// everyone else (ADMIN) is confined to entries about branches they can
// access and users currently in one of those branches — same visibility
// boundary as the rest of the admin surface.
export async function listAdminChangeLog(
  actor: { id: number; role: Role; branchId: number | null },
  filters: { entityType?: AdminLogEntityType },
  limit = 200
) {
  const where: Prisma.AdminChangeLogWhereInput = {};
  if (filters.entityType) where.entityType = filters.entityType;

  if (actor.role !== Role.SUPERADMIN) {
    const grants = await prisma.userBranchAccess.findMany({ where: { userId: actor.id }, select: { branchId: true } });
    const accessibleBranchIds = new Set(grants.map((g) => g.branchId));
    if (actor.branchId) accessibleBranchIds.add(actor.branchId);
    const branchIds = Array.from(accessibleBranchIds);

    const usersInScope = await prisma.user.findMany({
      where: { branchId: { in: branchIds } },
      select: { id: true },
    });
    const userIds = usersInScope.map((u) => u.id);

    where.OR = [
      { entityType: "branch", entityId: { in: branchIds } },
      { entityType: "user", entityId: { in: userIds } },
    ];
  }

  return prisma.adminChangeLog.findMany({
    where,
    include: { changedBy: { select: { id: true, fullName: true } } },
    orderBy: { changedAt: "desc" },
    take: limit,
  });
}
