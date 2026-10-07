import { z } from "zod";
import { SubmitSchema } from "../transfers/dtos";

const HandleSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/);
const AmountRawSchema = z.string().regex(/^\d{1,30}$/);

export const CreateBillSchema = z.object({
  title: z.string().trim().min(1).max(80),
  note: z.string().trim().max(160).optional(),
  totalRaw: AmountRawSchema,
  creatorAmountRaw: AmountRawSchema,
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
  groupId: z.string().min(1).max(64).optional(),
  shares: z
    .array(z.object({ handle: HandleSchema, amountRaw: AmountRawSchema }))
    .min(1)
    .max(49),
});
export type CreateBillRequest = z.infer<typeof CreateBillSchema>;

export const ListBillsSchema = z.object({
  status: z.enum(["all", "open", "settled"]).default("all"),
});

export const RespondInvitationSchema = z.object({ accepted: z.boolean() });
export type RespondInvitationRequest = z.infer<typeof RespondInvitationSchema>;

export const SubmitBillPaymentSchema = SubmitSchema;
export type SubmitBillPaymentRequest = z.infer<typeof SubmitBillPaymentSchema>;

export const CreateBillGroupSchema = z.object({
  name: z.string().trim().min(1).max(60),
  handles: z.array(HandleSchema).max(49).default([]),
});
export type CreateBillGroupRequest = z.infer<typeof CreateBillGroupSchema>;

export const AddBillGroupMemberSchema = z.object({ handle: HandleSchema });
export type AddBillGroupMemberRequest = z.infer<
  typeof AddBillGroupMemberSchema
>;
