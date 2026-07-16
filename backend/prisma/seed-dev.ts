import "dotenv/config";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

// Dev/test-only seed data — never wired into `prisma db seed` (that stays
// pointed at seed.ts) and never run on the production deploy step. Run by
// hand with `npm run seed:dev`, only against a local/dev database.
const prisma = new PrismaClient();

const TEST_PASSWORD = "Test1234!";

const TEST_USERS: { username: string; fullName: string; role: Role }[] = [
  { username: "manager1", fullName: "Тестовый Менеджер", role: Role.MANAGER },
  { username: "user1", fullName: "Тестовый Оператор 1", role: Role.USER },
  { username: "user2", fullName: "Тестовый Оператор 2", role: Role.USER },
];

interface TestAppeal {
  phone: string;
  daysAgo: number;
  status: string;
  clientData?: string;
  dep?: string;
  description?: string;
  intake?: boolean;
  operatorUsername: string;
}

const TEST_APPEALS: TestAppeal[] = [
  {
    phone: "+7 900 100-00-01",
    daysAgo: 0,
    status: "Новое",
    clientData: "Тестовый клиент 1",
    description: "Тестовая трубка для проверки dev-стенда",
    operatorUsername: "admin",
  },
  {
    phone: "+7 900 100-00-02",
    daysAgo: 0,
    status: "В работе",
    clientData: "Тестовый клиент 2",
    dep: "5000",
    intake: true,
    operatorUsername: "manager1",
  },
  {
    phone: "+7 900 100-00-03",
    daysAgo: 1,
    status: "Консультация дана",
    clientData: "Тестовый клиент 3",
    description: "Описание для проверки переноса текста",
    operatorUsername: "user1",
  },
  {
    phone: "+7 900 100-00-04",
    daysAgo: 1,
    status: "Закрыто",
    clientData: "Тестовый клиент 4",
    operatorUsername: "user2",
  },
  {
    phone: "+7 900 100-00-05",
    daysAgo: 2,
    status: "Новое",
    clientData: "Тестовый клиент 5",
    dep: "12000",
    intake: true,
    operatorUsername: "manager1",
  },
  {
    phone: "+7 900 100-00-06",
    daysAgo: 2,
    status: "В работе",
    operatorUsername: "user1",
  },
];

async function seedUsers(branchId: number) {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  for (const u of TEST_USERS) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: { ...u, passwordHash, branchId },
    });
  }
  console.log(`Ensured ${TEST_USERS.length} test users (password: ${TEST_PASSWORD}).`);
}

async function seedAppeals(branchId: number) {
  const usernames = [...new Set(TEST_APPEALS.map((a) => a.operatorUsername))];
  const operators = await prisma.user.findMany({ where: { username: { in: usernames } } });
  const operatorIdByUsername = new Map(operators.map((o) => [o.username, o.id]));

  let created = 0;
  for (const a of TEST_APPEALS) {
    const existing = await prisma.appeal.findFirst({ where: { phone: a.phone, branchId } });
    if (existing) continue;

    const operatorId = operatorIdByUsername.get(a.operatorUsername);
    if (!operatorId) {
      console.warn(`Skipping ${a.phone}: operator "${a.operatorUsername}" not found.`);
      continue;
    }

    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - a.daysAgo);

    await prisma.appeal.create({
      data: {
        date,
        branchId,
        operatorId,
        phone: a.phone,
        status: a.status,
        clientData: a.clientData,
        dep: a.dep,
        description: a.description,
        intake: a.intake ?? false,
      },
    });
    created++;
  }
  console.log(`Created ${created} new test trubki (${TEST_APPEALS.length - created} already existed).`);
}

async function main() {
  const branch = await prisma.branch.findFirst({ orderBy: { id: "asc" } });
  if (!branch) {
    throw new Error("No branch found — run the regular seed first (npm run seed).");
  }
  await seedUsers(branch.id);
  await seedAppeals(branch.id);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
