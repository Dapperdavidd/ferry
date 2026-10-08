import { z } from "zod";
import { SubmitSchema } from "../transfers/dtos";

const AmountRaw = z.string().regex(/^\d{1,30}$/);
const Handle = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/);

export const CreatePaymentRequestSchema = z.object({
  amountRaw: AmountRaw,
  memo: z.string().trim().min(1).max(120),
  expiresInHours: z.number().int().min(1).max(168).default(72),
});
export type CreatePaymentRequest = z.infer<typeof CreatePaymentRequestSchema>;

export const SubmitSocialPaymentSchema = SubmitSchema;
export type SubmitSocialPayment = z.infer<typeof SubmitSocialPaymentSchema>;

export const CreateRecurringBillSchema = z.object({
  title: z.string().trim().min(1).max(80),
  note: z.string().trim().max(160).optional(),
  totalRaw: AmountRaw,
  creatorAmountRaw: AmountRaw,
  category: z.enum([
    "food",
    "transport",
    "home",
    "travel",
    "shopping",
    "other",
  ]),
  splitMode: z.enum(["even", "custom"]),
  dueLabel: z.string().trim().max(40).optional(),
  groupId: z.string().min(1).max(64),
  cadence: z.enum(["weekly", "monthly"]),
  nextRunAt: z.string().datetime(),
  shares: z
    .array(z.object({ handle: Handle, amountRaw: AmountRaw }))
    .min(1)
    .max(49),
});
export type CreateRecurringBill = z.infer<typeof CreateRecurringBillSchema>;

export const SetRecurringStateSchema = z.object({ active: z.boolean() });
export type SetRecurringState = z.infer<typeof SetRecurringStateSchema>;

export const CreateTableSchema = z.object({
  title: z.string().trim().min(1).max(80),
  tipBasisPoints: z.number().int().min(0).max(5_000).default(0),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        priceRaw: AmountRaw,
        quantity: z.number().int().min(1).max(50).default(1),
      }),
    )
    .min(1)
    .max(100),
});
export type CreateTable = z.infer<typeof CreateTableSchema>;

export const ClaimTableItemSchema = z.object({
  quantity: z.number().int().min(0).max(50),
});
export type ClaimTableItem = z.infer<typeof ClaimTableItemSchema>;
