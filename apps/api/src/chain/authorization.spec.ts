import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  authorizationFrom,
  authorizationSignedBy,
  typedDataFor,
  type TokenDomain,
} from "./authorization";

const domain: TokenDomain = {
  name: "Agora Dollar",
  version: "1",
  chainId: 10143,
  verifyingContract: "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
};

describe("EIP-3009 authorizations", () => {
  const sender = privateKeyToAccount(generatePrivateKey());
  const auth = {
    from: sender.address,
    to: "0x8ba1f109551bD432803012645Ac136ddd64DBA72" as const,
    value: 50_000_000n,
    validAfter: 0n,
    validBefore: 1_800_000_000n,
    nonce: ("0x" + "11".repeat(32)) as `0x${string}`,
  };
  const typedData = typedDataFor(domain, "transfer", auth);

  it("serialises numbers as strings and round-trips them", () => {
    expect(typedData.message.value).toBe("50000000");
    expect(authorizationFrom(typedData)).toEqual(auth);
  });

  it("verifies the signature the app would produce", async () => {
    const signature = await sender.signTypedData({
      domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: auth,
    });
    expect(
      await authorizationSignedBy(typedData, signature, sender.address),
    ).toBe(true);
    const other = privateKeyToAccount(generatePrivateKey());
    expect(
      await authorizationSignedBy(typedData, signature, other.address),
    ).toBe(false);
  });

  it("refuses a signature over different terms", async () => {
    const signature = await sender.signTypedData({
      domain,
      types: typedData.types,
      primaryType: typedData.primaryType,
      message: { ...auth, value: 51_000_000n },
    });
    expect(
      await authorizationSignedBy(typedData, signature, sender.address),
    ).toBe(false);
  });

  it("receive authorizations use the receive type name", () => {
    const receive = typedDataFor(domain, "receive", auth);
    expect(receive.primaryType).toBe("ReceiveWithAuthorization");
    expect(Object.keys(receive.types)).toEqual(["ReceiveWithAuthorization"]);
  });
});
