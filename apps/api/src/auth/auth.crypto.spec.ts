import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { buildChallengeMessage, signatureMatches } from "./auth.crypto";

describe("auth challenge", () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const issuedAt = new Date("2026-10-04T10:00:00.000Z");
  const expiresAt = new Date("2026-10-04T10:05:00.000Z");
  const message = buildChallengeMessage({
    address: account.address,
    nonce: "abc123",
    issuedAt,
    expiresAt,
  });

  it("is readable and names the address and nonce", () => {
    expect(message).toContain("Sign in to Ferry");
    expect(message).toContain(`Address: ${account.address}`);
    expect(message).toContain("Nonce: abc123");
  });

  it("accepts the signer of the message", async () => {
    const signature = await account.signMessage({ message });
    expect(
      await signatureMatches({ address: account.address, message, signature }),
    ).toBe(true);
  });

  it("refuses another signer, another message, and garbage", async () => {
    const other = privateKeyToAccount(generatePrivateKey());
    const signature = await other.signMessage({ message });
    expect(
      await signatureMatches({ address: account.address, message, signature }),
    ).toBe(false);
    const own = await account.signMessage({ message });
    expect(
      await signatureMatches({
        address: account.address,
        message: message + " ",
        signature: own,
      }),
    ).toBe(false);
    expect(
      await signatureMatches({
        address: account.address,
        message,
        signature: "0x1234",
      }),
    ).toBe(false);
  });
});
