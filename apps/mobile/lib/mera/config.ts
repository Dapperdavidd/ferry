import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as { rpId?: string };

/** The passkey relying party. Changing it orphans every account. */
export const RP_ID = extra.rpId ?? "ferry.money";
export const RP_NAME = "Ferry";
