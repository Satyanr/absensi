import { z } from "zod";

export const loginSchema = z.object({
  identifier: z.string().trim().min(1).max(120),
  secret: z.string().min(4).max(128),
});
