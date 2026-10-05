import * as SecureStore from "expo-secure-store";

import { AUTH_STORAGE_KEYS } from "@/utils/auth";
import type { User } from "@/utils/apiClient";
import { getActiveNetwork, type FerryNetwork } from "@/utils/network";

const cachedTokens: Partial<Record<FerryNetwork, string | null>> = {};
let legacyMigration: Promise<void> | null = null;

const tokenKey = (network: FerryNetwork) =>
  `${AUTH_STORAGE_KEYS.TOKEN}.${network}`;
const userKey = (network: FerryNetwork) =>
  `${AUTH_STORAGE_KEYS.USER}.${network}`;

async function migrateLegacyTestnetSession() {
  legacyMigration ??= (async () => {
    const current = await SecureStore.getItemAsync(tokenKey("testnet"));
    if (!current) {
      const legacyToken = await SecureStore.getItemAsync(
        AUTH_STORAGE_KEYS.TOKEN
      );
      const legacyUser = await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.USER);
      if (legacyToken)
        await SecureStore.setItemAsync(tokenKey("testnet"), legacyToken);
      if (legacyUser)
        await SecureStore.setItemAsync(userKey("testnet"), legacyUser);
    }
    await Promise.all([
      SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.TOKEN),
      SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.USER),
    ]);
  })();
  await legacyMigration;
}

export const AuthStorage = {
  async saveToken(token: string, network = getActiveNetwork()) {
    await SecureStore.setItemAsync(tokenKey(network), token);
    cachedTokens[network] = token;
  },

  async getToken(network = getActiveNetwork()) {
    if (network === "testnet") await migrateLegacyTestnetSession();
    if (network in cachedTokens) return cachedTokens[network] ?? null;
    const token = await SecureStore.getItemAsync(tokenKey(network));
    cachedTokens[network] = token;
    return token;
  },

  async saveUserData(user: User, network = getActiveNetwork()) {
    await SecureStore.setItemAsync(userKey(network), JSON.stringify(user));
  },

  async getUser(network = getActiveNetwork()): Promise<User | null> {
    if (network === "testnet") await migrateLegacyTestnetSession();
    const raw = await SecureStore.getItemAsync(userKey(network));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  async clearAuthData(network = getActiveNetwork()) {
    cachedTokens[network] = null;
    await Promise.all([
      SecureStore.deleteItemAsync(userKey(network)),
      SecureStore.deleteItemAsync(tokenKey(network)),
    ]);
  },
};
