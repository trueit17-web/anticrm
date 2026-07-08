import "dotenv/config";
import { OptionField, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const STATUS_DEFAULTS = ["Новое", "В работе", "Консультация дана", "Закрыто"];

// Госы/ЦБ/ФСБ/Закрыв start out empty on purpose — admins fill them in with
// real values on the /admin page instead of getting placeholder data.

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
  console.log("Default status list ensured. Госы/ЦБ/ФСБ/Закрыв left empty for admins to fill in.");
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
