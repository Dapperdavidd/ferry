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

export const DirectQuoteSchema = z.object({
  to: z
    .string()
    .trim()
    .toLowerCase()
    .transform((handle) => handle.replace(/^@/, ""))
    .pipe(z.string().regex(/^[a-z0-9_]{3,20}$/)),
  amountRaw: z.string().regex(/^\d{1,30}$/),
});
export type DirectQuoteRequest = z.infer<typeof DirectQuoteSchema>;

export const PrepareCashoutSchema = z.object({
  quoteId: z.string().min(1).max(2000),
});
