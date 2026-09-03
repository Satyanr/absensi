import crypto from "node:crypto";
import path from "node:path";

import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import { detectFinalLeaveDocument } from "@/lib/security/file-signature";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const PDF_MIME = "application/pdf";

const MAX_DOCUMENT_BYTES = Number(
  process.env.MAX_LEAVE_ATTACHMENT_BYTES ?? 5 * 1024 * 1024,
);

function safeFilename(value: string | null) {
  return value?.replace(/[\r\n"]/g, "_") ?? "dokumen-cuti-final";
}

function getExtension(file: File) {
  const filename = file.name.toLowerCase();

  const mime = file.type;

  const genericMime = mime === "application/octet-stream" || mime === "";

  if (filename.endsWith(".docx") && (mime === DOCX_MIME || genericMime)) {
    return ".docx";
  }

  if (filename.endsWith(".pdf") && (mime === PDF_MIME || genericMime)) {
    return ".pdf";
  }

  return null;
}

function getStorageRoot() {
  const configuredRoot = process.env.LEAVE_STORAGE_PATH ?? "./storage/leave";

  return path.isAbsolute(configuredRoot)
    ? configuredRoot
    : path.resolve(
        /*turbopackIgnore: true*/
        process.cwd(),
        configuredRoot,
      );
}

/*
 * =========================
 * DOWNLOAD FINAL DOCUMENT
 * =========================
 */

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

  const leave = await prisma.leaveRequest.findUnique({
    where: {
      id,
    },

    select: {
      id: true,

      type: true,

      approvedDocument: {
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

  if (!leave) {
    return NextResponse.json(
      {
        error: "Pengajuan tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  if (!leave.approvedDocument) {
    return NextResponse.json(
      {
        error: "Dokumen final belum tersedia.",
      },
      {
        status: 404,
      },
    );
  }

  if (leave.approvedDocument.storageDisk !== "local") {
    return NextResponse.json(
      {
        error: "Storage dokumen tidak didukung.",
      },
      {
        status: 500,
      },
    );
  }

  const storageRoot = getStorageRoot();

  const absolutePath = path.resolve(
    /*turbopackIgnore: true*/
    storageRoot,

    leave.approvedDocument.storagePath,
  );

  const relative = path.relative(storageRoot, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return NextResponse.json(
      {
        error: "Path dokumen tidak valid.",
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
        error: "File dokumen final tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  const filename = safeFilename(leave.approvedDocument.originalFilename);

  return new NextResponse(new Uint8Array(file), {
    status: 200,

    headers: {
      "Content-Type": leave.approvedDocument.mimeType,

      "Content-Length": String(file.length),

      /*
       * Final document memang
       * ditujukan untuk download.
       */
      "Content-Disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(
        filename,
      )}`,

      "Cache-Control": "private, no-store",

      "X-Content-Type-Options": "nosniff",
    },
  });
}

/*
 * =========================
 * UPLOAD FINAL DOCUMENT
 * =========================
 */

export async function POST(request: NextRequest, context: RouteContext) {
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

  let form: FormData;

  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      {
        error: "Request tidak valid.",
      },
      {
        status: 400,
      },
    );
  }

  const fileValue = form.get("file");

  if (!(fileValue instanceof File) || fileValue.size === 0) {
    return NextResponse.json(
      {
        error: "Dokumen final wajib dipilih.",
      },
      {
        status: 400,
      },
    );
  }

  const file = fileValue;

  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      {
        error: "Ukuran dokumen final maksimal 5 MB.",
      },
      {
        status: 413,
      },
    );
  }

  const bytes = Buffer.from(await file.arrayBuffer());

  const detectedDocument = detectFinalLeaveDocument(bytes);

  if (!detectedDocument) {
    return NextResponse.json(
      {
        error:
          "Isi dokumen final tidak valid. Gunakan file DOCX atau PDF asli.",
      },
      {
        status: 400,
      },
    );
  }

  const extension = detectedDocument.extension;

  const leave = await prisma.leaveRequest.findUnique({
    where: {
      id,
    },

    select: {
      id: true,

      type: true,

      status: true,

      approvedDocument: {
        select: {
          id: true,

          storageDisk: true,

          storagePath: true,
        },
      },
    },
  });

  if (!leave) {
    return NextResponse.json(
      {
        error: "Pengajuan tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  if (leave.type !== "ANNUAL_LEAVE") {
    return NextResponse.json(
      {
        error: "Dokumen final hanya digunakan untuk pengajuan Cuti.",
      },
      {
        status: 409,
      },
    );
  }

  if (leave.status !== "PENDING") {
    return NextResponse.json(
      {
        error:
          "Dokumen final hanya dapat diubah selama pengajuan masih menunggu.",
      },
      {
        status: 409,
      },
    );
  }

  const now = new Date();

  const relativeDirectory = [
    "approved",

    String(now.getUTCFullYear()),

    String(now.getUTCMonth() + 1).padStart(2, "0"),

    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");

  const filename = `${crypto.randomUUID()}${extension}`;

  const storagePath = `${relativeDirectory}/${filename}`;

  const storageRoot = getStorageRoot();

  const directoryPath = path.join(storageRoot, relativeDirectory);

  const absolutePath = path.join(storageRoot, storagePath);

  const checksum = crypto.createHash("sha256").update(bytes).digest("hex");

  await mkdir(directoryPath, {
    recursive: true,
  });

  await writeFile(absolutePath, bytes);

  let oldFilePath: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const attachment = await tx.attachment.create({
        data: {
          storageDisk: "local",

          storagePath,

          originalFilename: file.name || null,

          mimeType: detectedDocument.mimeType,

          fileSize: BigInt(file.size),

          checksum,
        },

        select: {
          id: true,
        },
      });

      /*
       * Update hanya jika masih
       * PENDING untuk mencegah
       * admin mengganti file setelah
       * approval.
       */
      const updateResult = await tx.leaveRequest.updateMany({
        where: {
          id: leave.id,

          type: "ANNUAL_LEAVE",

          status: "PENDING",
        },

        data: {
          approvedDocumentId: attachment.id,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("LEAVE_CHANGED");
      }

      if (leave.approvedDocument) {
        if (leave.approvedDocument.storageDisk === "local") {
          oldFilePath = path.join(
            storageRoot,

            leave.approvedDocument.storagePath,
          );
        }

        /*
         * Relasi sudah dipindah ke
         * attachment baru sehingga
         * attachment lama boleh
         * dibersihkan.
         */
        await tx.attachment.delete({
          where: {
            id: leave.approvedDocument.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId: user.id,

          action: "UPDATE",

          entityType: "LeaveRequest",

          entityId: leave.id,

          before: {
            approvedDocumentId: leave.approvedDocument?.id ?? null,
          },

          after: {
            approvedDocumentId: attachment.id,

            approvedDocumentFilename: file.name || null,
          },

          ipAddress: request.headers.get("x-forwarded-for"),

          userAgent: request.headers.get("user-agent"),
        },
      });
    });

    if (oldFilePath) {
      await unlink(oldFilePath).catch(() => undefined);
    }

    return NextResponse.json({
      ok: true,

      message: "Dokumen final berhasil diupload.",
    });
  } catch (error) {
    /*
     * Jangan tinggalkan file baru
     * jika transaksi database gagal.
     */
    await unlink(absolutePath).catch(() => undefined);

    console.error(error);

    if (error instanceof Error && error.message === "LEAVE_CHANGED") {
      return NextResponse.json(
        {
          error: "Pengajuan sudah berubah. Muat ulang halaman.",
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json(
      {
        error: "Gagal menyimpan dokumen final.",
      },
      {
        status: 500,
      },
    );
  }
}
