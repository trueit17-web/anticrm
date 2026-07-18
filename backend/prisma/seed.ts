import "dotenv/config";
import { OptionField, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STATUS_DEFAULTS = ["Новое", "В работе", "Консультация дана", "Закрыто"];

// Госы/ЦБ/ФСБ/Закрыв start out empty on purpose — admins fill them in with
// real values on the /admin page instead of getting placeholder data.

async function ensureDefaultBranch() {
  const existing = await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (existing) return existing;
  return prisma.branch.create({ data: { name: "Главный офис" } });
}

async function seedAdmin(branchId: number) {
  const username = process.env.SEED_ADMIN_USERNAME ?? "admin";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const fullName = process.env.SEED_ADMIN_FULLNAME ?? "Administrator";

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin user "${username}" already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { username, passwordHash, fullName, role: Role.ADMIN, branchId },
  });

  console.log(`Created admin user "${username}". Change the password after first login.`);
}

// This is the only supported way to bootstrap a SUPERADMIN account
// (branch-scoped admins can't create one) — a one-time deploy step, not a
// user manageable through the normal Users page. Defaults to
// superadmin/superadmin; override via SEED_SUPERADMIN_* env vars.
async function seedSuperadmin() {
  const username = process.env.SEED_SUPERADMIN_USERNAME ?? "superadmin";
  const password = process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin";
  const fullName = process.env.SEED_SUPERADMIN_FULLNAME ?? "Super Admin";

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Superadmin user "${username}" already exists, skipping.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { username, passwordHash, fullName, role: Role.SUPERADMIN, branchId: null },
  });

  console.log(`Created superadmin user "${username}". Change the password after first login.`);
}

async function upsertOptions(branchId: number, field: OptionField, values: string[]) {
  for (let i = 0; i < values.length; i++) {
    await prisma.selectOption.upsert({
      where: { branchId_field_value: { branchId, field, value: values[i] } },
      update: {},
      create: { branchId, field, value: values[i], order: i },
    });
  }
}

async function seedOptions(branchId: number) {
  await upsertOptions(branchId, OptionField.STATUS, STATUS_DEFAULTS);
  console.log("Default status list ensured. Госы/ЦБ/ФСБ/Закрыв left empty for admins to fill in.");
}

async function main() {
  const branch = await ensureDefaultBranch();
  await seedAdmin(branch.id);
  await seedOptions(branch.id);
  await seedSuperadmin();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
