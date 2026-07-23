import "dotenv/config";
import { OptionField, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const STATUS_DEFAULTS = ["Новое", "В работе", "Консультация дана", "Закрыто"];

// In production this is a deliberate one-time bootstrap step (`npm run
// seed`, run once by hand — see DEPLOY.md), no longer part of the
// container's normal boot. Convenience fallbacks (admin/ChangeMe123!,
// superadmin/superadmin) stay available for local/dev use, but production
// must supply its own username and a strong, non-placeholder password
// explicitly — this throws (and aborts the whole seed run) otherwise.
function requireBootstrapAccount(
  label: string,
  usernameVar: string,
  passwordVar: string
): { username: string | undefined; password: string | undefined } {
  const username = process.env[usernameVar]?.trim();
  const password = process.env[passwordVar];
  if (!IS_PRODUCTION) return { username, password };

  const passwordOk = !!password && !/change[_-]?me/i.test(password) && password.length >= 16;
  if (!username || !passwordOk) {
    throw new Error(
      `${usernameVar}/${passwordVar} must be set to a real username and a strong, non-placeholder password ` +
        `(16+ characters) to bootstrap the ${label} account in production`
    );
  }
  return { username, password };
}

// Госы/ЦБ/ФСБ/Закрыв start out empty on purpose — admins fill them in with
// real values on the /admin page instead of getting placeholder data.

async function ensureDefaultBranch() {
  const existing = await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (existing) return existing;
  return prisma.branch.create({ data: { name: "Главный офис" } });
}

async function seedAdmin(branchId: number) {
  const bootstrap = requireBootstrapAccount("admin", "SEED_ADMIN_USERNAME", "SEED_ADMIN_PASSWORD");
  const username = bootstrap.username ?? "admin";
  const password = bootstrap.password ?? "ChangeMe123!";
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
// superadmin/superadmin for local/dev; production requires explicit
// SEED_SUPERADMIN_* env vars with a strong password (see
// requireBootstrapAccount above).
async function seedSuperadmin() {
  const bootstrap = requireBootstrapAccount("superadmin", "SEED_SUPERADMIN_USERNAME", "SEED_SUPERADMIN_PASSWORD");
  const username = bootstrap.username ?? "superadmin";
  const password = bootstrap.password ?? "superadmin";
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
