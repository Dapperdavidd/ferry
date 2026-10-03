import "./polyfills";
import {
  createPasskeyWithPrfOutput,
  getPasskeyPrfOutput,
  isMeraError,
  type PasskeyCredentialMetadata,
} from "@category-labs/mera";
import { reactNativeWebAuthnClient } from "@category-labs/mera/react-native-webauthn-client";

import { RP_ID, RP_NAME } from "./config";

export type PasskeyResult = {
  credentialId: string;
  /** 32 bytes. Derive from it, then zero it. */
  prfOutput: Uint8Array;
};

export class PasskeyFailure extends Error {
  constructor(
    readonly kind: "cancelled" | "unsupported" | "association" | "failed",
    message: string
  ) {
    super(message);
  }
}

/** One Face ID prompt; two if the provider only evaluates PRF on assertion. */
export async function createPasskey(label: string): Promise<PasskeyResult> {
  try {
    const created = await createPasskeyWithPrfOutput({
      rp: { id: RP_ID, name: RP_NAME },
      user: { name: label, displayName: label },
      webAuthnClient: reactNativeWebAuthnClient,
    });
    return { credentialId: created.credentialId, prfOutput: created.prfOutput };
  } catch (error) {
    throw describe(error);
  }
}

/** Pins the stored passkey when known, so the chooser is skipped. */
export async function signInWithPasskey(
  credential?: PasskeyCredentialMetadata
): Promise<PasskeyResult> {
  try {
    const asserted = await getPasskeyPrfOutput({
      rpId: RP_ID,
      credential,
      webAuthnClient: reactNativeWebAuthnClient,
    });
    return {
      credentialId: asserted.credentialId,
      prfOutput: asserted.prfOutput,
    };
  } catch (error) {
    throw describe(error);
  }
}

function describe(error: unknown): PasskeyFailure {
  if (isMeraError(error)) {
    if (error.code === "PRF_UNAVAILABLE") {
      return new PasskeyFailure(
        "unsupported",
        "This phone's passkeys can't derive an account. Ferry needs iOS 18.4 or Android 9 with Google Password Manager."
      );
    }
    if (error.code === "CRYPTO_UNAVAILABLE") {
      return new PasskeyFailure(
        "failed",
        "Secure randomness isn't available on this device."
      );
    }
    const cause = String(
      (error.cause as { message?: string } | undefined)?.message ??
        error.message
    );
    if (/cancel|abort/i.test(cause)) {
      return new PasskeyFailure("cancelled", "Face ID was cancelled.");
    }
    // react-native-passkey reports a missing or stale association file as 1004.
    if (/1004|webcredentials|association/i.test(cause)) {
      return new PasskeyFailure(
        "association",
        "Ferry couldn't verify its passkey domain. Check your connection and try again."
      );
    }
    return new PasskeyFailure(
      "failed",
      "The passkey step didn't finish. Try again."
    );
  }
  return new PasskeyFailure(
    "failed",
    "The passkey step didn't finish. Try again."
  );
}
