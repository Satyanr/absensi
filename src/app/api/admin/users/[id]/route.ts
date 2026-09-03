import bcrypt from "bcryptjs";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  Prisma,
} from "@/generated/prisma/client";

import {
  getCurrentUser,
} from "@/lib/auth/session";

import {
  prisma,
} from "@/lib/prisma";

import {
  updateAdminUserSchema,
} from "@/lib/validation/admin-user";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
) {
  const actor =
    await getCurrentUser();

  if (!actor) {
    return NextResponse.json(
      {
        error: "Belum login.",
      },
      {
        status: 401,
      },
    );
  }

  if (
    actor.role !== "ADMIN"
  ) {
    return NextResponse.json(
      {
        error:
          "Hanya Admin yang dapat mengelola user.",
      },
      {
        status: 403,
      },
    );
  }

  const { id } =
    await context.params;

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
      },
    );
  }

  const parsed =
    updateAdminUserSchema
      .safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          "Data user tidak valid.",

        details:
          parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const existing =
    await prisma.user.findUnique({
      where: {
        id,
      },

      select: {
        id: true,

        email: true,

        username: true,

        role: true,

        active: true,
      },
    });

  if (!existing) {
    return NextResponse.json(
      {
        error:
          "User tidak ditemukan.",
      },
      {
        status: 404,
      },
    );
  }

  const nextActive =
    parsed.data.active ??
    existing.active;

  const nextRole =
    parsed.data.role ??
    existing.role;

  /*
   * Admin tidak boleh
   * menonaktifkan dirinya sendiri.
   */
  if (
    actor.id === existing.id &&
    nextActive === false
  ) {
    return NextResponse.json(
      {
        error:
          "Anda tidak dapat menonaktifkan akun sendiri.",
      },
      {
        status: 409,
      },
    );
  }

  /*
   * Jangan sampai kehilangan
   * seluruh ADMIN aktif.
   */
  if (
    existing.role === "ADMIN" &&
    existing.active &&
    (
      nextRole !== "ADMIN" ||
      !nextActive
    )
  ) {
    const activeAdmins =
      await prisma.user.count({
        where: {
          role: "ADMIN",
          active: true,
        },
      });

    if (
      activeAdmins <= 1
    ) {
      return NextResponse.json(
        {
          error:
            "Admin terakhir tidak dapat dinonaktifkan atau diubah menjadi Leader.",
        },
        {
          status: 409,
        },
      );
    }
  }

  const passwordHash =
    parsed.data.password
      ? await bcrypt.hash(
          parsed.data.password,
          12,
        )
      : undefined;

  try {
    const result =
      await prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.user.update({
              where: {
                id:
                  existing.id,
              },

              data: {
                ...(parsed.data
                  .email !==
                undefined
                  ? {
                      email:
                        parsed.data.email.toLowerCase(),
                    }
                  : {}),

                ...(parsed.data
                  .username !==
                undefined
                  ? {
                      username:
                        parsed.data.username ??
                        null,
                    }
                  : {}),

                ...(parsed.data
                  .role !==
                undefined
                  ? {
                      role:
                        parsed.data.role,
                    }
                  : {}),

                ...(parsed.data
                  .active !==
                undefined
                  ? {
                      active:
                        parsed.data.active,
                    }
                  : {}),

                ...(passwordHash
                  ? {
                      passwordHash,
                    }
                  : {}),
              },

              select: {
                id: true,
                email: true,
                username: true,
                role: true,
                active: true,
              },
            });

          /*
           * Cabut session jika:
           * - password diganti
           * - role diganti
           * - user dinonaktifkan
           */
          if (
            passwordHash ||
            parsed.data.role !==
              undefined ||
            nextActive === false
          ) {
            await tx.session.deleteMany({
              where: {
                userId:
                  existing.id,
              },
            });
          }

          await tx.auditLog.create({
            data: {
              actorId:
                actor.id,

              action:
                "UPDATE",

              entityType:
                "User",

              entityId:
                existing.id,

              before: {
                email:
                  existing.email,

                username:
                  existing.username,

                role:
                  existing.role,

                active:
                  existing.active,
              },

              after: {
                email:
                  updated.email,

                username:
                  updated.username,

                role:
                  updated.role,

                active:
                  updated.active,

                passwordChanged:
                  Boolean(
                    passwordHash,
                  ),
              },

              ipAddress:
                request.headers
                  .get(
                    "x-forwarded-for",
                  )
                  ?.split(",")[0]
                  ?.trim() ??
                null,

              userAgent:
                request.headers.get(
                  "user-agent",
                ),
            },
          });

          return updated;
        },
      );

    return NextResponse.json({
      ok: true,

      message:
        result.active
          ? "User berhasil diperbarui."
          : "User berhasil dinonaktifkan.",

      user: result,
    });
  } catch (error) {
    console.error(error);

    if (
      error instanceof
        Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        {
          error:
            "Email atau username sudah digunakan.",
        },
        {
          status: 409,
        },
      );
    }

    return NextResponse.json(
      {
        error:
          "Gagal memperbarui user.",
      },
      {
        status: 500,
      },
    );
  }
}