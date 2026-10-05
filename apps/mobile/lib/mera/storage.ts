import * as SecureStore from "expo-secure-store";
import type { Address } from "viem";

const KEY = "ferry.account.v1";

/** What the locked state needs to render. Holds no secret. */
export type StoredAccount = {
  address: Address;
  credentialId: string;
  handle?: string;
  /** A passkey exists locally, but its Ferry account may not exist server-side yet. */
  registrationPending?: boolean;
};

const OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export async function loadAccount(): Promise<StoredAccount | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw === null) return null;
  const parsed = parse(raw);
  if (!parsed) await SecureStore.deleteItemAsync(KEY);
  return parsed;
}

export async function saveAccount(account: StoredAccount) {
  await SecureStore.setItemAsync(KEY, JSON.stringify(account), OPTIONS);
}

export async function clearAccount() {
  await SecureStore.deleteItemAsync(KEY);
}

function parse(raw: string): StoredAccount | null {
  try {
    const value = JSON.parse(raw) as Partial<StoredAccount>;
    if (
      typeof value.address !== "string" ||
      !/^0x[0-9a-fA-F]{40}$/.test(value.address) ||
      typeof value.credentialId !== "string" ||
      !/^[A-Za-z0-9_-]{1,2048}$/.test(value.credentialId)
    ) {
      return null;
    }
    const handle = typeof value.handle === "string" ? value.handle : undefined;
    const registrationPending = value.registrationPending === true;
    return {
      address: value.address as Address,
      credentialId: value.credentialId,
      handle,
      registrationPending,
    };
  } catch {
    return null;
  }
}
