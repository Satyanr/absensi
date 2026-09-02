import crypto from "node:crypto";
import path from "node:path";

import {
  mkdir,
  unlink,
  writeFile,
} from "node:fs/promises";

function getExtension(
  mimeType: string
) {
  switch (mimeType) {
    case "image/png":
      return ".png";

    case "image/webp":
      return ".webp";

    case "image/heic":
      return ".heic";

    case "image/heif":
      return ".heif";

    case "application/pdf":
      return ".pdf";

    default:
      return ".jpg";
  }
}

export const allowedLeaveAttachmentMimeTypes =
  [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf",
  ];

export function getLeaveAttachmentMaxBytes() {
  return Number(
    process.env
      .MAX_LEAVE_ATTACHMENT_BYTES ??
      5 * 1024 * 1024
  );
}

export async function saveLeaveAttachment(
  file: File
) {
  const now = new Date();

  const bytes = Buffer.from(
    await file.arrayBuffer()
  );

  const checksum = crypto
    .createHash("sha256")
    .update(bytes)
    .digest("hex");

  const extension =
    getExtension(file.type);

  const relativeDirectory = [
    String(
      now.getUTCFullYear()
    ),

    String(
      now.getUTCMonth() + 1
    ).padStart(2, "0"),

    String(
      now.getUTCDate()
    ).padStart(2, "0"),
  ].join("/");

  const filename =
    `${crypto.randomUUID()}${extension}`;

  const relativePath =
    `${relativeDirectory}/${filename}`;

  const configuredRoot =
    process.env
      .LEAVE_STORAGE_PATH ??
    "./storage/leave";

  const storageRoot =
    path.isAbsolute(
      configuredRoot
    )
      ? configuredRoot
      : path.resolve(
          process.cwd(),
          configuredRoot
        );

  const directoryPath =
    path.join(
      storageRoot,
      relativeDirectory
    );

  const absolutePath =
    path.join(
      storageRoot,
      relativePath
    );

  await mkdir(
    directoryPath,
    {
      recursive: true,
    }
  );

  await writeFile(
    absolutePath,
    bytes
  );

  return {
    storagePath:
      relativePath,

    absolutePath,

    originalFilename:
      file.name || null,

    mimeType:
      file.type,

    fileSize:
      BigInt(file.size),

    checksum,
  };
}

export async function removeLeaveAttachment(
  absolutePath: string
) {
  await unlink(
    absolutePath
  ).catch(
    () => undefined
  );
}