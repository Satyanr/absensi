import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Administrator";

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true, role: UserRole.ADMIN },
    create: { email, username: "admin", passwordHash, active: true, role: UserRole.ADMIN },
  });

  await prisma.attendancePolicy.upsert({
    where: { id: "default-policy" },
    update: {},
    create: {
      id: "default-policy",
      name: "Default Office Policy",
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      workStart: "08:00",
      lateAfter: "08:15",
      workEnd: "17:00",
      overtimeAfter: "19:00",
      timezone: "Asia/Jakarta",
      weekendIsOvertime: true,
    },
  });

  console.log(`Seeded admin ${name} <${email}> and default attendance policy.`);
}

main().finally(() => prisma.$disconnect());
