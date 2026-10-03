import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { privateKeyToAddress } from "viem/accounts";
import type { Address, Hex } from "viem";

export const PRF_OUTPUT_LENGTH = 32;

/**
 * Mera's rule: the 32-byte PRF output is BIP-39 entropy (24 words, empty
 * passphrase), and the account is the key at m/44'/60'/0'/0/{index}. The same
 * phrase imported into any HD wallet reproduces the same address. Changing any
 * part of this changes every address, so it is pinned by a test.
 */
export const EVM_PATH = (index: number) => `m/44'/60'/0'/0/${index}`;

export function mnemonicFromPrf(prfOutput: Uint8Array): string {
  if (prfOutput.length !== PRF_OUTPUT_LENGTH) {
    throw new Error("PRF output must be 32 bytes");
  }
  return entropyToMnemonic(prfOutput, wordlist);
}

export type DerivedAccount = {
  /** 32 bytes. The caller owns it: zero it with `zero()` when done. */
  privateKey: Uint8Array;
  address: Address;
};

export function deriveAccount(
  prfOutput: Uint8Array,
  index = 0
): DerivedAccount {
  const seed = mnemonicToSeedSync(mnemonicFromPrf(prfOutput));
  try {
    const node = HDKey.fromMasterSeed(seed).derive(EVM_PATH(index));
    if (!node.privateKey)
      throw new Error("BIP-32 derivation produced no private key");
    const privateKey = new Uint8Array(node.privateKey);
    node.wipePrivateData();
    return { privateKey, address: privateKeyToAddress(toHex(privateKey)) };
  } finally {
    seed.fill(0);
  }
}

export function toHex(bytes: Uint8Array): Hex {
  let out = "0x";
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0");
  return out as Hex;
}

export function zero(...buffers: Uint8Array[]) {
  for (const buffer of buffers) buffer.fill(0);
}
