import type { StoredAccount } from "@/lib/mera";

export type PasskeyEntryAction = "create" | "resume" | "signIn" | "choose";

/**
 * The primary action always prefers recovery. After reinstall, SecureStore may
 * be empty while the platform passkey still exists in iCloud or Google
 * Password Manager; treating that state as account creation would produce a
 * second wallet and send a returning user through onboarding again.
 */
export function primaryPasskeyAction(
  account: StoredAccount | null
): PasskeyEntryAction {
  return account?.registrationPending ? "resume" : "signIn";
}

export function secondaryPasskeyAction(
  account: StoredAccount | null
): PasskeyEntryAction {
  return account ? "choose" : "create";
}
