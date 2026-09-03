import PizZip from "pizzip";

export type DetectedUpload = {
  mimeType: string;
  extension: string;
};

function startsWith(
  bytes: Buffer,
  signature: number[],
) {
  if (
    bytes.length <
    signature.length
  ) {
    return false;
  }

  return signature.every(
    (value, index) =>
      bytes[index] === value,
  );
}

export function detectImageFile(
  bytes: Buffer,
): DetectedUpload | null {
  /*
   * JPEG
   * FF D8 FF
   */
  if (
    startsWith(
      bytes,
      [0xff, 0xd8, 0xff],
    )
  ) {
    return {
      mimeType:
        "image/jpeg",

      extension:
        ".jpg",
    };
  }

  /*
   * PNG
   */
  if (
    startsWith(
      bytes,
      [
        0x89,
        0x50,
        0x4e,
        0x47,
        0x0d,
        0x0a,
        0x1a,
        0x0a,
      ],
    )
  ) {
    return {
      mimeType:
        "image/png",

      extension:
        ".png",
    };
  }

  /*
   * WEBP:
   * RIFF....WEBP
   */
  if (
    bytes.length >= 12 &&
    bytes
      .subarray(0, 4)
      .toString("ascii") ===
      "RIFF" &&
    bytes
      .subarray(8, 12)
      .toString("ascii") ===
      "WEBP"
  ) {
    return {
      mimeType:
        "image/webp",

      extension:
        ".webp",
    };
  }

  /*
   * HEIC / HEIF memakai
   * ISO Base Media File Format.
   */
  const brands =
    getIsoBmffBrands(
      bytes,
    );

  /*
   * Jangan menerima AVIF sebagai
   * HEIF hanya karena compatible
   * dengan mif1.
   */
  if (
    brands.has("avif") ||
    brands.has("avis")
  ) {
    return null;
  }

  const heicBrands = [
    "heic",
    "heix",
    "hevc",
    "hevx",
  ];

  if (
    heicBrands.some(
      (brand) =>
        brands.has(brand),
    )
  ) {
    return {
      mimeType:
        "image/heic",

      extension:
        ".heic",
    };
  }

  const heifBrands = [
    "mif1",
    "msf1",
    "heim",
    "heis",
    "hevm",
    "hevs",
  ];

  if (
    heifBrands.some(
      (brand) =>
        brands.has(brand),
    )
  ) {
    return {
      mimeType:
        "image/heif",

      extension:
        ".heif",
    };
  }

  return null;
}

function getIsoBmffBrands(
  bytes: Buffer,
) {
  const brands =
    new Set<string>();

  if (
    bytes.length < 16 ||
    bytes
      .subarray(4, 8)
      .toString("ascii") !==
      "ftyp"
  ) {
    return brands;
  }

  /*
   * Box size berasal dari file.
   * Batasi pembacaan supaya parser
   * tidak berjalan terlalu jauh.
   */
  const declaredSize =
    bytes.readUInt32BE(0);

  const limit =
    Math.min(
      bytes.length,
      declaredSize >= 16
        ? declaredSize
        : bytes.length,
      256,
    );

  brands.add(
    bytes
      .subarray(8, 12)
      .toString("ascii"),
  );

  for (
    let offset = 16;
    offset + 4 <= limit;
    offset += 4
  ) {
    brands.add(
      bytes
        .subarray(
          offset,
          offset + 4,
        )
        .toString("ascii"),
    );
  }

  return brands;
}

export function detectPdfFile(
  bytes: Buffer,
): DetectedUpload | null {
  if (
    bytes.length >= 5 &&
    bytes
      .subarray(0, 5)
      .toString("ascii") ===
      "%PDF-"
  ) {
    return {
      mimeType:
        "application/pdf",

      extension:
        ".pdf",
    };
  }

  return null;
}

export function detectDocxFile(
  bytes: Buffer,
): DetectedUpload | null {
  /*
   * DOCX harus ZIP.
   */
  const isZip =
    startsWith(
      bytes,
      [
        0x50,
        0x4b,
        0x03,
        0x04,
      ],
    );

  if (!isZip) {
    return null;
  }

  try {
    const zip =
      new PizZip(bytes);

    const contentTypes =
      zip.file(
        "[Content_Types].xml",
      );

    const document =
      zip.file(
        "word/document.xml",
      );

    const relationships =
      zip.file(
        "_rels/.rels",
      );

    if (
      !contentTypes ||
      !document ||
      !relationships
    ) {
      return null;
    }

    /*
     * Cek bahwa ZIP memang paket
     * WordProcessingML.
     */
    const contentTypesXml =
      contentTypes.asText();

    if (
      !contentTypesXml.includes(
        "wordprocessingml.document",
      )
    ) {
      return null;
    }

    return {
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

      extension:
        ".docx",
    };
  } catch {
    return null;
  }
}

export function detectLeaveEvidenceFile(
  bytes: Buffer,
) {
  return (
    detectImageFile(
      bytes,
    ) ??
    detectPdfFile(
      bytes,
    )
  );
}

export function detectFinalLeaveDocument(
  bytes: Buffer,
) {
  return (
    detectDocxFile(
      bytes,
    ) ??
    detectPdfFile(
      bytes,
    )
  );
}