import "dotenv/config";
import { OptionField, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STATUS_DEFAULTS = ["Новое", "В работе", "Консультация дана", "Закрыто"];

// Госы/ЦБ/ФСБ/Закрыв all start out populated with the current staff list
// (mirroring how "Закрыв" used to work as an employee assignment) — admins
// can freely rename/add/remove entries afterwards on the /admin page.
const STAFF_BACKED_FIELDS = [OptionField.GOV, OptionField.CB, OptionField.FSB, OptionField.CLOSER];

async function seedAdmin() {
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
    data: { username, passwordHash, fullName, role: Role.ADMIN },
  });

  console.log(`Created admin user "${username}". Change the password after first login.`);
}

async function upsertOptions(field: OptionField, values: string[]) {
  for (let i = 0; i < values.length; i++) {
    await prisma.selectOption.upsert({
      where: { field_value: { field, value: values[i] } },
      update: {},
      create: { field, value: values[i], order: i },
    });
  }
}

async function seedOptions() {
  await upsertOptions(OptionField.STATUS, STATUS_DEFAULTS);

  const staff = await prisma.user.findMany({ select: { fullName: true }, orderBy: { fullName: "asc" } });
  const staffNames = staff.map((s) => s.fullName);
  for (const field of STAFF_BACKED_FIELDS) {
    await upsertOptions(field, staffNames);
  }

  console.log("Default option lists ensured (Госы/ЦБ/ФСБ/Закрыв/Статус).");
}

async function main() {
  await seedAdmin();
  await seedOptions();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
