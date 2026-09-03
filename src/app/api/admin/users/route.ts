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
  createAdminUserSchema,
} from "@/lib/validation/admin-user";

export async function POST(
  request: NextRequest,
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

  /*
   * User management
   * khusus ADMIN.
   */
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
    createAdminUserSchema
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

  const email =
    parsed.data.email
      .toLowerCase();

  const username =
    parsed.data.username ??
    null;

  const passwordHash =
    await bcrypt.hash(
      parsed.data.password,
      12,
    );

  try {
    const created =
      await prisma.$transaction(
        async (tx) => {
          const user =
            await tx.user.create({
              data: {
                email,

                username,

                passwordHash,

                role:
                  parsed.data.role,

                active:
                  true,
              },

              select: {
                id: true,
                email: true,
                username: true,
                role: true,
                active: true,
              },
            });

          await tx.auditLog.create({
            data: {
              actorId:
                actor.id,

              action:
                "CREATE",

              entityType:
                "User",

              entityId:
                user.id,

              after: {
                email:
                  user.email,

                username:
                  user.username,

                role:
                  user.role,

                active:
                  user.active,
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

          return user;
        },
      );

    return NextResponse.json(
      {
        ok: true,

        message:
          "User berhasil ditambahkan.",

        user: created,
      },
      {
        status: 201,
      },
    );
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
          "Gagal menyimpan user.",
      },
      {
        status: 500,
      },
    );
  }
}