import { z } from "zod";

export const PrepareTransferSchema = z.object({
  to: z.string().trim().min(1).max(64),
  amountRaw: z.string().regex(/^\d{1,30}$/),
  memo: z.string().trim().max(120).optional(),
});
export type PrepareTransferRequest = z.infer<typeof PrepareTransferSchema>;

export const SubmitSchema = z.object({
  intentId: z.string().min(1).max(64),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
export type SubmitRequest = z.infer<typeof SubmitSchema>;

export const ListQuerySchema = z.object({
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
