import "dotenv/config";
import path from "node:path";
import { unlink } from "node:fs/promises";
import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";

import type { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";

type StorageKind = "attendance" | "leave";

type ParsedArgs = {
  all: boolean;
  yes: boolean;
  date: string;
};

function jakartaToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isValidDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  const all = args.includes("--all");
  const yes = args.includes("--yes");
  const dateArg = args.find((arg) => arg.startsWith("--date="));
  const date = dateArg?.slice("--date=".length) || jakartaToday();

  if (all && dateArg) {
    throw new Error("Gunakan --all atau --date=YYYY-MM-DD, jangan keduanya.");
  }

  if (!isValidDate(date)) {
    throw new Error(`Tanggal tidak valid: ${date}`);
  }

  return { all, yes, date };
}

function getJakartaDayRange(date: string) {
  const start = new Date(`${date}T00:00:00+07:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  return { start, end };
}

function getStorageRoot(kind: StorageKind) {
  const configured =
    kind === "attendance"
      ? process.env.ATTENDANCE_STORAGE_PATH ?? "./storage/attendance"
      : process.env.LEAVE_STORAGE_PATH ?? "./storage/leave";

  return path.isAbsolute(configured)
    ? configured
    : path.resolve(process.cwd(), configured);
}

function resolveStoragePath(kind: StorageKind, storagePath: string) {
  const root = getStorageRoot(kind);
  const absolutePath = path.resolve(root, storagePath);
  const relative = path.relative(root, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Storage path tidak aman: ${storagePath}`);
  }

  return absolutePath;
}

async function confirmCleanup(message: string) {
  const rl = createInterface({ input, output });

  try {
    const answer = await rl.question(
      `${message}\nKetik HAPUS untuk melanjutkan: `,
    );

    return answer.trim() === "HAPUS";
  } finally {
    rl.close();
  }
}

async function main() {
  const { all, yes, date } = parseArgs();
  const { start, end } = getJakartaDayRange(date);
  const attendanceDate = new Date(`${date}T00:00:00.000Z`);

  /*
   * Hanya hapus attendance yang TIDAK memiliki event LEGACY_IMPORT.
   * Dengan begitu hasil import database lama tetap aman.
   */
  const attendanceDays = await prisma.attendanceDay.findMany({
    where: {
      ...(all ? {} : { attendanceDate }),
      events: {
        none: {
          source: "LEGACY_IMPORT",
        },
      },
    },
    select: {
      id: true,
      events: {
        select: {
          photo: {
            select: {
              id: true,
              storageDisk: true,
              storagePath: true,
            },
          },
        },
      },
    },
  });

  /*
   * Leave legacy ditandai legacyApprovalId.
   * Yang memiliki legacyApprovalId tidak disentuh.
   */
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      legacyApprovalId: null,
      ...(all
        ? {}
        : {
            createdAt: {
              gte: start,
              lt: end,
            },
          }),
    },
    select: {
      id: true,
      attachment: {
        select: {
          id: true,
          storageDisk: true,
          storagePath: true,
        },
      },
      approvedDocument: {
        select: {
          id: true,
          storageDisk: true,
          storagePath: true,
        },
      },
    },
  });

  const attendanceDayIds = attendanceDays.map((row) => row.id);
  const leaveRequestIds = leaveRequests.map((row) => row.id);

  const attachmentKinds = new Map<string, Set<StorageKind>>();
  const attachmentRows = new Map<
    string,
    { id: string; storageDisk: string; storagePath: string }
  >();

  function rememberAttachment(
    attachment:
      | { id: string; storageDisk: string; storagePath: string }
      | null,
    kind: StorageKind,
  ) {
    if (!attachment) {
      return;
    }

    attachmentRows.set(attachment.id, attachment);

    const kinds =
      attachmentKinds.get(attachment.id) ?? new Set<StorageKind>();

    kinds.add(kind);
    attachmentKinds.set(attachment.id, kinds);
  }

  for (const day of attendanceDays) {
    for (const event of day.events) {
      rememberAttachment(event.photo, "attendance");
    }
  }

  for (const leave of leaveRequests) {
    rememberAttachment(leave.attachment, "leave");
    rememberAttachment(leave.approvedDocument, "leave");
  }

  const notificationOr: Prisma.NotificationLogWhereInput[] = [];

  if (leaveRequestIds.length > 0) {
    notificationOr.push({
      entityType: "LeaveRequest",
      entityId: {
        in: leaveRequestIds,
      },
    });
  }

  notificationOr.push({
    type: "TEST_EMAIL",
    ...(all
      ? {}
      : {
          createdAt: {
            gte: start,
            lt: end,
          },
        }),
  });

  const notificationWhere: Prisma.NotificationLogWhereInput = {
    OR: notificationOr,
  };

  const notificationCount = await prisma.notificationLog.count({
    where: notificationWhere,
  });

  const attendanceEventCount =
    attendanceDayIds.length > 0
      ? await prisma.attendanceEvent.count({
          where: {
            attendanceDayId: {
              in: attendanceDayIds,
            },
          },
        })
      : 0;

  console.log("\n=== PREVIEW CLEANUP DATA TEST ===");
  console.log(
    `Mode                 : ${
      all ? "SEMUA NON-LEGACY" : `Tanggal ${date} WIB`
    }`,
  );
  console.log(`Attendance day       : ${attendanceDayIds.length}`);
  console.log(`Attendance event     : ${attendanceEventCount}`);
  console.log(`Leave request        : ${leaveRequestIds.length}`);
  console.log(`Notification log     : ${notificationCount}`);
  console.log(`Calon attachment     : ${attachmentRows.size}`);

  console.log("\nTIDAK AKAN DIHAPUS:");
  console.log("- Employee / Personel");
  console.log("- User / Admin");
  console.log("- Session login");
  console.log("- Attendance location / geofence");
  console.log("- Attendance policy");
  console.log("- Leave balance");
  console.log("- Data absensi LEGACY_IMPORT");
  console.log("- Leave legacy (legacyApprovalId terisi)");

  if (
    attendanceDayIds.length === 0 &&
    leaveRequestIds.length === 0 &&
    notificationCount === 0
  ) {
    console.log("\nTidak ada data test yang perlu dibersihkan.");
    return;
  }

  if (!yes) {
    const confirmed = await confirmCleanup(
      "\nPERINGATAN: operasi ini menghapus data secara permanen.",
    );

    if (!confirmed) {
      console.log("Cleanup dibatalkan.");
      return;
    }
  }

  /*
   * Delete utama dilakukan dalam transaction.
   * attendance_events otomatis ikut terhapus karena relasi Cascade.
   */
  const result = await prisma.$transaction(async (tx) => {
    const notifications = await tx.notificationLog.deleteMany({
      where: notificationWhere,
    });

    const leaves =
      leaveRequestIds.length > 0
        ? await tx.leaveRequest.deleteMany({
            where: {
              id: {
                in: leaveRequestIds,
              },
            },
          })
        : { count: 0 };

    const attendance =
      attendanceDayIds.length > 0
        ? await tx.attendanceDay.deleteMany({
            where: {
              id: {
                in: attendanceDayIds,
              },
            },
          })
        : { count: 0 };

    return {
      notifications: notifications.count,
      leaves: leaves.count,
      attendanceDays: attendance.count,
    };
  });

  /*
   * Setelah event/leave dihapus, cari attachment yang benar-benar orphan.
   * Attachment yang masih dipakai record lain tidak disentuh.
   */
  const candidateAttachmentIds = [...attachmentRows.keys()];

  const orphanAttachments =
    candidateAttachmentIds.length > 0
      ? await prisma.attachment.findMany({
          where: {
            id: {
              in: candidateAttachmentIds,
            },
            attendanceEvents: {
              none: {},
            },
            leaveRequests: {
              none: {},
            },
            approvedLeaveDocuments: {
              none: {},
            },
          },
          select: {
            id: true,
            storageDisk: true,
            storagePath: true,
          },
        })
      : [];

  if (orphanAttachments.length > 0) {
    await prisma.attachment.deleteMany({
      where: {
        id: {
          in: orphanAttachments.map((attachment) => attachment.id),
        },
      },
    });
  }

  /*
   * Bersihkan file fisik lokal.
   * Kalau file sudah tidak ada (ENOENT), tidak dianggap error.
   */
  let deletedFiles = 0;
  let fileWarnings = 0;

  for (const attachment of orphanAttachments) {
    if (attachment.storageDisk !== "local") {
      continue;
    }

    const kinds =
      attachmentKinds.get(attachment.id) ?? new Set<StorageKind>();

    for (const kind of kinds) {
      try {
        const absolutePath = resolveStoragePath(
          kind,
          attachment.storagePath,
        );

        await unlink(absolutePath);

        deletedFiles += 1;
        break;
      } catch (error) {
        const code =
          typeof error === "object" && error && "code" in error
            ? String((error as { code?: unknown }).code)
            : "";

        if (code === "ENOENT") {
          continue;
        }

        fileWarnings += 1;

        console.warn(
          `Gagal menghapus file attachment ${attachment.id}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  console.log("\n=== CLEANUP SELESAI ===");
  console.log(`Attendance day dihapus : ${result.attendanceDays}`);
  console.log(`Leave request dihapus  : ${result.leaves}`);
  console.log(`Notification dihapus   : ${result.notifications}`);
  console.log(`Attachment DB dihapus  : ${orphanAttachments.length}`);
  console.log(`File lokal dihapus     : ${deletedFiles}`);

  if (fileWarnings > 0) {
    console.log(`Peringatan file        : ${fileWarnings}`);
  }

  console.log("Personel dan user tetap aman.\n");
}

main()
  .catch((error) => {
    console.error(
      "Cleanup gagal:",
      error instanceof Error ? error.message : error,
    );

    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
