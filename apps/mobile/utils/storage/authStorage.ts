import * as SecureStore from "expo-secure-store";

import { AUTH_STORAGE_KEYS } from "@/utils/auth";
import type { User } from "@/utils/apiClient";

let cachedToken: string | null | undefined;

export const AuthStorage = {
  async saveToken(token: string) {
    await SecureStore.setItemAsync(AUTH_STORAGE_KEYS.TOKEN, token);
    cachedToken = token;
  },

  async getToken() {
    if (cachedToken !== undefined) return cachedToken;
    cachedToken = await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.TOKEN);
    return cachedToken;
  },

  async saveUserData(user: User) {
    await SecureStore.setItemAsync(
      AUTH_STORAGE_KEYS.USER,
      JSON.stringify(user)
    );
  },

  async getUser(): Promise<User | null> {
    const raw = await SecureStore.getItemAsync(AUTH_STORAGE_KEYS.USER);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  },

  async clearAuthData() {
    cachedToken = null;
    await Promise.all([
      SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.USER),
      SecureStore.deleteItemAsync(AUTH_STORAGE_KEYS.TOKEN),
    ]);
  },
};
