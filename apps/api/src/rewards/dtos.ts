import { z } from "zod";

export const ApplyReferralSchema = z.object({
  code: z
    .string()
    .trim()
    .min(6)
    .max(16)
    .transform((value) => value.toUpperCase()),
});

export type ApplyReferralRequest = z.infer<typeof ApplyReferralSchema>;
