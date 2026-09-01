import { z } from "zod";

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Gunakan format HH:mm");

export const attendancePolicySchema = z.object({
  name: z.string().trim().min(2).max(100),
  workStart: hhmm,
  lateAfter: hhmm,
  workEnd: hhmm,
  overtimeAfter: hhmm,
  timezone: z.literal("Asia/Jakarta").default("Asia/Jakarta"),
  weekendIsOvertime: z.boolean().default(true),
  saturdayWorking: z.boolean().default(false),
  sundayWorking: z.boolean().default(false),
});
