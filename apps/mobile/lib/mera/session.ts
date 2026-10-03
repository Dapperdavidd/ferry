import "./polyfills";
import { createSecp256k1SigningSession } from "@category-labs/mera";
import { toViemAccount } from "@category-labs/mera/viem";
import type { LocalAccount } from "viem";

import { deriveAccount, zero } from "./derive";

/**
 * Runs `work` with a signing account derived from one PRF output, then ends
 * the session and zeroes every secret, whatever happened. The key never
 * outlives the action; the next action asks for Face ID again.
 */
export async function withSigner<T>(
  prfOutput: Uint8Array,
  work: (account: LocalAccount) => Promise<T>
): Promise<T> {
  const derived = deriveAccount(prfOutput);
  const session = createSecp256k1SigningSession({
    privateKey: derived.privateKey,
  });
  try {
    return await work(toViemAccount(session));
  } finally {
    session.end();
    zero(derived.privateKey, prfOutput);
  }
}
