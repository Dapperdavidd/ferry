import { isAddress } from "viem";

const HANDLE = /^@?[a-z0-9_]{3,20}$/i;
const FERRY_HOST = "ferry.money";

export type ParsedRecipient = {
  kind: "address" | "handle";
  value: string;
};

export function ferryPayLink(address: string): string {
  return `https://${FERRY_HOST}/pay?to=${encodeURIComponent(address)}`;
}

/** Accept raw Monad/EVM addresses and Ferry payment links, never transaction requests. */
export function parseRecipient(
  text: string,
  expectedChainId?: number
): ParsedRecipient | null {
  let raw = text.trim();
  if (!raw) return null;

  // EIP-681 address-only QRs are common in EVM wallets. Never execute encoded
  // contract calls or prefilled amounts from a scanned QR.
  if (raw.startsWith("ethereum:")) {
    const match = /^ethereum:(0x[0-9a-fA-F]{40})(?:@(\d+))?$/.exec(raw);
    if (!match || (match[2] && Number(match[2]) !== expectedChainId))
      return null;
    raw = match[1];
  }

  if (/^(https?:|ferry:)/i.test(raw)) {
    try {
      const link = new URL(raw);
      const isFerryWebLink =
        link.protocol === "https:" &&
        (link.hostname === FERRY_HOST || link.hostname === `www.${FERRY_HOST}`);
      const isFerryAppLink =
        link.protocol === "ferry:" && link.hostname === "pay";
      if (
        (!isFerryWebLink && !isFerryAppLink) ||
        (isFerryWebLink && link.pathname !== "/pay") ||
        (isFerryAppLink && link.pathname !== "" && link.pathname !== "/")
      ) {
        return null;
      }
      raw = link.searchParams.get("to") ?? "";
    } catch {
      return null;
    }
  }

  if (isAddress(raw)) return { kind: "address", value: raw };
  if (HANDLE.test(raw)) {
    return { kind: "handle", value: raw.replace(/^@/, "").toLowerCase() };
  }
  return null;
}
