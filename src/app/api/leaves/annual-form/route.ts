import path from "node:path";

import {
  readFile,
} from "node:fs/promises";

import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  prisma,
} from "@/lib/prisma";

import {
  countLeaveDaysByYear,
} from "@/lib/leave/balance";

import {
  createPublicLeaveRequestSchema,
} from "@/lib/validation/leave";

export const runtime =
  "nodejs";

function formatDate(
  value: Date
) {
  return new Intl.DateTimeFormat(
    "id-ID",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }
  ).format(value);
}

function safeFilenamePart(
  value: string
) {
  return value.replace(
    /[^a-zA-Z0-9_-]/g,
    "-"
  );
}

export async function POST(
  request: NextRequest
) {
  let body: unknown;

  try {
    body =
      await request.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Request tidak valid.",
      },
      {
        status: 400,
      }
    );
  }

  const input =
    typeof body === "object" &&
    body !== null
      ? body as Record<
          string,
          unknown
        >
      : {};

  /*
   * Pakai validation yang sama
   * dengan pengajuan publik.
   *
   * Type dipaksa ANNUAL_LEAVE
   * oleh server.
   */
  const parsed =
    createPublicLeaveRequestSchema.safeParse({
      employeeCode:
        input.employeeCode,

      type:
        "ANNUAL_LEAVE",

      startDate:
        input.startDate,

      endDate:
        input.endDate,

      reason:
        input.reason,
    });

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Data form cuti tidak valid.",

        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      }
    );
  }

  /*
   * Cari employee dari server.
   *
   * Jangan percaya nama yang
   * dikirim browser.
   */
  const employee =
    await prisma.employee.findFirst({
      where: {
        active: true,

        employeeCode: {
          equals:
            parsed.data.employeeCode,

          mode:
            "insensitive",
        },
      },

      select: {
        employeeCode: true,
        name: true,
        leaveEligible: true,
      },
    });

  if (!employee) {
    return NextResponse.json(
      {
        error:
          "Karyawan tidak ditemukan atau sudah nonaktif.",
      },
      {
        status: 404,
      }
    );
  }

  if (
    !employee.leaveEligible
  ) {
    return NextResponse.json(
      {
        error:
          "Karyawan belum memiliki hak cuti.",
      },
      {
        status: 409,
      }
    );
  }

  const startDate =
    new Date(
      `${parsed.data.startDate}T00:00:00.000Z`
    );

  const endDate =
    new Date(
      `${parsed.data.endDate}T00:00:00.000Z`
    );

  /*
   * Gunakan perhitungan yang sama
   * dengan LeaveBalance.
   *
   * Saat ini masih calendar days.
   */
  const usages =
    countLeaveDaysByYear(
      startDate,
      endDate
    );

  const leaveDays =
    usages.reduce(
      (
        total,
        item
      ) =>
        total +
        item.days,
      0
    );

  /*
   * Master template adalah
   * resource aplikasi.
   *
   * Path dibuat statis supaya
   * Turbopack hanya perlu trace
   * folder resources/templates.
   */
  const templatePath =
    path.join(
      process.cwd(),
      "resources",
      "templates",
      "form-pengajuan-cuti.docx"
    );

  let template: Buffer;

  try {
    template =
      await readFile(
        templatePath
      );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Template form cuti belum tersedia di server.",
      },
      {
        status: 500,
      }
    );
  }

  try {
    const zip =
      new PizZip(
        template
      );

    const doc =
      new Docxtemplater(
        zip,
        {
          paragraphLoop:
            true,

          linebreaks:
            true,
        }
      );

    /*
     * Hanya data yang aman
     * untuk endpoint publik
     * yang kita isi otomatis.
     *
     * Jabatan, Departemen,
     * Alamat, No HP,
     * Pengganti dan tanda tangan
     * tetap diisi manual.
     */
    doc.render({
      employeeName:
        employee.name,

      leaveType:
        "Cuti Tahunan",

      startDate:
        formatDate(
          startDate
        ),

      endDate:
        formatDate(
          endDate
        ),

      leaveDays:
        `${leaveDays} Hari`,

      reason:
        parsed.data.reason,
    });

    const output =
      doc.toBuffer();

    const filename =
      [
        "Form-Cuti",
        safeFilenamePart(
          employee.employeeCode
        ),
        parsed.data.startDate,
      ].join("-") +
      ".docx";

    return new NextResponse(
      new Uint8Array(
        output
      ),
      {
        status: 200,

        headers: {
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

          "Content-Disposition":
            `attachment; filename="${filename}"`,

          "Cache-Control":
            "private, no-store",
        },
      }
    );
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error:
          "Gagal membuat Form Pengajuan Cuti.",
      },
      {
        status: 500,
      }
    );
  }
}