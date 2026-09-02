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
  if (!value) {
    return "lampiran";
  }

  return value.replace(/[\r\n"]/g, "_");
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

  const leaveRequest = await prisma.leaveRequest.findUnique({
    where: {
      id,
    },

    select: {
      id: true,

      attachment: {
        select: {
          storageDisk: true,
          storagePath: true,
          originalFilename: true,
          mimeType: true,
          fileSize: true,
        },
      },
    },
  });

  if (!leaveRequest) {
    return NextResponse.json(
      {
        error: "Pengajuan tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  if (!leaveRequest.attachment) {
    return NextResponse.json(
      {
        error: "Pengajuan ini tidak memiliki lampiran.",
      },
      {
        status: 404,
      },
    );
  }

  if (leaveRequest.attachment.storageDisk !== "local") {
    return NextResponse.json(
      {
        error: "Storage lampiran tidak didukung.",
      },
      {
        status: 500,
      },
    );
  }

  const configuredRoot = process.env.LEAVE_STORAGE_PATH ?? "./storage/leave";

  const storageRoot = path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(
        /*turbopackIgnore: true*/
        process.cwd(),
        configuredRoot,
      );

  /*
   * Resolve path dan pastikan file
   * tetap berada di storage/leave.
   *
   * Ini melindungi dari
   * path traversal.
   */
  const absolutePath = path.resolve(
    storageRoot,
    leaveRequest.attachment.storagePath,
  );

  const relative = path.relative(storageRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json(
      {
        error: "Path lampiran tidak valid.",
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
        error: "File lampiran tidak ditemukan di penyimpanan.",
      },
      {
        status: 404,
      },
    );
  }

  const filename = safeFilename(leaveRequest.attachment.originalFilename);

  return new NextResponse(new Uint8Array(file), {
    status: 200,

    headers: {
      "Content-Type": leaveRequest.attachment.mimeType,

      "Content-Length": String(file.length),

      /*
       * inline:
       * gambar/PDF akan dibuka
       * di browser jika didukung.
       */
      "Content-Disposition": `inline; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,

      /*
       * Lampiran izin/sakit
       * adalah data internal.
       */
      "Cache-Control": "private, no-store",

      "X-Content-Type-Options": "nosniff",
    },
  });
}
