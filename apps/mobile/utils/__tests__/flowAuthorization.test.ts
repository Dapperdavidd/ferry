import {
  checkFlowConfiguration,
  checkFlowDisable,
  checkFlowPaymentAuthorization,
} from "@/utils/flowAuthorization";
import type { FlowDestination, TypedData } from "@/utils/apiClient";

const owner = "0x0000000000000000000000000000000000000001";
const other = "0x0000000000000000000000000000000000000002";
const NOW_MS = 1_700_000_000_000;
const EXPIRES_AT = new Date(NOW_MS + 5 * 60_000).toISOString();
const DEADLINE = String(Math.floor(Date.parse(EXPIRES_AT) / 1_000));
const destinations: FlowDestination[] = [
  { label: "Spendable", kind: "spendable", address: owner, basisPoints: 7000 },
  { label: "@bola", kind: "person", address: other, basisPoints: 3000 },
];
const typedData: TypedData = {
  domain: {
    name: "FerryFlow",
    version: "1",
    chainId: 10143,
    verifyingContract: other,
  },
  types: {
    ConfigureFlow: [
      { name: "owner", type: "address" },
      { name: "destinations", type: "address[]" },
      { name: "basisPoints", type: "uint256[]" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  },
  primaryType: "ConfigureFlow",
  message: {
    owner,
    destinations: [owner, other],
    basisPoints: ["7000", "3000"],
    nonce: "0",
    deadline: DEADLINE,
  },
};
const configurationExpected = {
  owner,
  destinations,
  chainId: 10143,
  verifyingContract: other,
  expiresAt: EXPIRES_AT,
  nowMs: NOW_MS,
};

describe("Flow typed-data checks", () => {
  it("accepts exactly the reviewed owner, network, addresses and percentages", () => {
    expect(checkFlowConfiguration(typedData, configurationExpected)).toBeNull();
  });

  it("rejects reordered percentages", () => {
    expect(
      checkFlowConfiguration(
        {
          ...typedData,
          message: { ...typedData.message, basisPoints: ["3000", "7000"] },
        },
        configurationExpected
      )
    ).toBe("percentage");
  });

  it("rejects a different signing contract even when the allocation matches", () => {
    expect(
      checkFlowConfiguration(typedData, {
        ...configurationExpected,
        verifyingContract: owner,
      })
    ).toBe("contract");
  });

  it("rejects altered declarations and long-lived configuration signatures", () => {
    expect(
      checkFlowConfiguration(
        {
          ...typedData,
          types: {
            ConfigureFlow: typedData.types.ConfigureFlow.map((field) =>
              field.name === "deadline" ? { ...field, type: "bytes32" } : field
            ),
          },
        },
        configurationExpected
      )
    ).toBe("type");

    const farExpiry = new Date(NOW_MS + 60 * 60_000).toISOString();
    expect(
      checkFlowConfiguration(
        {
          ...typedData,
          message: {
            ...typedData.message,
            deadline: String(Math.floor(Date.parse(farExpiry) / 1_000)),
          },
        },
        { ...configurationExpected, expiresAt: farExpiry }
      )
    ).toBe("authorization window");
  });

  it("checks disable separately from configure", () => {
    expect(
      checkFlowDisable(
        {
          ...typedData,
          types: {
            DisableFlow: [
              { name: "owner", type: "address" },
              { name: "nonce", type: "uint256" },
              { name: "deadline", type: "uint256" },
            ],
          },
          primaryType: "DisableFlow",
          message: { owner, nonce: "1", deadline: DEADLINE },
        },
        {
          owner,
          chainId: 10143,
          verifyingContract: other,
          expiresAt: EXPIRES_AT,
          nowMs: NOW_MS,
        }
      )
    ).toBeNull();
  });

  it("checks the recipient owner embedded in a Flow payment nonce", () => {
    const payment: TypedData = {
      domain: {
        name: "Agora Dollar",
        version: "1",
        chainId: 10143,
        verifyingContract: other,
      },
      types: {
        ReceiveWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "ReceiveWithAuthorization",
      message: {
        from: owner,
        to: other,
        value: "25000000",
        validAfter: "0",
        validBefore: DEADLINE,
        nonce: `${owner}${"ab".repeat(12)}`,
      },
    };
    expect(
      checkFlowPaymentAuthorization(payment, {
        from: owner,
        flowContract: other,
        recipientOwner: owner,
        amountRaw: "25000000",
        token: other,
        chainId: 10143,
        expiresAt: EXPIRES_AT,
        nowMs: NOW_MS,
      })
    ).toBeNull();
    expect(
      checkFlowPaymentAuthorization(payment, {
        from: owner,
        flowContract: other,
        recipientOwner: other,
        amountRaw: "25000000",
        token: other,
        chainId: 10143,
        expiresAt: EXPIRES_AT,
        nowMs: NOW_MS,
      })
    ).toBe("wrong recipient binding");

    const farExpiry = new Date(NOW_MS + 60 * 60_000).toISOString();
    expect(
      checkFlowPaymentAuthorization(
        {
          ...payment,
          message: {
            ...payment.message,
            validBefore: String(Math.floor(Date.parse(farExpiry) / 1_000)),
          },
        },
        {
          from: owner,
          flowContract: other,
          recipientOwner: owner,
          amountRaw: "25000000",
          token: other,
          chainId: 10143,
          expiresAt: farExpiry,
          nowMs: NOW_MS,
        }
      )
    ).toBe("authorization window");
  });
});
