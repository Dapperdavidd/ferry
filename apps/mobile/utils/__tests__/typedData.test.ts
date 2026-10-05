import { toSignable } from "@/utils/typedData";

describe("toSignable", () => {
  it("turns uint strings into bigints and leaves addresses and bytes alone", () => {
    const signable = toSignable({
      domain: {
        name: "Agora Dollar",
        version: "1",
        chainId: 10143,
        verifyingContract: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
      },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: "0x1",
        to: "0x2",
        value: "25000000",
        validAfter: "0",
        validBefore: "1800000000",
        nonce: "0xab",
      },
    });
    expect(signable.message).toEqual({
      from: "0x1",
      to: "0x2",
      value: 25000000n,
      validAfter: 0n,
      validBefore: 1800000000n,
      nonce: "0xab",
    });
  });

  it("turns uint array strings into bigint arrays", () => {
    const signable = toSignable({
      domain: { name: "FerryFlow", chainId: 10143 },
      types: {
        ConfigureFlow: [
          { name: "destinations", type: "address[]" },
          { name: "basisPoints", type: "uint256[]" },
        ],
      },
      primaryType: "ConfigureFlow",
      message: {
        destinations: ["0x1", "0x2"],
        basisPoints: ["7000", "3000"],
      },
    });
    expect(signable.message.basisPoints).toEqual([7000n, 3000n]);
  });
});
