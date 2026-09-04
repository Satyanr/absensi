import bcrypt from "bcryptjs";

import { NextRequest, NextResponse } from "next/server";

import { Prisma } from "@/generated/prisma/client";

import { getCurrentUser } from "@/lib/auth/session";

import { prisma } from "@/lib/prisma";

import { updateAdminUserSchema } from "@/lib/validation/admin-user";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function PATCH(request: NextRequest, context: RouteContext) {
  const actor = await getCurrentUser();

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

  if (actor.role !== "ADMIN") {
    return NextResponse.json(
      {
        error: "Hanya Admin yang dapat mengelola user.",
      },
      {
        status: 403,
      },
    );
  }

  const { id } = await context.params;

  let body: unknown;

  try {
    body = await request.json();
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

  const parsed = updateAdminUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Data user tidak valid.",

        details: parsed.error.flatten(),
      },
      {
        status: 400,
      },
    );
  }

  const passwordHash = parsed.data.password
    ? await bcrypt.hash(parsed.data.password, 12)
    : undefined;

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const existing = await tx.user.findUnique({
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
          throw new Error("USER_NOT_FOUND");
        }

        /*
         * Endpoint ini hanya
         * mengelola ADMIN/LEADER.
         */
        if (existing.role !== "ADMIN" && existing.role !== "LEADER") {
          throw new Error("USER_NOT_MANAGEABLE");
        }

        const nextActive = parsed.data.active ?? existing.active;

        const nextRole = parsed.data.role ?? existing.role;

        if (actor.id === existing.id && !nextActive) {
          throw new Error("SELF_DEACTIVATE");
        }

        /*
         * Proteksi admin terakhir
         * ada DI DALAM transaksi.
         */
        if (
          existing.role === "ADMIN" &&
          existing.active &&
          (nextRole !== "ADMIN" || !nextActive)
        ) {
          const activeAdmins = await tx.user.count({
            where: {
              role: "ADMIN",
              active: true,
            },
          });

          if (activeAdmins <= 1) {
            throw new Error("LAST_ADMIN");
          }
        }

        const nextEmail =
          parsed.data.email !== undefined
            ? parsed.data.email.toLowerCase()
            : existing.email;

        const nextUsername =
          parsed.data.username !== undefined
            ? parsed.data.username
            : existing.username;

        const identifierConflict = await tx.user.findFirst({
          where: {
            id: {
              not: existing.id,
            },

            OR: [
              ...(nextEmail
                ? [
                    {
                      email: {
                        equals: nextEmail,

                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),

              ...(nextUsername
                ? [
                    {
                      username: {
                        equals: nextUsername,

                        mode: "insensitive" as const,
                      },
                    },
                  ]
                : []),
            ],
          },

          select: {
            id: true,
          },
        });

        if (identifierConflict) {
          throw new Error("USER_IDENTIFIER_CONFLICT");
        }

        const roleChanged = nextRole !== existing.role;

        const activeChanged = nextActive !== existing.active;

        const updated = await tx.user.update({
          where: {
            id: existing.id,
          },

          data: {
            ...(parsed.data.email !== undefined
              ? {
                  email: nextEmail,
                }
              : {}),

            ...(parsed.data.username !== undefined
              ? {
                  username: nextUsername,
                }
              : {}),

            ...(parsed.data.role !== undefined
              ? {
                  role: parsed.data.role,
                }
              : {}),

            ...(parsed.data.active !== undefined
              ? {
                  active: parsed.data.active,
                }
              : {}),

            ...(passwordHash
              ? {
                  passwordHash,

                  /*
                   * Login sekarang
                   * memilih pinHash
                   * sebelum passwordHash.
                   *
                   * Reset password harus
                   * membuang PIN lama.
                   */
                  pinHash: null,
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
         * Cabut sesi hanya jika
         * memang diperlukan.
         */
        if (passwordHash || roleChanged || (activeChanged && !nextActive)) {
          await tx.session.deleteMany({
            where: {
              userId: existing.id,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            actorId: actor.id,

            action: "UPDATE",

            entityType: "User",

            entityId: existing.id,

            before: {
              email: existing.email,

              username: existing.username,

              role: existing.role,

              active: existing.active,
            },

            after: {
              email: updated.email,

              username: updated.username,

              role: updated.role,

              active: updated.active,

              passwordChanged: Boolean(passwordHash),
            },

            ipAddress:
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              null,

            userAgent: request.headers.get("user-agent"),
          },
        });

        return updated;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      },
    );

    return NextResponse.json({
      ok: true,

      message: result.active
        ? "User berhasil diperbarui."
        : "User berhasil dinonaktifkan.",

      user: result,
    });
  } catch (error) {
    console.error(error);

    if (error instanceof Error) {
      switch (error.message) {
        case "USER_NOT_FOUND":
          return NextResponse.json(
            {
              error: "User tidak ditemukan.",
            },
            {
              status: 404,
            },
          );

        case "USER_NOT_MANAGEABLE":
          return NextResponse.json(
            {
              error: "User ini tidak dapat dikelola dari menu User.",
            },
            {
              status: 403,
            },
          );

        case "SELF_DEACTIVATE":
          return NextResponse.json(
            {
              error: "Anda tidak dapat menonaktifkan akun sendiri.",
            },
            {
              status: 409,
            },
          );

        case "LAST_ADMIN":
          return NextResponse.json(
            {
              error:
                "Admin terakhir tidak dapat dinonaktifkan atau diubah menjadi Leader.",
            },
            {
              status: 409,
            },
          );

        case "USER_IDENTIFIER_CONFLICT":
          return NextResponse.json(
            {
              error: "Email atau username sudah digunakan.",
            },
            {
              status: 409,
            },
          );
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          {
            error: "Email atau username sudah digunakan.",
          },
          {
            status: 409,
          },
        );
      }

      if (error.code === "P2034") {
        return NextResponse.json(
          {
            error: "Data user berubah bersamaan. Silakan coba kembali.",
          },
          {
            status: 409,
          },
        );
      }
    }

    return NextResponse.json(
      {
        error: "Gagal memperbarui user.",
      },
      {
        status: 500,
      },
    );
  }
}
