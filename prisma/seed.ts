import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, UserRole } from "../src/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });
type OfficeSeed = {
  id: string;
  name: string;

  latitudeEnv: string;
  longitudeEnv: string;
};

const OFFICE_RADIUS_METERS = 1000;

const offices: OfficeSeed[] = [
  {
    id: "office-jakarta",

    name: "Kantor Jakarta",

    latitudeEnv: "OFFICE_JAKARTA_LATITUDE",

    longitudeEnv: "OFFICE_JAKARTA_LONGITUDE",
  },

  {
    id: "office-bandung",

    name: "Kantor Bandung",

    latitudeEnv: "OFFICE_BANDUNG_LATITUDE",

    longitudeEnv: "OFFICE_BANDUNG_LONGITUDE",
  },

  {
    id: "office-jogja",

    name: "Kantor Jogja",

    latitudeEnv: "OFFICE_JOGJA_LATITUDE",

    longitudeEnv: "OFFICE_JOGJA_LONGITUDE",
  },

  {
    id: "office-surabaya",

    name: "Kantor Surabaya",

    latitudeEnv: "OFFICE_SURABAYA_LATITUDE",

    longitudeEnv: "OFFICE_SURABAYA_LONGITUDE",
  },
];

function readCoordinate(envName: string, min: number, max: number) {
  const raw = process.env[envName]?.trim();

  if (!raw) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${envName} tidak valid.`);
  }

  return value;
}

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const name = process.env.SEED_ADMIN_NAME ?? "Administrator";

  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.user.upsert({
    where: { email },
    update: { passwordHash, active: true, role: UserRole.ADMIN },
    create: {
      email,
      username: "admin",
      passwordHash,
      active: true,
      role: UserRole.ADMIN,
    },
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

  /*
   * =========================
   * OFFICE LOCATIONS
   * =========================
   *
   * Koordinat tidak di-hardcode
   * supaya titik geofence tidak
   * berasal dari tebakan.
   */
  for (const office of offices) {
    const latitude = readCoordinate(office.latitudeEnv, -90, 90);

    const longitude = readCoordinate(office.longitudeEnv, -180, 180);

    if (latitude === null || longitude === null) {
      console.warn(`Lewati ${office.name}: koordinat belum diisi.`);

      continue;
    }

    await prisma.attendanceLocation.upsert({
      where: {
        id: office.id,
      },

      update: {
        name: office.name,

        latitude,

        longitude,

        radiusMeters: OFFICE_RADIUS_METERS,

        active: true,
      },

      create: {
        id: office.id,

        name: office.name,

        latitude,

        longitude,

        radiusMeters: OFFICE_RADIUS_METERS,

        active: true,
      },
    });

    console.log(
      `Seeded ${office.name} (${latitude}, ${longitude}) radius ${OFFICE_RADIUS_METERS} m.`,
    );
  }

  console.log(`Seed selesai. Admin: ${name} <${email}>.`);
}

main().finally(() => prisma.$disconnect());
