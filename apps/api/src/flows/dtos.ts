import { isAddress } from "viem";
import { z } from "zod";

export const FlowDestinationSchema = z.object({
  label: z.string().trim().min(1).max(40),
  kind: z.enum(["spendable", "pocket", "person", "bank"]),
  address: z.string().refine(isAddress, "Invalid destination address."),
  basisPoints: z.number().int().min(1).max(10_000),
});

const EnabledFlowSchema = z
  .object({
    enabled: z.literal(true).optional(),
    destinations: z.array(FlowDestinationSchema).min(1).max(5),
  })
  .superRefine(({ destinations }, ctx) => {
    const total = destinations.reduce(
      (sum, destination) => sum + destination.basisPoints,
      0,
    );
    if (total !== 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinations"],
        message: "Flow allocations must total 100%.",
      });
    }
    const addresses = destinations.map((destination) =>
      destination.address.toLowerCase(),
    );
    if (new Set(addresses).size !== addresses.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["destinations"],
        message: "Each Flow destination must be unique.",
      });
    }
  });

const DisabledFlowSchema = z.object({
  enabled: z.literal(false),
  destinations: z.array(FlowDestinationSchema).max(0),
});

export const PrepareFlowSchema = z.union([
  EnabledFlowSchema,
  DisabledFlowSchema,
]);
export type PrepareFlowRequest = z.infer<typeof PrepareFlowSchema>;

export const PrepareFlowPaymentSchema = z.object({
  to: z.string().trim().min(1).max(64),
  amount: z
    .string()
    .trim()
    .regex(
      /^(?:0|[1-9]\d{0,11})(?:\.\d{1,6})?$/,
      "Use a positive dollar amount with up to 6 decimal places.",
    ),
});
export type PrepareFlowPaymentRequest = z.infer<
  typeof PrepareFlowPaymentSchema
>;

export const SubmitFlowSchema = z.object({
  intentId: z.string().min(1).max(64),
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
});
export type SubmitFlowRequest = z.infer<typeof SubmitFlowSchema>;
