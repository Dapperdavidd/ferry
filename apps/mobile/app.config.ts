import type { ExpoConfig } from "expo/config";

import base from "./app.base.json";

/**
 * The relying party is the trust root of every account: a passkey made at one
 * domain cannot be reproduced at another. It is fixed in app.base.json and only
 * overridable for a local test of the association files.
 */
export default (): ExpoConfig => {
  const expo = base.expo as unknown as ExpoConfig;
  const rpId = process.env.FERRY_RP_ID ?? "ferry.money";
  return {
    ...expo,
    owner: "samsonnoliens-team",
    plugins: [...(expo.plugins ?? []), "./plugins/with-ios-archive-symbols"],
    ios: { ...expo.ios, associatedDomains: [`webcredentials:${rpId}`] },
    extra: {
      ...expo.extra,
      rpId,
      eas: { projectId: "d2310513-43eb-40bf-a3e1-52b86d516466" },
    },
  };
};
