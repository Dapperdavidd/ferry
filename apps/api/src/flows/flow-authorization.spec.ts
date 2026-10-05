import { getAddress } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  CONFIGURE_FLOW_TYPES,
  DISABLE_FLOW_TYPES,
  configurationFrom,
  configurationSignedBy,
  configurationTypedDataFor,
  type FlowDomain,
} from "./flow-authorization";

const owner = privateKeyToAccount(generatePrivateKey());
const other = privateKeyToAccount(generatePrivateKey());
const domain: FlowDomain = {
  name: "FerryFlow",
  version: "1",
  chainId: 10143,
  verifyingContract: "0x8ba1f109551bD432803012645Ac136ddd64DBA72",
};
const authorization = {
  kind: "configure" as const,
  owner: getAddress(owner.address),
  destinations: [getAddress(owner.address), getAddress(other.address)],
  basisPoints: [7_000n, 3_000n],
  nonce: 2n,
  deadline: 1_800_000_000n,
};

describe("Flow configuration authorizations", () => {
  it("serialises array values without changing their signed order", () => {
    const typedData = configurationTypedDataFor(domain, authorization);

    expect(
      "basisPoints" in typedData.message
        ? typedData.message.basisPoints
        : undefined,
    ).toEqual(["7000", "3000"]);
    expect(configurationFrom(typedData)).toEqual(authorization);
  });

  it("verifies the standard EIP-712 signature", async () => {
    const typedData = configurationTypedDataFor(domain, authorization);
    const signature = await owner.signTypedData({
      domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: authorization.owner,
        destinations: authorization.destinations,
        basisPoints: authorization.basisPoints,
        nonce: authorization.nonce,
        deadline: authorization.deadline,
      },
    });

    expect(
      await configurationSignedBy(typedData, signature, owner.address),
    ).toBe(true);
    expect(
      await configurationSignedBy(typedData, signature, other.address),
    ).toBe(false);
  });

  it("binds destination order because the last address receives dust", async () => {
    const signature = await owner.signTypedData({
      domain,
      types: CONFIGURE_FLOW_TYPES,
      primaryType: "ConfigureFlow",
      message: {
        owner: authorization.owner,
        destinations: authorization.destinations,
        basisPoints: authorization.basisPoints,
        nonce: authorization.nonce,
        deadline: authorization.deadline,
      },
    });
    const reordered = configurationTypedDataFor(domain, {
      ...authorization,
      destinations: [...authorization.destinations].reverse(),
      basisPoints: [...authorization.basisPoints].reverse(),
    });

    expect(
      await configurationSignedBy(reordered, signature, owner.address),
    ).toBe(false);
  });

  it("supports the separately typed disable authorization", async () => {
    const authorization = {
      kind: "disable" as const,
      owner: getAddress(owner.address),
      nonce: 3n,
      deadline: 1_800_000_000n,
    };
    const typedData = configurationTypedDataFor(domain, authorization);
    const signature = await owner.signTypedData({
      domain,
      types: DISABLE_FLOW_TYPES,
      primaryType: "DisableFlow",
      message: {
        owner: getAddress(owner.address),
        nonce: 3n,
        deadline: 1_800_000_000n,
      },
    });

    expect(typedData.primaryType).toBe("DisableFlow");
    expect(
      await configurationSignedBy(typedData, signature, owner.address),
    ).toBe(true);
  });
});
