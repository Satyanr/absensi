import bcrypt from "bcryptjs";
import { NextRequest, NextResponse } from "next/server";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Input login tidak valid." }, { status: 400 });
  }

  const { identifier, secret } = parsed.data;
  const user = await prisma.user.findFirst({
    where: {
      active: true,
      OR: [
        { email: { equals: identifier, mode: "insensitive" } },
        { username: { equals: identifier, mode: "insensitive" } },
        { employee: { employeeCode: { equals: identifier, mode: "insensitive" } } },
      ],
    },
  });

  const hash = user?.pinHash ?? user?.passwordHash;
  const ok = user && hash ? await bcrypt.compare(secret, hash) : false;
  if (!ok || !user) {
    return NextResponse.json({ error: "Kredensial salah." }, { status: 401 });
  }

  await createSession(user.id, {
    ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
    userAgent: request.headers.get("user-agent") ?? undefined,
  });

  return NextResponse.json({ ok: true, role: user.role });
}
