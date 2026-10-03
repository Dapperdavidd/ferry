import type { ExpoConfig } from "expo/config";

import base from "./app.json";

/**
 * The relying party is the trust root of every account: a passkey made at one
 * domain cannot be reproduced at another. It is fixed in app.json and only
 * overridable for a local test of the association files.
 */
export default (): ExpoConfig => {
  const expo = base.expo as unknown as ExpoConfig;
  const rpId = process.env.FERRY_RP_ID ?? "ferry.money";
  // A development-signed build fetches the association file from the domain itself instead of
  // Apple's CDN, which can lag hours. Store builds ignore the flag. The phone must have
  // Settings > Developer > Associated Domains Development on.
  const production = process.env.EAS_BUILD_PROFILE === "production";
  const domain = production
    ? `webcredentials:${rpId}`
    : `webcredentials:${rpId}?mode=developer`;
  return {
    ...expo,
    ios: { ...expo.ios, associatedDomains: [domain] },
    extra: { ...expo.extra, rpId },
  };
};
