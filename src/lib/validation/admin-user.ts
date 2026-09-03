import { z } from "zod";

const usernameSchema = z
  .string()
  .trim()
  .max(60)
  .optional()
  .transform((value) =>
    value ? value : undefined,
  );

export const createAdminUserSchema =
  z.object({
    email: z
      .string()
      .trim()
      .email(
        "Email tidak valid.",
      )
      .max(160),

    username:
      usernameSchema,

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
  z.object({
    email: z
      .string()
      .trim()
      .email(
        "Email tidak valid.",
      )
      .max(160)
      .optional(),

    username:
      usernameSchema,

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
  });