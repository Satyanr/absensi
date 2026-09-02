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

  if (user.role === "EMPLOYEE") {
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

  const configuredRoot =
    process.env.ATTENDANCE_STORAGE_PATH ?? "./storage/attendance";

  const storageRoot = path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(
        /*turbopackIgnore: true*/
        process.cwd(),
        configuredRoot,
      );

  const absolutePath = path.resolve(
    /*turbopackIgnore: true*/
    storageRoot,
    event.photo.storagePath,
  );

  /*
   * Proteksi path traversal.
   */
  const relative = path.relative(storageRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json(
      {
        error: "Path foto tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  let file: Buffer;

  try {
    file = await readFile(absolutePath);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: "File foto tidak ditemukan di penyimpanan.",
      },
      {
        status: 404,
      },
    );
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
