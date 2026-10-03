import { checkAuthorization } from "@/utils/authorization";

const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const from = "0x50B240678777451BEfd67B7e8c3b4366482ba8F9";
const to = "0x8ba1f109551bD432803012645Ac136ddd64DBA72";

const typedData = {
  domain: {
    name: "Agora Dollar",
    version: "1",
    chainId: 10143,
    verifyingContract: AUSD,
  },
  types: { TransferWithAuthorization: [{ name: "from", type: "address" }] },
  primaryType: "TransferWithAuthorization",
  message: {
    from,
    to,
    value: "25000000",
    validAfter: "0",
    validBefore: "1800000000",
    nonce: "0x00",
  },
};
const expected = {
  from,
  to,
  amountRaw: "25000000",
  token: AUSD,
  chainId: 10143,
};

describe("checkAuthorization", () => {
  it("accepts typed data that matches the ticket, whatever the address case", () => {
    expect(
      checkAuthorization(typedData, { ...expected, to: to.toLowerCase() })
    ).toBeNull();
  });

  it("names the first field that differs", () => {
    expect(
      checkAuthorization(
        { ...typedData, message: { ...typedData.message, value: "25000001" } },
        expected
      )
    ).toBe("wrong amount");
    expect(
      checkAuthorization(
        { ...typedData, message: { ...typedData.message, to: from } },
        expected
      )
    ).toBe("wrong recipient");
    expect(
      checkAuthorization(
        { ...typedData, message: { ...typedData.message, from: to } },
        expected
      )
    ).toBe("wrong sender");
    expect(
      checkAuthorization(
        { ...typedData, domain: { ...typedData.domain, chainId: 143 } },
        expected
      )
    ).toBe("wrong chain");
    expect(
      checkAuthorization(
        {
          ...typedData,
          domain: { ...typedData.domain, verifyingContract: to },
        },
        expected
      )
    ).toBe("wrong token");
    expect(
      checkAuthorization(
        { ...typedData, primaryType: "ReceiveWithAuthorization" },
        expected
      )
    ).toBe("wrong message type");
  });
});
