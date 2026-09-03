import path from "node:path";

import {
  prisma,
} from "@/lib/prisma";

function getLeaveStorageRoot() {
  const configuredRoot =
    process.env
      .LEAVE_STORAGE_PATH ??
    "./storage/leave";

  return path.isAbsolute(
    configuredRoot,
  )
    ? configuredRoot
    : path.resolve(
        /*turbopackIgnore: true*/
        process.cwd(),
        configuredRoot,
      );
}

function safeFilename(
  value: string | null,
  mimeType: string,
) {
  const fallback =
    mimeType ===
    "application/pdf"
      ? "dokumen-cuti-final.pdf"
      : "dokumen-cuti-final.docx";

  const filename =
    value
      ? path.basename(value)
      : fallback;

  return filename.replace(
    /[\r\n"]/g,
    "_",
  );
}

export async function getApprovedLeaveEmailAttachment(
  leaveRequestId: string,
) {
  const leave =
    await prisma.leaveRequest.findUnique({
      where: {
        id:
          leaveRequestId,
      },

      select: {
        approvedDocument: {
          select: {
            storageDisk:
              true,

            storagePath:
              true,

            originalFilename:
              true,

            mimeType:
              true,
          },
        },
      },
    });

  if (
    !leave?.approvedDocument
  ) {
    throw new Error(
      "Dokumen final cuti tidak ditemukan.",
    );
  }

  const document =
    leave.approvedDocument;

  if (
    document.storageDisk !==
    "local"
  ) {
    throw new Error(
      "Storage dokumen final tidak didukung.",
    );
  }

  const storageRoot =
    getLeaveStorageRoot();

  const absolutePath =
    path.resolve(
      /*turbopackIgnore: true*/
      storageRoot,
      document.storagePath,
    );

  /*
   * Proteksi path traversal
   * sama seperti endpoint download.
   */
  const relative =
    path.relative(
      storageRoot,
      absolutePath,
    );

  if (
    relative.startsWith(
      "..",
    ) ||
    path.isAbsolute(
      relative,
    )
  ) {
    throw new Error(
      "Path dokumen final tidak valid.",
    );
  }

  return {
    filename:
      safeFilename(
        document.originalFilename,
        document.mimeType,
      ),

    path:
      absolutePath,

    contentType:
      document.mimeType,
  };
}