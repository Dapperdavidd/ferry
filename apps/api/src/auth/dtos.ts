import { z } from "zod";

export const address = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/, "A Monad address is required.");

export const ChallengeQuerySchema = z.object({ address });
export const VerifySchema = z.object({
  address,
  signature: z
    .string()
    .regex(/^0x[0-9a-fA-F]{130}$/, "A signature is required."),
  intent: z.enum(["create", "signIn", "connect"]).default("create"),
});
export type VerifyRequest = z.infer<typeof VerifySchema>;
