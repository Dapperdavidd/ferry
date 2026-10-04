import { z } from "zod";

export const PayoutNetworksQuerySchema = z.object({
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/),
});

export const SavePayoutAccountSchema = z.object({
  networkId: z.string().trim().min(1).max(120),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{6,24}$/),
});
