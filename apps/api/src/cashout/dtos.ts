import { z } from "zod";

export const QuoteSchema = z.object({
  amountRaw: z.string().regex(/^\d{1,30}$/),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
});
export type QuoteRequest = z.infer<typeof QuoteSchema>;

export const PrepareCashoutSchema = z.object({
  quoteId: z.string().min(1).max(2000),
});
