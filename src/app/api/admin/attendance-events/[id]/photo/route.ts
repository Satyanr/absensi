import path from "node:path";

import { readFile } from "node:fs/promises";

import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

function safeFilename(value: string | null) {
  return value?.replace(/[\r\n"]/g, "_") ?? "selfie";
}

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Belum login.",
      },
      {
        status: 401,
      },
    );
  }

  if (user.role !== "ADMIN" && user.role !== "LEADER") {
    return NextResponse.json(
      {
        error: "Tidak memiliki akses.",
      },
      {
        status: 403,
      },
    );
  }

  const { id } = await context.params;

  const event = await prisma.attendanceEvent.findUnique({
    where: {
      id,
    },

    select: {
      id: true,
      eventType: true,

      employee: {
        select: {
          employeeCode: true,
        },
      },

      photo: {
        select: {
          storageDisk: true,
          storagePath: true,
          originalFilename: true,
          mimeType: true,
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json(
      {
        error: "Data absensi tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  if (!event.photo) {
    return NextResponse.json(
      {
        error: "Foto absensi tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  if (event.photo.storageDisk !== "local") {
    return NextResponse.json(
      {
        error: "Storage foto tidak didukung.",
      },
      {
        status: 500,
      },
    );
  }

  const activeConfiguredRoot =
    process.env.ATTENDANCE_STORAGE_PATH ?? "./storage/attendance";

  const archiveConfiguredRoot =
    process.env.ATTENDANCE_ARCHIVE_PATH ?? "./storage/attendance-archive";

  const activeRoot = path.isAbsolute(activeConfiguredRoot)
    ? activeConfiguredRoot
    : path.resolve(process.cwd(), activeConfiguredRoot);

  const archiveRoot = path.isAbsolute(archiveConfiguredRoot)
    ? archiveConfiguredRoot
    : path.resolve(process.cwd(), archiveConfiguredRoot);

  const activePath = path.resolve(activeRoot, event.photo.storagePath);

  const archivePath = path.resolve(archiveRoot, event.photo.storagePath);

  let file: Buffer;

  try {
    // Prioritas pertama: Docker volume
    file = await readFile(activePath);
  } catch {
    try {
      // Kalau sudah dipindahkan, baca archive lokal
      file = await readFile(archivePath);
    } catch {
      return NextResponse.json(
        {
          error: "File foto tidak ditemukan di penyimpanan.",
        },
        {
          status: 404,
        },
      );
    }
  }

  const typeLabel = event.eventType === "CHECK_IN" ? "masuk" : "pulang";

  const fallbackFilename = `${event.employee.employeeCode}-${typeLabel}.jpg`;

  const filename = safeFilename(
    event.photo.originalFilename ?? fallbackFilename,
  );

  return new NextResponse(new Uint8Array(file), {
    status: 200,

    headers: {
      "Content-Type": event.photo.mimeType,

      "Content-Length": String(file.length),

      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,

      "Cache-Control": "private, no-store",

      "X-Content-Type-Options": "nosniff",
    },
  });
}
