import { getAddress, verifyMessage, type Address } from "viem";

export const CHALLENGE_TTL_MS = 5 * 60_000;

/** The exact text the app signs with EIP-191. A reader can see what they are signing. */
export function buildChallengeMessage(params: {
  address: Address;
  nonce: string;
  issuedAt: Date;
  expiresAt: Date;
}): string {
  return [
    "Sign in to Ferry",
    "",
    `Address: ${getAddress(params.address)}`,
    `Nonce: ${params.nonce}`,
    `Issued: ${params.issuedAt.toISOString()}`,
    `Expires: ${params.expiresAt.toISOString()}`,
  ].join("\n");
}

export async function signatureMatches(params: {
  address: Address;
  message: string;
  signature: `0x${string}`;
}): Promise<boolean> {
  try {
    return await verifyMessage({
      address: params.address,
      message: params.message,
      signature: params.signature,
    });
  } catch {
    return false;
  }
}
