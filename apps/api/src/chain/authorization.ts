import { getAddress, verifyTypedData, type Address, type Hex } from "viem";

/** EIP-712 domain of AUSD, read from the contract at boot. */
export interface TokenDomain {
  name: string;
  version: string;
  chainId: number;
  verifyingContract: Address;
}

export const TRANSFER_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

export const RECEIVE_TYPES = {
  ReceiveWithAuthorization: TRANSFER_TYPES.TransferWithAuthorization,
} as const;

export type Authorization = {
  from: Address;
  to: Address;
  value: bigint;
  validAfter: bigint;
  validBefore: bigint;
  nonce: Hex;
};

/** The JSON the app receives. Numbers travel as decimal strings; the app turns them back into bigints. */
export interface TypedDataJson {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: Record<
    string,
    readonly { readonly name: string; readonly type: string }[]
  >;
  primaryType: "TransferWithAuthorization" | "ReceiveWithAuthorization";
  message: {
    from: Address;
    to: Address;
    value: string;
    validAfter: string;
    validBefore: string;
    nonce: Hex;
  };
}

export function typedDataFor(
  domain: TokenDomain,
  kind: "transfer" | "receive",
  auth: Authorization,
): TypedDataJson {
  const primaryType =
    kind === "transfer"
      ? "TransferWithAuthorization"
      : "ReceiveWithAuthorization";
  return {
    domain,
    types: kind === "transfer" ? TRANSFER_TYPES : RECEIVE_TYPES,
    primaryType,
    message: {
      from: getAddress(auth.from),
      to: getAddress(auth.to),
      value: auth.value.toString(),
      validAfter: auth.validAfter.toString(),
      validBefore: auth.validBefore.toString(),
      nonce: auth.nonce,
    },
  };
}

export function authorizationFrom(typedData: TypedDataJson): Authorization {
  const m = typedData.message;
  return {
    from: getAddress(m.from),
    to: getAddress(m.to),
    value: BigInt(m.value),
    validAfter: BigInt(m.validAfter),
    validBefore: BigInt(m.validBefore),
    nonce: m.nonce,
  };
}

export async function authorizationSignedBy(
  typedData: TypedDataJson,
  signature: Hex,
  signer: Address,
): Promise<boolean> {
  const auth = authorizationFrom(typedData);
  try {
    return await verifyTypedData({
      address: signer,
      domain: typedData.domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: auth,
      signature,
    });
  } catch {
    return false;
  }
}
