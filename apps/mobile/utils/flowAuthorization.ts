import type { FlowDestination, TypedData } from "@/utils/apiClient";
import { checkAuthorization } from "@/utils/authorization";

const MAX_AUTHORIZATION_LIFETIME_MS = 6 * 60_000;
const EXPIRY_MATCH_TOLERANCE_MS = 1_500;
const VALID_AFTER_LOOKBACK_MS = 60_000;
const FLOW_DOMAIN_KEYS = [
  "name",
  "version",
  "chainId",
  "verifyingContract",
] as const;
const CONFIGURE_FIELDS = [
  { name: "owner", type: "address" },
  { name: "destinations", type: "address[]" },
  { name: "basisPoints", type: "uint256[]" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;
const DISABLE_FIELDS = [
  { name: "owner", type: "address" },
  { name: "nonce", type: "uint256" },
  { name: "deadline", type: "uint256" },
] as const;
const PAYMENT_FIELDS = [
  { name: "from", type: "address" },
  { name: "to", type: "address" },
  { name: "value", type: "uint256" },
  { name: "validAfter", type: "uint256" },
  { name: "validBefore", type: "uint256" },
  { name: "nonce", type: "bytes32" },
] as const;

const lower = (value: unknown) =>
  typeof value === "string" ? value.toLowerCase() : "";

function hasExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[]
) {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    [...expected].sort().every((key, index) => actual[index] === key)
  );
}

function hasExactType(
  typedData: TypedData,
  primaryType: string,
  expected: readonly { name: string; type: string }[]
) {
  const typeNames = Object.keys(typedData.types);
  if (typeNames.length !== 1 || typeNames[0] !== primaryType) return false;
  const fields = typedData.types[primaryType];
  return (
    Array.isArray(fields) &&
    fields.length === expected.length &&
    expected.every(
      (field, index) =>
        fields[index]?.name === field.name && fields[index]?.type === field.type
    )
  );
}

function unsignedInteger(value: unknown): bigint | null {
  const normalized = String(value ?? "");
  if (!/^\d+$/.test(normalized)) return null;
  try {
    return BigInt(normalized);
  } catch {
    return null;
  }
}

function checkShortExpiry(
  value: unknown,
  expiresAt: string,
  nowMs: number
): string | null {
  const seconds = unsignedInteger(value);
  const responseExpiryMs = Date.parse(expiresAt);
  if (seconds === null || !Number.isFinite(responseExpiryMs)) return "expiry";
  const signedExpiryMs = Number(seconds * 1_000n);
  if (!Number.isSafeInteger(signedExpiryMs)) return "expiry";
  if (Math.abs(signedExpiryMs - responseExpiryMs) > EXPIRY_MATCH_TOLERANCE_MS)
    return "expiry";
  if (signedExpiryMs <= nowMs || responseExpiryMs <= nowMs) return "expired";
  if (responseExpiryMs - nowMs > MAX_AUTHORIZATION_LIFETIME_MS)
    return "authorization window";
  return null;
}

export function checkFlowConfiguration(
  typedData: TypedData,
  expected: {
    owner: string;
    destinations: FlowDestination[];
    chainId: number;
    verifyingContract: string;
    expiresAt: string;
    nowMs?: number;
  }
): string | null {
  if (typedData.primaryType !== "ConfigureFlow") return "action";
  if (!hasExactType(typedData, "ConfigureFlow", CONFIGURE_FIELDS))
    return "type";
  if (!hasExactKeys(typedData.domain, FLOW_DOMAIN_KEYS)) return "domain";
  if (
    !hasExactKeys(typedData.message, [
      "owner",
      "destinations",
      "basisPoints",
      "nonce",
      "deadline",
    ])
  )
    return "message";
  if (typedData.domain.name !== "FerryFlow") return "domain";
  if (String(typedData.domain.version) !== "1") return "version";
  if (Number(typedData.domain.chainId) !== expected.chainId) return "network";
  if (
    lower(typedData.domain.verifyingContract) !==
    expected.verifyingContract.toLowerCase()
  )
    return "contract";
  if (lower(typedData.message.owner) !== expected.owner.toLowerCase())
    return "owner";
  if (unsignedInteger(typedData.message.nonce) === null) return "nonce";
  const expiryMismatch = checkShortExpiry(
    typedData.message.deadline,
    expected.expiresAt,
    expected.nowMs ?? Date.now()
  );
  if (expiryMismatch) return expiryMismatch;

  const addresses = typedData.message.destinations;
  const basisPoints = typedData.message.basisPoints;
  if (!Array.isArray(addresses) || !Array.isArray(basisPoints))
    return "allocation";
  if (
    addresses.length !== expected.destinations.length ||
    basisPoints.length !== expected.destinations.length
  )
    return "allocation";

  for (let index = 0; index < expected.destinations.length; index += 1) {
    if (
      lower(addresses[index]) !==
      expected.destinations[index].address.toLowerCase()
    )
      return "destination";
    if (
      String(basisPoints[index]) !==
      String(expected.destinations[index].basisPoints)
    )
      return "percentage";
  }
  return null;
}

export function checkFlowDisable(
  typedData: TypedData,
  expected: {
    owner: string;
    chainId: number;
    verifyingContract: string;
    expiresAt: string;
    nowMs?: number;
  }
): string | null {
  if (typedData.primaryType !== "DisableFlow") return "action";
  if (!hasExactType(typedData, "DisableFlow", DISABLE_FIELDS)) return "type";
  if (!hasExactKeys(typedData.domain, FLOW_DOMAIN_KEYS)) return "domain";
  if (!hasExactKeys(typedData.message, ["owner", "nonce", "deadline"]))
    return "message";
  if (typedData.domain.name !== "FerryFlow") return "domain";
  if (String(typedData.domain.version) !== "1") return "version";
  if (Number(typedData.domain.chainId) !== expected.chainId) return "network";
  if (
    lower(typedData.domain.verifyingContract) !==
    expected.verifyingContract.toLowerCase()
  )
    return "contract";
  if (lower(typedData.message.owner) !== expected.owner.toLowerCase())
    return "owner";
  if (unsignedInteger(typedData.message.nonce) === null) return "nonce";
  const expiryMismatch = checkShortExpiry(
    typedData.message.deadline,
    expected.expiresAt,
    expected.nowMs ?? Date.now()
  );
  if (expiryMismatch) return expiryMismatch;
  return null;
}

export function checkFlowPaymentAuthorization(
  typedData: TypedData,
  expected: {
    from: string;
    flowContract: string;
    recipientOwner: string;
    amountRaw: string;
    token: string;
    chainId: number;
    expiresAt: string;
    nowMs?: number;
  }
): string | null {
  if (!hasExactType(typedData, "ReceiveWithAuthorization", PAYMENT_FIELDS))
    return "wrong message declaration";
  if (!hasExactKeys(typedData.domain, FLOW_DOMAIN_KEYS))
    return "wrong token domain";
  if (
    !hasExactKeys(typedData.message, [
      "from",
      "to",
      "value",
      "validAfter",
      "validBefore",
      "nonce",
    ])
  )
    return "wrong payment message";
  const authorizationMismatch = checkAuthorization(typedData, {
    from: expected.from,
    to: expected.flowContract,
    amountRaw: expected.amountRaw,
    token: expected.token,
    chainId: expected.chainId,
    primaryType: "ReceiveWithAuthorization",
  });
  if (authorizationMismatch) return authorizationMismatch;
  if (typedData.domain.name !== "Agora Dollar") return "wrong token domain";
  if (String(typedData.domain.version) !== "1") return "wrong token version";

  const nowMs = expected.nowMs ?? Date.now();
  const expiryMismatch = checkShortExpiry(
    typedData.message.validBefore,
    expected.expiresAt,
    nowMs
  );
  if (expiryMismatch) return expiryMismatch;
  const validAfter = unsignedInteger(typedData.message.validAfter);
  if (validAfter === null) return "invalid authorization window";
  const validAfterMs = Number(validAfter * 1_000n);
  if (!Number.isSafeInteger(validAfterMs))
    return "invalid authorization window";
  if (
    validAfter !== 0n &&
    (validAfterMs > nowMs || nowMs - validAfterMs > VALID_AFTER_LOOKBACK_MS)
  )
    return "invalid authorization window";
  const validBefore = unsignedInteger(typedData.message.validBefore);
  if (validBefore === null || validAfter >= validBefore)
    return "invalid authorization window";
  if (
    validAfter !== 0n &&
    Number((validBefore - validAfter) * 1_000n) > MAX_AUTHORIZATION_LIFETIME_MS
  )
    return "authorization window";

  const nonce = String(typedData.message.nonce ?? "").toLowerCase();
  const recipient = expected.recipientOwner.replace(/^0x/, "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(nonce)) return "wrong recipient binding";
  if (nonce.slice(2, 42) !== recipient) return "wrong recipient binding";
  return null;
}
