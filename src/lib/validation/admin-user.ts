import { z } from "zod";

const createUsernameSchema = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((value) =>
    value ? value : undefined,
  );

const updateUsernameSchema = z
  .union([
    z.string().trim().max(60),
    z.null(),
  ])
  .optional()
  .transform((value) =>
    value === "" ? null : value,
  );

export const createAdminUserSchema =
  z.object({
    email: z
      .string()
      .trim()
      .email("Email tidak valid.")
      .max(160),

    username:
      createUsernameSchema,

    password: z
      .string()
      .min(
        8,
        "Password minimal 8 karakter.",
      )
      .max(128),

    role: z.enum([
      "ADMIN",
      "LEADER",
    ]),
  });

export const updateAdminUserSchema =
  z
    .object({
      email: z
        .string()
        .trim()
        .email("Email tidak valid.")
        .max(160)
        .optional(),

      username:
        updateUsernameSchema,

      password: z
        .string()
        .min(
          8,
          "Password minimal 8 karakter.",
        )
        .max(128)
        .optional(),

      role: z
        .enum([
          "ADMIN",
          "LEADER",
        ])
        .optional(),

      active:
        z.boolean().optional(),
    })
    .refine(
      (data) =>
        Object.values(data).some(
          (value) =>
            value !== undefined,
        ),
      {
        message:
          "Tidak ada perubahan.",
      },
    );