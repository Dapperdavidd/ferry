import { getRandomValues } from "expo-crypto";

// Hermes has no CSPRNG. Mera's passkey calls need crypto.getRandomValues, so
// this module must be imported before anything that imports Mera.
if (typeof globalThis.crypto?.getRandomValues !== "function") {
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    value: { ...globalThis.crypto, getRandomValues },
  });
}
