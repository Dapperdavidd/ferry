import { getAddress, verifyTypedData, type Address, type Hex } from "viem";

export interface FlowDomain {
  name: "FerryFlow";
  version: "1";
  chainId: number;
  verifyingContract: Address;
}

export const CONFIGURE_FLOW_TYPES = {
  ConfigureFlow: [
    { name: "owner", type: "address" },
    { name: "destinations", type: "address[]" },
    { name: "basisPoints", type: "uint256[]" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;
export const DISABLE_FLOW_TYPES = {
  DisableFlow: [
    { name: "owner", type: "address" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

export interface ConfigureFlowAuthorization {
  kind: "configure";
  owner: Address;
  destinations: Address[];
  basisPoints: bigint[];
  nonce: bigint;
  deadline: bigint;
}

export interface DisableFlowAuthorization {
  kind: "disable";
  owner: Address;
  nonce: bigint;
  deadline: bigint;
}

export type FlowConfigurationAuthorization =
  | ConfigureFlowAuthorization
  | DisableFlowAuthorization;

/** JSON-safe EIP-712 payload returned to the app. */
export interface FlowConfigurationTypedDataJson {
  domain: FlowDomain;
  types: typeof CONFIGURE_FLOW_TYPES | typeof DISABLE_FLOW_TYPES;
  primaryType: "ConfigureFlow" | "DisableFlow";
  message:
    | {
        owner: Address;
        destinations: Address[];
        basisPoints: string[];
        nonce: string;
        deadline: string;
      }
    | {
        owner: Address;
        nonce: string;
        deadline: string;
      };
}

export function configurationTypedDataFor(
  domain: FlowDomain,
  authorization: FlowConfigurationAuthorization,
): FlowConfigurationTypedDataJson {
  if (authorization.kind === "disable") {
    return {
      domain,
      types: DISABLE_FLOW_TYPES,
      primaryType: "DisableFlow",
      message: {
        owner: getAddress(authorization.owner),
        nonce: authorization.nonce.toString(),
        deadline: authorization.deadline.toString(),
      },
    };
  }
  return {
    domain,
    types: CONFIGURE_FLOW_TYPES,
    primaryType: "ConfigureFlow",
    message: {
      owner: getAddress(authorization.owner),
      destinations: authorization.destinations.map((address) =>
        getAddress(address),
      ),
      basisPoints: authorization.basisPoints.map(String),
      nonce: authorization.nonce.toString(),
      deadline: authorization.deadline.toString(),
    },
  };
}

export function configurationFrom(
  typedData: FlowConfigurationTypedDataJson,
): FlowConfigurationAuthorization {
  if (typedData.primaryType === "DisableFlow") {
    return {
      kind: "disable",
      owner: getAddress(typedData.message.owner),
      nonce: BigInt(typedData.message.nonce),
      deadline: BigInt(typedData.message.deadline),
    };
  }
  if (!("destinations" in typedData.message)) {
    throw new Error("ConfigureFlow is missing destinations");
  }
  return {
    kind: "configure",
    owner: getAddress(typedData.message.owner),
    destinations: typedData.message.destinations.map((address) =>
      getAddress(address),
    ),
    basisPoints: typedData.message.basisPoints.map(BigInt),
    nonce: BigInt(typedData.message.nonce),
    deadline: BigInt(typedData.message.deadline),
  };
}

export async function configurationSignedBy(
  typedData: FlowConfigurationTypedDataJson,
  signature: Hex,
  signer: Address,
): Promise<boolean> {
  try {
    const authorization = configurationFrom(typedData);
    if (authorization.kind === "configure") {
      return await verifyTypedData({
        address: getAddress(signer),
        domain: typedData.domain,
        types: CONFIGURE_FLOW_TYPES,
        primaryType: "ConfigureFlow",
        message: {
          owner: authorization.owner,
          destinations: authorization.destinations,
          basisPoints: authorization.basisPoints,
          nonce: authorization.nonce,
          deadline: authorization.deadline,
        },
        signature,
      });
    }
    return await verifyTypedData({
      address: getAddress(signer),
      domain: typedData.domain,
      types: DISABLE_FLOW_TYPES,
      primaryType: "DisableFlow",
      message: {
        owner: authorization.owner,
        nonce: authorization.nonce,
        deadline: authorization.deadline,
      },
      signature,
    });
  } catch {
    return false;
  }
}
