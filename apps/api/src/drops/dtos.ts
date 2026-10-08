import { z } from "zod";

export const CreateDropSchema = z.object({
  amountRaw: z.string().regex(/^\d+$/),
  memo: z.string().trim().min(1).max(120),
  expiresInHours: z
    .number()
    .int()
    .min(1)
    .max(24 * 30)
    .default(72),
});

export const SubmitDropSchema = z.object({
  intentId: z.string().min(1),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

export const ClaimDropSchema = z.object({
  deadline: z.string().regex(/^\d+$/),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});

export type CreateDrop = z.infer<typeof CreateDropSchema>;
export type SubmitDrop = z.infer<typeof SubmitDropSchema>;
export type ClaimDrop = z.infer<typeof ClaimDropSchema>;
