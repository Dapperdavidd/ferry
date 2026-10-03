import { z } from "zod";

export const HANDLE = /^[a-z0-9_]{3,20}$/;

export const RESERVED_HANDLES = new Set([
  "ferry",
  "admin",
  "support",
  "help",
  "root",
  "api",
  "www",
  "pay",
  "send",
  "cashout",
  "agora",
  "ausd",
  "monad",
  "mera",
  "team",
  "official",
  "null",
  "undefined",
  "me",
  "system",
  "security",
]);

export const CURRENCIES = [
  "USD",
  "NGN",
  "GBP",
  "EUR",
  "KES",
  "GHS",
  "PHP",
  "MXN",
  "INR",
  "ZAR",
  "BRL",
] as const;

export const UpdateMeSchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .regex(HANDLE, "Letters, numbers and underscores, 3 to 20 characters.")
    .optional(),
  displayName: z.string().trim().min(1).max(40).optional(),
  homeCurrency: z.enum(CURRENCIES).optional(),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/)
    .optional(),
});
export type UpdateMeRequest = z.infer<typeof UpdateMeSchema>;

export const HandleQuerySchema = z.object({
  handle: z
    .string()
    .trim()
    .toLowerCase()
    .transform((h) => h.replace(/^@/, "")),
});
