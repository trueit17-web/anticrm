import "dotenv/config";
import { OptionField, PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const DEFAULT_OPTIONS: Record<OptionField, string[]> = {
  [OptionField.STATUS]: ["Новое", "В работе", "Консультация дана", "Закрыто"],
  [OptionField.INTAKE]: ["Телефон", "Email", "Мессенджер", "Личный визит", "Сайт"],
  [OptionField.GOV]: ["Не обращался", "Обратился", "Получен ответ"],
  [OptionField.CB]: ["Не обращался", "Обратился", "Получен ответ"],
  [OptionField.FSB]: ["Не обращался", "Обратился", "Получен ответ"],
};

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

async function seedOptions() {
  for (const field of Object.values(OptionField)) {
    const values = DEFAULT_OPTIONS[field];
    for (let i = 0; i < values.length; i++) {
      await prisma.selectOption.upsert({
        where: { field_value: { field, value: values[i] } },
        update: {},
        create: { field, value: values[i], order: i },
      });
    }
  }
  console.log("Default option lists ensured (Госы/ЦБ/ФСБ/Статус/Прием).");
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
